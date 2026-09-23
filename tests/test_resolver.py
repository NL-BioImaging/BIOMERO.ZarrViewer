import json
from pathlib import Path

import pytest

from biomero_zarr_viewer.errors import AmbiguousStore, ObjectNotFound, UnsafePath
from biomero_zarr_viewer.resolver import (
    resolve_image_store,
    resolve_plate_store,
    resolve_well_store,
    zarr_ancestor,
)

from .fakes import FakeAnnotation, FakeConnection, FakeImage, FakeOriginalFile, FakeParent, FakeWellSample


def biomero_annotation(path):
    return FakeAnnotation(
        "biomero.import",
        {
            "UUID": "import-uuid",
            "Filepath": path,
            "DestinationType": "Dataset",
            "Files": repr([path]),
        },
    )


def managed_storage(monkeypatch, tmp_path, mount):
    mapping = tmp_path / "group-mappings.json"
    mapping.write_text(json.dumps({"13": {"folder": "Project A"}}), encoding="utf-8")
    monkeypatch.setenv("OMERO_BIOMERO_GROUP_MAPPINGS_FILE", str(mapping))
    (mount / "Project A").mkdir()


def test_zarr_ancestor_handles_nested_files():
    assert str(zarr_ancestor("/data/user/sample.ome.zarr/labels/nuclei/.zattrs")) == "/data/user/sample.ome.zarr"


def test_resolves_fileset_into_mounted_root(configure_storage):
    _, mount = configure_storage
    store = mount / "users/alice/sample.zarr"
    store.mkdir(parents=True)
    image = FakeImage(42, "sample.zarr", [FakeOriginalFile("/recorded/users/alice/sample.zarr/", ".zattrs")])
    resolved = resolve_image_store(FakeConnection(image), 42)
    assert resolved.path == store.resolve()
    assert str(resolved.relative) == "users/alice/sample.zarr"


def test_resolves_biomero_annotation_on_image(configure_storage):
    _, mount = configure_storage
    store = mount / "Project B/sample.ome.zarr"
    store.mkdir(parents=True)
    image = FakeImage(
        42,
        "sample",
        [],
        annotations=[biomero_annotation("/recorded/Project B/sample.ome.zarr")],
    )

    resolved = resolve_image_store(FakeConnection(image), 42)

    assert resolved.path == store.resolve()
    assert str(resolved.relative) == "Project B/sample.ome.zarr"


def test_resolves_biomero_annotation_from_plate_ancestry(configure_storage):
    _, mount = configure_storage
    store = mount / "plates/cells.ome.zarr"
    store.mkdir(parents=True)
    plate = FakeParent(9, "cells", [biomero_annotation("/recorded/plates/cells.ome.zarr")])
    well = FakeParent(8, parents=[plate])
    image = FakeImage(42, "A/1/0", [], parents=[well])

    resolved = resolve_image_store(FakeConnection(image), 42)

    assert resolved.path == store.resolve()
    assert resolved.recorded_files[-1].endswith("cells.ome.zarr/A/1/0")


def test_resolves_compact_canonical_plate_annotation(configure_storage, monkeypatch, tmp_path):
    _, mount = configure_storage
    managed_storage(monkeypatch, tmp_path, mount)
    canonical = mount / "Project A/canonical/cells.ome.zarr"
    canonical.mkdir(parents=True)
    annotation = FakeAnnotation(
        "biomero.zarr.plate-source",
        {
            "schema": "2", "storageRoot": "group-13-data",
            "relativePath": "canonical/cells.ome.zarr", "sourceObjectId": "9",
            "sourceGeneration": "1", "interchangeProfile": "ngff-0.4-zarr-v2",
            "imageCount": "1", "labelCount": "0",
        },
    )
    plate = FakeParent(9, annotations=[annotation])
    image = FakeImage(42, "A/1/0", [], parents=[plate])

    resolved = resolve_image_store(FakeConnection(image), 42)

    assert resolved.path == canonical.resolve()
    assert str(resolved.relative) == "Project A/canonical/cells.ome.zarr"


def test_resolves_shallow_labels_over_canonical_pixels(configure_storage, monkeypatch, tmp_path):
    source, mount = configure_storage
    managed_storage(monkeypatch, tmp_path, mount)
    canonical = mount / "Project A/canonical/cells.ome.zarr"
    canonical.mkdir(parents=True)
    shallow = mount / "Project A/results/cells.ome.zarr"
    label = shallow / "A/1/0/labels/nuclei"
    label.mkdir(parents=True)
    (shallow / ".biomero-shallow.json").write_text(json.dumps({
        "schema": 1, "model": "rfc8-shallow-copy",
        "workflowId": "00000000-0000-4000-8000-000000000001",
        "transferArtifact": "cells.ome.zarr",
        "interchangeProfile": "ngff-0.4-zarr-v2", "images": [{
            "imageNodePath": "A/1/0",
            "source": {"schema": 1, "storageRoot": "group-13-data", "relativePath": "canonical/cells.ome.zarr", "nodePath": "A/1/0", "sourceObjectId": 9, "sourceGeneration": 1, "interchangeProfile": "ngff-0.4-zarr-v2"},
            "labelNodePaths": ["A/1/0/labels/nuclei"],
            "labelComponents": [{"logicalNodePath": "A/1/0/labels/nuclei", "source": None}],
        }],
    }), encoding="utf-8")
    image = FakeImage(42, "A/1/0", [FakeOriginalFile(f"{source}/Project A/results/cells.ome.zarr/", ".zattrs")])

    resolved = resolve_image_store(FakeConnection(image), 42)

    assert resolved.shallow is True
    assert resolved.path == canonical.resolve()
    assert str(resolved.routes[0].logical) == "A/1/0/labels/nuclei"
    assert str(resolved.routes[0].physical) == "Project A/results/cells.ome.zarr/A/1/0/labels/nuclei"


def test_resolves_inherited_label_from_managed_node(configure_storage, monkeypatch, tmp_path):
    source, mount = configure_storage
    managed_storage(monkeypatch, tmp_path, mount)
    canonical = mount / "Project A/canonical/cells.ome.zarr"
    canonical.mkdir(parents=True)
    inherited = canonical / "A/1/0/labels/existing"
    inherited.mkdir(parents=True)
    shallow = mount / "Project A/results/cells.ome.zarr"
    shallow.mkdir(parents=True)
    logical = "A/1/0/labels/existing"
    (shallow / ".biomero-shallow.json").write_text(json.dumps({
        "schema": 1, "model": "rfc8-shallow-copy",
        "workflowId": "00000000-0000-4000-8000-000000000001",
        "transferArtifact": "cells.ome.zarr",
        "interchangeProfile": "ngff-0.4-zarr-v2", "images": [{
            "imageNodePath": "A/1/0",
            "source": {"schema": 1, "storageRoot": "group-13-data", "relativePath": "canonical/cells.ome.zarr", "nodePath": "A/1/0", "sourceObjectId": 9, "sourceGeneration": 1, "interchangeProfile": "ngff-0.4-zarr-v2"},
            "labelNodePaths": [logical],
            "labelComponents": [{
                "logicalNodePath": logical,
                "source": {
                    "storageRoot": "group-13-data",
                    "relativePath": "canonical/cells.ome.zarr",
                    "nodePath": logical,
                },
            }],
        }],
    }), encoding="utf-8")
    image = FakeImage(42, "A/1/0", [FakeOriginalFile(
        f"{source}/Project A/results/cells.ome.zarr/", ".zattrs"
    )])

    resolved = resolve_image_store(FakeConnection(image), 42)

    assert resolved.shallow is True
    assert resolved.path == canonical.resolve()
    assert str(resolved.routes[0].logical) == logical
    assert str(resolved.routes[0].physical) == (
        "Project A/canonical/cells.ome.zarr/A/1/0/labels/existing"
    )


def test_skips_wellsample_annotation_api_and_resolves_screen_ancestry(configure_storage):
    _, mount = configure_storage
    store = mount / "plates/cells.ome.zarr"
    store.mkdir(parents=True)
    screen = FakeParent(10, annotations=[biomero_annotation("/recorded/plates/cells.ome.zarr")])
    plate = FakeParent(9, parents=[screen])
    well = FakeParent(8, parents=[plate])
    sample = FakeWellSample(7, None, parents=[well])
    sample.listAnnotations = lambda ns=None: (_ for _ in ()).throw(NotImplementedError())
    image = FakeImage(42, "A/1/0", [], parents=[sample])
    sample.image = image

    resolved = resolve_image_store(FakeConnection(image), 42)

    assert resolved.path == store.resolve()
    assert resolved.recorded_files[-1].endswith("cells.ome.zarr/A/1/0")


def test_resolves_selected_plate_through_first_field(configure_storage):
    _, mount = configure_storage
    store = mount / "plates/cells.ome.zarr"
    store.mkdir(parents=True)
    screen = FakeParent(10, annotations=[biomero_annotation("/recorded/plates/cells.ome.zarr")])
    plate = FakeParent(9, parents=[screen])
    well = FakeParent(8, parents=[plate])
    image = FakeImage(42, "A/1/0", [], parents=[well])
    sample = FakeWellSample(7, image, parents=[well])
    well.parents = [plate]
    well.listChildren = lambda: [sample]
    plate.listChildren = lambda: [well]

    resolved = resolve_plate_store(FakeConnection(image=image, plate=plate), 9)

    assert resolved.image_id == 42
    assert resolved.path == store.resolve()


def test_resolves_selected_well_through_first_field(configure_storage):
    _, mount = configure_storage
    store = mount / "plates/cells.ome.zarr"
    store.mkdir(parents=True)
    plate = FakeParent(9, annotations=[biomero_annotation("/recorded/plates/cells.ome.zarr")])
    well = FakeParent(2351, parents=[plate])
    image = FakeImage(42, "A/1/0", [], parents=[well])
    sample = FakeWellSample(7, image, parents=[well])
    well.listChildren = lambda: [sample]

    resolved = resolve_well_store(FakeConnection(image=image, well=well), 2351)

    assert resolved.image_id == 42
    assert resolved.path == store.resolve()


def test_ignores_untrusted_annotation_shape(configure_storage):
    image = FakeImage(
        42,
        "sample",
        [],
        annotations=[FakeAnnotation("biomero.import", {"Filepath": "/recorded/sample.zarr"})],
    )
    with pytest.raises(Exception, match="not backed"):
        resolve_image_store(FakeConnection(image), 42)


def test_unreadable_image_is_not_found(configure_storage):
    with pytest.raises(ObjectNotFound):
        resolve_image_store(FakeConnection(), 99)


def test_rejects_multiple_store_roots(configure_storage):
    image = FakeImage(42, "ambiguous.zarr", [FakeOriginalFile("/recorded/a.zarr/", ".zattrs"), FakeOriginalFile("/recorded/b.zarr/", ".zattrs")])
    with pytest.raises(AmbiguousStore):
        resolve_image_store(FakeConnection(image), 42)


def test_rejects_source_outside_configured_root(configure_storage):
    image = FakeImage(42, "escape.zarr", [FakeOriginalFile("/elsewhere/escape.zarr/", ".zattrs")])
    with pytest.raises(UnsafePath):
        resolve_image_store(FakeConnection(image), 42)


def test_rejects_symlink_escape(configure_storage, tmp_path):
    _, mount = configure_storage
    outside = tmp_path / "outside.zarr"
    outside.mkdir()
    link = mount / "link.zarr"
    try:
        link.symlink_to(outside, target_is_directory=True)
    except OSError:
        pytest.skip("Creating directory symlinks is unavailable")
    image = FakeImage(42, "link.zarr", [FakeOriginalFile("/recorded/link.zarr/", ".zattrs")])
    with pytest.raises(UnsafePath):
        resolve_image_store(FakeConnection(image), 42)

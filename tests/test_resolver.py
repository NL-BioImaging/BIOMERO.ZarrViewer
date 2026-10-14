import json
from pathlib import Path

import pytest

from biomero_zarr_viewer.errors import AmbiguousStore, InvalidShallowManifest, ObjectNotFound, UnsafePath
from biomero_zarr_viewer import resolver
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


def test_resolves_schema_2_shallow_graph_bindings(configure_storage, monkeypatch, tmp_path):
    source, mount = configure_storage
    managed_storage(monkeypatch, tmp_path, mount)
    canonical = mount / "Project A/canonical/cells.ome.zarr"
    canonical.mkdir(parents=True)
    inherited = canonical / "labels/existing"
    inherited.mkdir(parents=True)
    shallow = mount / "Project A/results/cells.ome.zarr"
    local = shallow / "labels/nuclei"
    local.mkdir(parents=True)
    canonical_source = {
        "schema": 1,
        "storageRoot": "group-13-data",
        "relativePath": "canonical/cells.ome.zarr",
        "nodePath": ".",
        "sourceObjectId": 42,
        "sourceGeneration": 1,
        "interchangeProfile": "ngff-0.4-zarr-v2",
    }
    (shallow / ".biomero-shallow.json").write_text(json.dumps({
        "schema": 2,
        "format": "biomero-shallow-zarr",
        "workflowId": "00000000-0000-4000-8000-000000000001",
        "transferArtifact": "cells.ome.zarr",
        "interchangeProfile": "ngff-0.4-zarr-v2",
        "collection": {
            "name": "cells.ome.zarr",
            "images": [{"id": "image-0", "name": ".", "nodePath": "."}],
            "labels": [
                {"id": "label-0", "name": "labels/nuclei", "nodePath": "labels/nuclei", "sourceImageId": "image-0"},
                {"id": "label-1", "name": "labels/existing", "nodePath": "labels/existing", "sourceImageId": "image-0"},
            ],
        },
        "bindings": {
            "images": [{"nodeId": "image-0", "source": canonical_source, "returnedPixelIdentity": {}}],
            "labels": [
                {"nodeId": "label-0", "component": {"logicalNodePath": "labels/nuclei", "source": None}},
                {"nodeId": "label-1", "component": {
                    "logicalNodePath": "labels/existing",
                    "source": {
                        "storageRoot": "group-13-data",
                        "relativePath": "canonical/cells.ome.zarr",
                        "nodePath": "labels/existing",
                    },
                }},
            ],
        },
    }), encoding="utf-8")
    image = FakeImage(42, "cells", [FakeOriginalFile(
        f"{source}/Project A/results/cells.ome.zarr/", ".zattrs"
    )])

    resolved = resolve_image_store(FakeConnection(image), 42)

    assert resolved.shallow is True
    assert resolved.path == canonical.resolve()
    assert [(str(route.logical), str(route.physical)) for route in resolved.routes] == [
        ("labels/nuclei", "Project A/results/cells.ome.zarr/labels/nuclei"),
        ("labels/existing", "Project A/canonical/cells.ome.zarr/labels/existing"),
    ]


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


def _shallow_fixture(mount):
    canonical = mount / "canonical.zarr"
    canonical.mkdir()
    shallow = mount / "result.zarr"
    shallow.mkdir()
    manifest = {
        "schema": 1, "model": "rfc8-shallow-copy", "workflowId": "workflow",
        "transferArtifact": "result.zarr", "interchangeProfile": "ngff-0.4-zarr-v2",
        "images": [{"imageNodePath": ".", "labelComponents": [], "source": {
            "schema": 1, "storageRoot": "import-mount-data", "relativePath": "canonical.zarr",
            "nodePath": ".", "sourceObjectId": 42, "sourceGeneration": 1,
            "interchangeProfile": "ngff-0.4-zarr-v2",
        }}],
    }
    return shallow / resolver.SHALLOW_MANIFEST, json.dumps(manifest)


def test_accepts_shallow_manifest_larger_than_old_4_mib_limit(configure_storage):
    _, mount = configure_storage
    path, content = _shallow_fixture(mount)
    path.write_text(content + " " * (5 * 1024 * 1024), encoding="utf-8")
    assert resolver.MAX_SHALLOW_MANIFEST_BYTES == 100 * 1024 * 1024
    primary, routes = resolver._manifest_routes(Path("result.zarr"))
    assert str(primary) == "canonical.zarr"
    assert routes == ()


def test_manifest_size_boundary_and_oversize(configure_storage, monkeypatch):
    _, mount = configure_storage
    path, content = _shallow_fixture(mount)
    monkeypatch.setattr(resolver, "MAX_SHALLOW_MANIFEST_BYTES", 4096)
    path.write_text(content.ljust(4096), encoding="utf-8")
    assert resolver._manifest_routes(Path("result.zarr")) is not None
    with path.open("ab") as stream:
        stream.write(b" ")
    with pytest.raises(InvalidShallowManifest, match="size limit"):
        resolver._manifest_routes(Path("result.zarr"))


def test_rejects_real_100_mib_plus_one_without_reading_file(configure_storage):
    _, mount = configure_storage
    path, _ = _shallow_fixture(mount)
    with path.open("wb") as stream:
        stream.truncate(100 * 1024 * 1024 + 1)
    with pytest.raises(InvalidShallowManifest, match="100 MiB"):
        resolver._manifest_routes(Path("result.zarr"))


@pytest.mark.parametrize("kind", ["plate", "well"])
def test_container_stops_on_store_wide_manifest_error(monkeypatch, kind):
    images = [FakeImage(42, "A/1/0", []), FakeImage(43, "A/1/1", [])]
    well = FakeParent(8)
    well.listChildren = lambda: [FakeWellSample(i, image) for i, image in enumerate(images)]
    plate = FakeParent(9)
    plate.listChildren = lambda: [well]
    conn = FakeConnection(plate=plate, well=well)
    calls = []

    def invalid(_conn, image_id):
        calls.append(image_id)
        raise InvalidShallowManifest("The shallow manifest exceeds the 100 MiB size limit")

    monkeypatch.setattr(resolver, "resolve_image_store", invalid)
    resolve = resolve_plate_store if kind == "plate" else resolve_well_store
    with pytest.raises(InvalidShallowManifest):
        resolve(conn, 9 if kind == "plate" else 8)
    assert calls == ["42"]


def test_schema_2_label_binding_lookup_scales_linearly():
    class CountedLabel(dict):
        source_reads = 0

        def get(self, key, *args):
            if key == "sourceImageId":
                type(self).source_reads += 1
            return super().get(key, *args)

    images = [{"id": f"image-{i}", "nodePath": f"A/1/{i}"} for i in range(100)]
    labels = [CountedLabel(id=f"label-{i}", nodePath=f"A/1/{i}/labels/nuclei",
                          sourceImageId=f"image-{i}") for i in range(100)]
    manifest = {"collection": {"images": images, "labels": labels}, "bindings": {
        "images": [{"nodeId": image["id"], "source": {}} for image in images],
        "labels": [{"nodeId": label["id"], "component": {
            "logicalNodePath": label["nodePath"], "source": None}} for label in labels],
    }}
    result = resolver._schema_2_images(manifest)
    assert len(result) == len(images)
    assert result[-1]["labelComponents"][0]["logicalNodePath"] == labels[-1]["nodePath"]
    assert CountedLabel.source_reads <= 2 * len(labels)


def test_preprocessed_import_uses_imported_from_for_eligibility_and_resolution(configure_storage):
    _, mount = configure_storage
    store = mount / "cells/.processed/converted.ome.zarr"
    store.mkdir(parents=True)
    annotation = biomero_annotation("/recorded/cells/experiment.db")
    annotation.values["Imported_from"] = "/recorded/cells/.processed/converted.ome.zarr"
    plate = FakeParent(9, annotations=[annotation])
    well = FakeParent(8, parents=[plate])
    image = FakeImage(42, "B/1/0", [], parents=[well])
    conn = FakeConnection(image=image, plate=plate)
    assert resolver.plate_store_registered(conn, 9)
    assert resolver.image_store_registered(conn, 42)
    assert resolve_image_store(conn, 42).path == store.resolve()


def test_preprocessed_import_still_rejects_escape_from_mount(configure_storage):
    _, mount = configure_storage
    (mount.parent / "outside.ome.zarr").mkdir()
    annotation = biomero_annotation("/recorded/cells/experiment.db")
    annotation.values["Imported_from"] = "/recorded/../outside.ome.zarr"
    image = FakeImage(42, "field", [], annotations=[annotation])
    with pytest.raises(UnsafePath):
        resolve_image_store(FakeConnection(image=image), 42)


def test_plate_starts_at_first_physical_well_not_database_iteration_order(monkeypatch):
    first_image = FakeImage(42, "B/1/0", [])
    later_image = FakeImage(99, "K/24/0", [])
    first = FakeParent(10)
    first.getRow = lambda: 1
    first.getColumn = lambda: 0
    first.listChildren = lambda: [FakeWellSample(20, first_image)]
    later = FakeParent(9)
    later.getRow = lambda: 10
    later.getColumn = lambda: 23
    later.listChildren = lambda: [FakeWellSample(19, later_image)]
    plate = FakeParent(8)
    plate.listChildren = lambda: [later, first]
    monkeypatch.setattr(resolver, "resolve_image_store", lambda conn, image_id: int(image_id))
    assert resolve_plate_store(FakeConnection(plate=plate), 8) == 42

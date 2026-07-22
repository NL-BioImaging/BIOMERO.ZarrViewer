from pathlib import Path

import pytest

from biomero_zarr_viewer.errors import AmbiguousStore, ObjectNotFound, UnsafePath
from biomero_zarr_viewer.resolver import resolve_image_store, resolve_plate_store, zarr_ancestor

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

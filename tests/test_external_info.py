"""Standard OMERO CLI Zarr registration, without BIOMERO provenance."""

import json
from types import SimpleNamespace

import pytest
from django.test import RequestFactory

from biomero_zarr_viewer import resolver, views
from biomero_zarr_viewer.errors import InvalidShallowManifest, StoreNotFound, UnsafePath

from .conftest import write_v2_image, write_v3_image
from .fakes import (
    FakeAnnotation, FakeConnection, FakeExternalInfo, FakeImage,
    FakeImageModel, FakeOriginalFile, FakeParent, FakeWellSample,
)


def connection(path, **kwargs):
    image = FakeImage(42, "CLI-imported image", [], external_info=FakeExternalInfo(path, **kwargs))
    return FakeConnection(image=image)


def request(url, token=None):
    req = RequestFactory().get(url, **({"HTTP_X_OMERO_ZARR_CONTEXT": token} if token else {}))
    req.session = {"active_group": 13}
    return req


@pytest.mark.parametrize("entity_id", [3, 4])
@pytest.mark.parametrize("suffix", ["sample.ome.zarr", "sample-without-extension", "plate.ome.zarr/B/2/0"])
def test_resolves_exact_external_group(configure_storage, entity_id, suffix):
    _, mount = configure_storage
    group = mount / suffix
    group.mkdir(parents=True)
    conn = connection(f"/recorded/{suffix}", entity_id=entity_id)
    assert resolver.image_store_registered(conn, 42)
    store = resolver.resolve_image_store(conn, 42)
    assert store.path == group.resolve()
    assert str(store.relative) == suffix
    assert store.routes == ()
    assert not store.shallow


def test_eligibility_does_not_read_storage(configure_storage, monkeypatch):
    conn = connection("/recorded/not-mounted")
    monkeypatch.setattr(resolver, "_map_recorded_root", lambda *_: pytest.fail("eligibility read storage"))
    assert resolver.image_store_registered(conn, 42)


def test_loads_external_info_through_readable_image_in_active_context(configure_storage):
    _, mount = configure_storage
    (mount / "sample").mkdir()
    conn = connection("unused", loaded=False)
    conn.SERVICE_OPTS = {"omero.group": "13"}
    calls = []

    def find(query, params, options):
        calls.append((query, params, options))
        return FakeImageModel(FakeExternalInfo("/recorded/sample"))

    conn.getQueryService = lambda: SimpleNamespace(findByQuery=find)
    assert resolver.resolve_image_store(conn, 42).path == (mount / "sample").resolve()
    assert len(calls) == 1
    assert "join fetch i.details.externalInfo" in calls[0][0]
    assert "i.id = 42" in calls[0][0]
    assert calls[0][2] is conn.SERVICE_OPTS


def test_unreadable_image_does_not_query_external_info(configure_storage):
    conn = connection("/recorded/sample")
    conn.image = None
    conn.getQueryService = lambda: pytest.fail("queried unreadable image")
    assert not resolver.image_store_registered(conn, 42)
    assert views.capabilities(request("/api/images/42/capabilities/"), 42, conn=conn).status_code == 404


def test_permission_change_while_loading_external_info_is_not_bypassed(configure_storage):
    conn = connection("unused", loaded=False)
    conn.SERVICE_OPTS = {"omero.group": "13"}
    conn.getQueryService = lambda: SimpleNamespace(findByQuery=lambda *_: None)
    assert not resolver.image_store_registered(conn, 42)
    with pytest.raises(StoreNotFound):
        resolver.resolve_image_store(conn, 42)


@pytest.mark.parametrize("kwargs", [{"entity_type": "unrelated:type"}, {"entity_id": 2}, {"entity_id": 5}])
def test_ignores_unrelated_external_info(configure_storage, kwargs):
    conn = connection("/recorded/sample", **kwargs)
    assert not resolver.image_store_registered(conn, 42)
    with pytest.raises(StoreNotFound):
        resolver.resolve_image_store(conn, 42)


@pytest.mark.parametrize("path", [
    "http://example.test/sample.zarr", "s3://bucket/sample.zarr", "file:///recorded/sample.zarr",
    "relative/sample.zarr", "/other/sample.zarr", "/recorded-other/sample.zarr",
    "/recorded/../sample.zarr", "/recorded/a/../../sample.zarr", "//host/recorded/sample.zarr",
    "/recorded/sample\x00.zarr",
])
def test_rejects_remote_or_unsafe_external_paths(configure_storage, path):
    conn = connection(path)
    assert not resolver.image_store_registered(conn, 42)
    with pytest.raises(UnsafePath):
        resolver.resolve_image_store(conn, 42)


def test_missing_external_group_has_stable_error(configure_storage):
    with pytest.raises(StoreNotFound, match="not mounted"):
        resolver.resolve_image_store(connection("/recorded/missing"), 42)


def test_external_group_symlink_cannot_escape_mount(configure_storage):
    _, mount = configure_storage
    outside = mount.parent / "outside"
    outside.mkdir()
    (mount / "escape").symlink_to(outside, target_is_directory=True)
    with pytest.raises(UnsafePath):
        resolver.resolve_image_store(connection("/recorded/escape"), 42)


@pytest.mark.parametrize("kind", ["fileset", "import_annotation", "canonical_annotation"])
def test_existing_biomero_registrations_keep_precedence(configure_storage, kind):
    _, mount = configure_storage
    (mount / "biomero.zarr").mkdir()
    conn = connection("/recorded/unrelated-external.zarr")
    if kind == "fileset":
        conn.image.fileset.files = [FakeOriginalFile("/recorded/biomero.zarr/", ".zattrs")]
    elif kind == "import_annotation":
        conn.image.annotations = [FakeAnnotation("biomero.import", {
            "Filepath": "/recorded/biomero.zarr", "UUID": "import-uuid", "Files": "1", "DestinationType": "Dataset",
        })]
    else:
        conn.image.annotations = [FakeAnnotation("biomero.zarr.plate-source", {
            "schema": "2", "sourceObjectId": "42", "sourceGeneration": "1", "imageCount": "1",
            "labelCount": "0", "interchangeProfile": "ngff-0.4-zarr-v2",
            "storageRoot": "import-mount-data", "relativePath": "biomero.zarr",
        })]
    assert resolver.resolve_image_store(conn, 42).path == (mount / "biomero.zarr").resolve()


def test_external_info_does_not_hide_invalid_biomero_shallow_manifest(configure_storage):
    _, mount = configure_storage
    result = mount / "result.zarr"
    result.mkdir()
    (result / ".biomero-shallow.json").write_text("{", encoding="utf-8")
    (mount / "otherwise-valid-external.zarr").mkdir()
    conn = connection("/recorded/otherwise-valid-external.zarr")
    conn.image.fileset.files = [FakeOriginalFile("/recorded/result.zarr/", ".zattrs")]
    with pytest.raises(InvalidShallowManifest):
        resolver.resolve_image_store(conn, 42)


def test_plate_and_well_eligibility_accept_external_info(configure_storage):
    conn = connection("/recorded/plate.zarr/B/2/0")
    well = FakeParent(8)
    well.listChildren = lambda: [FakeWellSample(7, conn.image)]
    plate = FakeParent(9)
    plate.listChildren = lambda: [well]
    conn.well, conn.plate = well, plate
    assert resolver.well_store_registered(conn, 8)
    assert resolver.plate_store_registered(conn, 9)


@pytest.mark.parametrize("version,write,metadata,chunk", [
    ("0.4", write_v2_image, ".zattrs", "0/0.0.0"),
    ("0.5", write_v3_image, "zarr.json", "0/c/0/0/0"),
])
def test_capabilities_and_signed_data_for_external_group(configure_storage, version, write, metadata, chunk):
    _, mount = configure_storage
    root = mount / "container.zarr/series/1"
    write(root)
    if version == "0.5":
        (root / chunk).parent.mkdir(parents=True)
        (root / chunk).write_bytes(b"pixels")
    conn = connection("/recorded/container.zarr/series/1", entity_id=3 if version == "0.4" else 4)
    response = views.capabilities(request("/api/images/42/capabilities/"), 42, conn=conn)
    assert response.status_code == 200
    payload = json.loads(response.content)
    assert payload["ngff_version"] == version
    assert payload["initial_path"] == "."
    assert "recorded" not in response.content.decode()
    token = payload["store"]["context"]
    for key in [metadata, chunk]:
        response = views.data(request("/data/", token), 42, key, conn=conn)
        assert response.status_code == 200
        assert response["X-Accel-Redirect"].startswith("/_protected_zarr/container.zarr/series/1/")
    response = views.data(request("/data/", token), 42, "../0/zarr.json", conn=conn)
    assert response.status_code == 400

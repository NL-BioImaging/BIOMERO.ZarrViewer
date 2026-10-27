"""A shallow result's identity must not follow its redirected pixel source."""

import json
import shutil
from io import BytesIO

import pytest
from PIL import Image

from biomero_zarr_viewer.metadata import read_store_uuid
from biomero_zarr_viewer.errors import InvalidMetadata
from biomero_zarr_viewer.resolver import resolve_image_store
from biomero_zarr_viewer.views import capabilities, plate_capabilities, render_png, render_svg, roi_png
from .conftest import write_json, write_v2_image, write_v3_image
from .fakes import FakeConnection, FakeImage, FakeOriginalFile, FakeParent, FakeWellSample
from .test_views import _request, _write_renderable_store

RESULT_UUID = "1a7792d6-f8d0-430d-b495-45975f02be82"


@pytest.mark.parametrize("writer", [write_v2_image, write_v3_image])
def test_common_identity_for_an_unknown_workflow(tmp_path, writer):
    from biomero_zarr_viewer.metadata import inspect_store

    root = writer(tmp_path / "new-workflow.zarr")
    path = root / (".zattrs" if writer is write_v2_image else "zarr.json")
    document = json.loads(path.read_text())
    attrs = document if writer is write_v2_image else document["attributes"]
    attrs.update({"biomero": {"result": {"schema_version": 1, "output_store_uuid": RESULT_UUID.upper()}},
                  "never_seen_before": {"version": "1.0"},
                  "citrackastra": {"output_store_uuid": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}})
    write_json(path, document)
    assert read_store_uuid(root) == RESULT_UUID
    assert inspect_store(root)["store_uuid"] == RESULT_UUID


@pytest.mark.parametrize("identity", [None, "", "bad"])
def test_common_identity_never_falls_back_to_inherited_producers(configure_storage, identity):
    _, mount = configure_storage
    conn, root = shallow_connection(mount, 2)
    write_json(root / ".zattrs", {"biomero": {"result": {"schema_version": 1, "output_store_uuid": identity}},
                                "citrackastra": {"output_store_uuid": RESULT_UUID},
                                "cisegmentation": {"output_store_uuid": RESULT_UUID}})
    response = capabilities(_request("/"), 42, conn=conn)
    assert response.status_code == (422 if identity == "bad" else 200)
    if identity != "bad":
        assert json.loads(response.content)["store"]["uuid"] is None


@pytest.mark.parametrize("result", [None, [], {}, {"schema_version": True}, {"schema_version": "1"},
                                   {"schema_version": 2, "output_store_uuid": RESULT_UUID}])
def test_malformed_or_future_contract_is_not_treated_as_legacy(tmp_path, result):
    write_json(tmp_path / ".zattrs", {"biomero": {"result": result},
                                      "cisegmentation": {"output_store_uuid": RESULT_UUID}})
    with pytest.raises(InvalidMetadata):
        read_store_uuid(tmp_path)


def test_other_biomero_metadata_does_not_disable_legacy_identity(tmp_path):
    write_json(tmp_path / ".zattrs", {"biomero": {"other": "metadata"},
                                      "cisegmentation": {"output_store_uuid": RESULT_UUID}})
    assert read_store_uuid(tmp_path) == RESULT_UUID


@pytest.mark.parametrize("shallow", [False, True])
def test_tracking_identity_overrides_inherited_segmentation_identity(configure_storage, shallow):
    _, mount = configure_storage
    if shallow:
        conn, root = shallow_connection(mount, 2)
    else:
        root = write_v2_image(mount / "tracking.zarr")
        conn = FakeConnection(image=FakeImage(42, ".", [FakeOriginalFile("/recorded/tracking.zarr/", ".zattrs")]))
    attrs = json.loads((root / ".zattrs").read_text())
    attrs.update(cisegmentation={"output_store_uuid": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"},
                 citrackastra={"output_store_uuid": RESULT_UUID})
    write_json(root / ".zattrs", attrs)
    response = capabilities(_request("/"), 42, conn=conn)
    assert response.status_code == 200
    assert json.loads(response.content)["store"]["uuid"] == RESULT_UUID


@pytest.mark.parametrize("identity", [None, "", "bad"])
def test_tracking_identity_never_falls_back_to_earlier_segmentation(configure_storage, identity):
    _, mount = configure_storage
    conn, root = shallow_connection(mount, 2)
    write_json(root / ".zattrs", {"cisegmentation": {"output_store_uuid": RESULT_UUID},
                                "citrackastra": {"output_store_uuid": identity}})
    response = capabilities(_request("/"), 42, conn=conn)
    if identity == "bad":
        assert response.status_code == 422
        assert json.loads(response.content)["error"]["code"] == "invalid_ome_zarr_metadata"
    else:
        assert response.status_code == 200
        assert json.loads(response.content)["store"]["uuid"] is None


def test_tracking_render_still_rejects_an_inherited_source_uuid(configure_storage):
    _, mount = configure_storage
    conn, root = shallow_connection(mount, 2)
    write_json(root / ".zattrs", {"citrackastra": {"output_store_uuid": RESULT_UUID}})
    panel = {"field": ".", "roi": [1, 1, 7, 7], "sourceChannels": [1], "t": 1, "z": 1, "overlays": []}
    def request(identity):
        return _request("/", method="post", data=json.dumps({"storeUuid": identity, "panels": [panel]}), content_type="application/json")
    assert render_png(request(RESULT_UUID), 42, conn=conn).status_code == 200
    mismatch = render_png(request("3935615d-a18d-41d8-af04-e63cfec3a46c"), 42, conn=conn)
    assert mismatch.status_code == 409
    assert json.loads(mismatch.content)["error"]["code"] == "store_uuid_mismatch"


def shallow_connection(mount, schema, *, plate=False, labels=True):
    canonical = mount / "canonical.zarr"
    if plate:
        write_v2_image(canonical, plate=True, store_uuid="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
        field, names = "A/1/0", ["nuclei"]
    else:
        _write_renderable_store(canonical)
        field, names = ".", ["cells", "foci"]
    shallow = mount / "result.zarr"
    shallow.mkdir()
    paths = [f"{field}/labels/{name}".removeprefix("./") for name in names] if labels else []
    for path in paths:
        shutil.copytree(canonical / path, shallow / path)
    shutil.rmtree(canonical / field / "labels")
    write_json(shallow / ".zattrs", {"cisegmentation": {"output_store_uuid": RESULT_UUID}})
    source = {"schema": 1, "storageRoot": "import-mount-data", "relativePath": "canonical.zarr",
              "nodePath": field, "sourceObjectId": 42, "sourceGeneration": 1,
              "interchangeProfile": "ngff-0.4-zarr-v2"}
    components = [{"logicalNodePath": path, "source": None} for path in paths]
    manifest = {"schema": schema, "workflowId": "workflow", "transferArtifact": "result.zarr",
                "interchangeProfile": "ngff-0.4-zarr-v2"}
    if schema == 1:
        manifest.update(model="rfc8-shallow-copy", images=[{
            "imageNodePath": field, "source": source, "labelComponents": components}])
    else:
        manifest.update(format="biomero-shallow-zarr", collection={
            "images": [{"id": "image", "nodePath": field}],
            "labels": [{"id": str(i), "nodePath": path, "sourceImageId": "image"}
                       for i, path in enumerate(paths)]}, bindings={
            "images": [{"nodeId": "image", "source": source}],
            "labels": [{"nodeId": str(i), "component": component}
                       for i, component in enumerate(components)]})
    write_json(shallow / ".biomero-shallow.json", manifest)
    image = FakeImage(42, field, [FakeOriginalFile("/recorded/result.zarr/", ".zattrs")])
    well = FakeParent(8)
    well.listChildren = lambda: [FakeWellSample(7, image)]
    parent = FakeParent(9)
    parent.listChildren = lambda: [well]
    return FakeConnection(image=image, plate=parent), shallow


@pytest.mark.parametrize("schema", [1, 2])
@pytest.mark.parametrize("plate", [False, True])
@pytest.mark.parametrize("labels", [False, True])
def test_result_identity_survives_pixel_redirection(configure_storage, schema, plate, labels):
    _, mount = configure_storage
    conn, shallow = shallow_connection(mount, schema, plate=plate, labels=labels)
    resolved = resolve_image_store(conn, 42)
    assert resolved.path == (mount / "canonical.zarr").resolve()
    assert resolved.identity_path == shallow.resolve()
    endpoint, object_id = (plate_capabilities, 9) if plate else (capabilities, 42)
    response = endpoint(_request("/"), object_id, conn=conn)
    assert response.status_code == 200
    payload = json.loads(response.content)
    assert payload["store"]["uuid"] == RESULT_UUID
    assert payload["store"]["name"] == "result.zarr"
    assert len(payload["labels"]) == (1 if plate else 2) * labels


@pytest.mark.parametrize("endpoint", [render_png, render_svg, roi_png])
@pytest.mark.parametrize("common_contract", [False, True])
def test_render_uses_result_uuid_and_rejects_pixel_source_uuid(configure_storage, endpoint, common_contract):
    _, mount = configure_storage
    conn, root = shallow_connection(mount, 2)
    if common_contract:
        write_json(root / ".zattrs", {"biomero": {"result": {"schema_version": 1, "output_store_uuid": RESULT_UUID}}})
    recipe = {"storeUuid": RESULT_UUID, "panels": [{"field": ".", "roi": [1, 1, 7, 7],
              "sourceChannels": [1], "t": 1, "z": 1, "overlays": [{
                  "labelPath": "labels/cells", "values": [7], "mode": "outline", "color": "#FFFF00"}]}]}
    def request(uuid):
        if endpoint is roi_png:
            return _request(f"/?storeUuid={uuid}&roi=1,1,7,7&sourceChannels=1&t=1&z=1&labelPath=labels/cells&labelValue=7")
        return _request("/", method="post", data=json.dumps({**recipe, "storeUuid": uuid}), content_type="application/json")
    response = endpoint(request(RESULT_UUID), 42, conn=conn)
    assert response.status_code == 200
    if endpoint is render_svg:
        assert b"<svg" in response.content
    else:
        assert Image.open(BytesIO(response.content)).width >= 6
    mismatch = endpoint(request("3935615d-a18d-41d8-af04-e63cfec3a46c"), 42, conn=conn)
    assert mismatch.status_code == 409
    assert json.loads(mismatch.content)["error"]["code"] == "store_uuid_mismatch"


@pytest.mark.parametrize("metadata", [None, {}, {"cisegmentation": {"output_store_uuid": None}}])
def test_missing_result_identity_never_inherits_source_uuid(configure_storage, metadata):
    _, mount = configure_storage
    conn, shallow = shallow_connection(mount, 2)
    if metadata is None:
        (shallow / ".zattrs").unlink()
    else:
        write_json(shallow / ".zattrs", metadata)
    response = capabilities(_request("/"), 42, conn=conn)
    assert response.status_code == 200
    assert json.loads(response.content)["store"]["uuid"] is None


def test_invalid_result_uuid_is_not_hidden_by_valid_source(configure_storage):
    _, mount = configure_storage
    conn, shallow = shallow_connection(mount, 2)
    write_json(shallow / ".zattrs", {"cisegmentation": {"output_store_uuid": "bad"}})
    response = capabilities(_request("/"), 42, conn=conn)
    assert response.status_code == 422
    assert json.loads(response.content)["error"]["code"] == "invalid_ome_zarr_metadata"


def test_result_identity_changes_binding_digest(configure_storage):
    _, mount = configure_storage
    conn, shallow = shallow_connection(mount, 2, labels=False)
    before = json.loads(capabilities(_request("/"), 42, conn=conn).content)
    write_json(shallow / ".zattrs", {"cisegmentation": {"output_store_uuid": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}})
    after = json.loads(capabilities(_request("/"), 42, conn=conn).content)
    assert before["store"]["binding_digest"] != after["store"]["binding_digest"]


def test_composite_export_keeps_cell_and_foci_planes_distinct(configure_storage):
    import numpy as np

    _, mount = configure_storage
    conn, _ = shallow_connection(mount, 2)
    recipe = {"storeUuid": RESULT_UUID, "panels": [{"field": ".", "roi": [1, 1, 7, 7],
              "sourceChannels": [1], "t": 1, "z": 1, "overlays": [
                  {"labelPath": "labels/cells", "values": [7], "mode": "outline", "color": "#FFFF00"},
                  {"labelPath": "labels/foci", "values": [332], "mode": "fill", "opacity": 1, "color": "#FF00FF"}]}]}
    response = render_png(_request("/", method="post", data=json.dumps(recipe),
                                  content_type="application/json"), 42, conn=conn)
    assert response.status_code == 200
    pixels = np.asarray(Image.open(BytesIO(response.content)))[:6, :6]
    assert tuple(pixels[1, 1]) == (255, 0, 255), "Focus 332 must use its own label store"
    assert np.any(np.all(pixels == (255, 255, 0), axis=2)), "Cell outline must remain visible"


def test_reads_v3_identity_without_pixel_metadata(tmp_path):
    write_json(tmp_path / "zarr.json", {"zarr_format": 3, "node_type": "group",
               "attributes": {"cisegmentation": {"output_store_uuid": RESULT_UUID}}})
    assert read_store_uuid(tmp_path) == RESULT_UUID
    write_json(tmp_path / "zarr.json", {"zarr_format": 3, "node_type": "group", "attributes": []})
    with pytest.raises(InvalidMetadata):
        read_store_uuid(tmp_path)


@pytest.mark.parametrize("location_attribute", ["path", "root", None])
def test_array_cache_distinguishes_stores_with_identical_array_paths(location_attribute):
    from types import SimpleNamespace
    from biomero_zarr_viewer.roi import _cached_array

    class Group:
        path = ""

        def __init__(self, location, value):
            self.store = SimpleNamespace(**{location_attribute: location}) if location_attribute else SimpleNamespace()
            self.value = value
            self.reads = 0

        def __getitem__(self, path):
            assert path == "0"
            self.reads += 1
            return self.value

    cells, foci = Group("cells", 7), Group("foci", 332)
    cache = {}
    for _ in range(2):
        assert _cached_array(cells, "0", cache) == 7
        assert _cached_array(foci, "0", cache) == 332
    assert (cells.reads, foci.reads) == (1, 1)

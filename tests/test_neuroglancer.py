import json
import struct
from urllib.parse import urlencode

import numpy as np
import pytest

from biomero_zarr_viewer import neuroglancer as ng, volume_cache as cache
from biomero_zarr_viewer.errors import UnsupportedStore
from biomero_zarr_viewer.tokens import make_read_context
from .test_views import _request
from .fakes import FakeConnection
from .zarr_helpers import write_volume_group


def test_spatial_transform_composes_dataset_then_global_transforms_by_named_axis():
    multi = {"axes": [{"name": "z", "unit": "nanometer"}, {"name": "x", "unit": "micrometer"}, {"name": "y", "unit": "micrometer"}],
             "coordinateTransformations": [{"type": "scale", "scale": [2, 2, 2]}, {"type": "translation", "translation": [3, 3, 3]}]}
    axes, scale, offset = ng.spatial_transform(multi, {"coordinateTransformations": [{"type": "scale", "scale": [200, .3, .4]}, {"type": "translation", "translation": [1, 1, 1]}]})
    assert axes == ["z", "x", "y"]
    assert scale == [600, 800, 400]
    assert offset == [5000, 5000, 5]
    with pytest.raises(UnsupportedStore):
        ng.spatial_transform({"axes": ["z", "y", "x"]}, {"coordinateTransformations": []})


def test_label_mesh_preserves_physical_bounds_and_closes_edge_objects():
    data = np.zeros((6, 7, 8), dtype=np.uint32)
    data[0:3, 2:5, 3:7] = 4000000001
    payload = ng.mesh_bytes(data, 4000000001, [100, 200, 500])
    count, = struct.unpack("<I", payload[:4])
    vertices = np.frombuffer(payload, dtype="<f4", count=count * 3, offset=4).reshape(-1, 3)
    faces = np.frombuffer(payload, dtype="<u4", offset=4 + count * 12).reshape(-1, 3)
    np.testing.assert_allclose(vertices.min(axis=0), [300, 400, 0])
    np.testing.assert_allclose(vertices.max(axis=0), [700, 1000, 1500])
    assert faces.max() < count
    assert ng.mesh_bytes(data, 12, [100, 200, 500]) == struct.pack("<I", 0)


@pytest.fixture(params=["uint64", "int8"])
def scene(configure_storage, tmp_path, monkeypatch, request, zarr_format):
    _, mount = configure_storage
    monkeypatch.setenv("BIOMERO_ZARR_CACHE_DIR", str(tmp_path / "cache"))
    monkeypatch.setenv("BIOMERO_ZARR_CACHE_MAX_BYTES", "100000000")
    monkeypatch.setattr(cache._pool, "submit", lambda function, *args: function(*args))
    pixels = np.arange(1 * 6 * 7 * 8, dtype=np.uint16).reshape(1, 6, 7, 8)
    labels = np.zeros_like(pixels, dtype=request.param)
    labels[:, 1:4, 2:5, 3:7] = 2**53 + 17 if request.param == "uint64" else 61
    attrs = {"version": "0.5", "multiscales": [{"axes": [{"name": "c"}] + [{"name": a, "unit": "micrometer"} for a in "zyx"],
              "datasets": [{"path": "0", "coordinateTransformations": [{"type": "scale", "scale": [1, .5, .2, .1]}]}]}]}
    for path, values in [("image.zarr", pixels), ("image.zarr/labels/0", labels)]:
        write_volume_group(mount / path, values, (1, 2, 7, 8), attrs, zarr_format)
    conn = FakeConnection()
    token, _ = make_read_context(_request("/"), conn, 42, "image.zarr")
    request = _request("/?" + urlencode({"channels": "[0]", "labels": json.dumps([{"path": "labels/0"}])}), token=token)
    response = ng.prepare(request, 42, conn=conn)
    assert response.status_code == 200, response.content
    prepared = json.loads(response.content)
    context_id = prepared["url"].strip("/").split("/")[-1]
    return request.session, context_id, conn, token, prepared, pixels


def get_data(scene, key, conn=None, session=None, image_id=42):
    saved, context_id, owner, _, _, _ = scene
    request = _request("/")
    request.session = saved if session is None else session
    return ng.data(request, image_id, context_id, key, conn=conn or owner)


def test_native_chunks_and_meshes_require_the_authorized_session(scene):
    session, _, _, _, prepared, pixels = scene
    assert prepared["status"] == "ready"
    segment = prepared["sources"]["label-0"]["segments"][0]
    assert segment in [str(2**53 + 17), "61"]
    assert "token" not in prepared and "store" not in prepared
    info = json.loads(get_data(scene, "image-0/info").content)
    assert info["scales"][0]["resolution"] == [100, 200, 500]
    response = get_data(scene, "image-0/0/0-8_0-7_0-6")
    np.testing.assert_array_equal(np.frombuffer(response.content, dtype="<u2").reshape(6, 7, 8), pixels[0])
    manifest = get_data(scene, f"label-0/mesh/{segment}:0")
    assert json.loads(manifest.content) == {"fragments": [segment]}
    mesh = get_data(scene, f"label-0/mesh/{segment}")
    assert mesh.status_code == 200 and len(mesh.content) > 4
    assert get_data(scene, "image-0/info", session={"active_group": 13}).status_code == 401
    assert get_data(scene, "image-0/info", conn=FakeConnection(user_id=8)).status_code == 403
    assert get_data(scene, "image-0/info", image_id=43).status_code == 403
    assert get_data(scene, "image-0/0/0-800_0-7_0-6").status_code == 400
    assert get_data(scene, "label-0/mesh/99").status_code == 404
    assert get_data(scene, "../outside").status_code == 404


def test_preparation_rejects_unsafe_paths_and_missing_authorization(scene):
    _, _, conn, token, _, _ = scene
    assert ng.prepare(_request("/"), 42, conn=conn).status_code == 401
    assert ng.prepare(_request("/?field=../outside", token=token), 42, conn=conn).status_code == 400
    assert ng.prepare(_request("/?channels=not-json", token=token), 42, conn=conn).status_code == 400

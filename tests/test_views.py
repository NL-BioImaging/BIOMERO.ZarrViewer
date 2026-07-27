import json
from io import BytesIO

from django.test import RequestFactory
import numpy as np
from PIL import Image
import zarr

from biomero_zarr_viewer.tokens import make_read_context
from biomero_zarr_viewer.views import (
    capabilities,
    data,
    plate_capabilities,
    roi_png,
    viewer,
)

from .conftest import write_v2_image
from .fakes import FakeConnection, FakeImage, FakeOriginalFile, FakeParent, FakeWellSample


def _request(url, group=13, token=None, method="get"):
    headers = {"HTTP_X_OMERO_ZARR_CONTEXT": token} if token else {}
    request = getattr(RequestFactory(), method)(url, **headers)
    request.session = {"active_group": group}
    return request


def _connection(store_name="sample.zarr"):
    image = FakeImage(42, store_name, [FakeOriginalFile(f"/recorded/{store_name}/", ".zattrs")])
    return FakeConnection(image)


def test_capability_contract(configure_storage):
    _, mount = configure_storage
    store_uuid = "3935615d-a18d-41d8-af04-e63cfec3a46c"
    write_v2_image(mount / "sample.zarr", store_uuid=store_uuid)
    response = capabilities(_request("/api/images/42/capabilities/"), 42, conn=_connection())
    payload = json.loads(response.content)
    assert response.status_code == 200
    assert payload["schema_version"] == 1
    assert payload["supported"] is True
    assert payload["store"]["url"].endswith("/data/images/42/")
    assert payload["store"]["context"]
    assert payload["store"]["uuid"] == store_uuid
    assert payload["store"]["roi_url"].endswith("/api/images/42/roi.png")
    assert "recorded" not in response.content.decode()


def test_capability_hides_unreadable_image(configure_storage):
    response = capabilities(_request("/api/images/1/capabilities/"), 1, conn=FakeConnection())
    assert response.status_code == 404
    assert json.loads(response.content)["error"]["code"] == "image_not_found"


def test_plate_capability_and_viewer_redirect(configure_storage):
    _, mount = configure_storage
    write_v2_image(mount / "plate.zarr", plate=True)
    image = FakeImage(42, "A/1/0", [FakeOriginalFile("/recorded/plate.zarr/A/1/0/", ".zattrs")])
    sample = FakeWellSample(7, image)
    well = FakeParent(8)
    well.listChildren = lambda: [sample]
    plate = FakeParent(9)
    plate.listChildren = lambda: [well]
    conn = FakeConnection(image=image, plate=plate)

    response = plate_capabilities(_request("/api/plates/9/capabilities/"), 9, conn=conn)
    payload = json.loads(response.content)
    assert response.status_code == 200
    assert payload["kind"] == "plate"
    assert payload["image"]["id"] == 42

    redirect_request = _request("/?plate=9")
    redirect_request.GET = redirect_request.GET.copy()
    redirect_request.GET["plate"] = "9"
    redirect = viewer(redirect_request, conn=conn)
    assert redirect.status_code == 302
    assert redirect["Location"].endswith("?image=42")


def test_data_uses_internal_redirect_without_body(configure_storage):
    _, mount = configure_storage
    write_v2_image(mount / "sample.zarr")
    conn = _connection()
    token, _ = make_read_context(_request("/"), conn, 42, "sample.zarr")
    response = data(_request("/data/images/42/.zattrs", token=token), 42, ".zattrs", conn=conn)
    assert response.status_code == 200
    assert response.content == b""
    assert response["X-Accel-Redirect"] == "/_protected_zarr/sample.zarr/.zattrs"
    assert int(response["Content-Length"]) > 0


def test_data_rejects_traversal(configure_storage):
    _, mount = configure_storage
    write_v2_image(mount / "sample.zarr")
    conn = _connection()
    token, _ = make_read_context(_request("/"), conn, 42, "sample.zarr")
    response = data(_request("/", token=token), 42, "../secret", conn=conn)
    assert response.status_code == 400
    assert json.loads(response.content)["error"]["code"] == "unsafe_zarr_path"


def test_data_requires_context(configure_storage):
    response = data(_request("/"), 42, ".zattrs", conn=_connection())
    assert response.status_code == 401


def _write_renderable_store(path):
    store_uuid = "3935615d-a18d-41d8-af04-e63cfec3a46c"
    root = zarr.open_group(str(path), mode="w", zarr_format=2)
    axes = [
        {"name": "t", "type": "time"},
        {"name": "c", "type": "channel"},
        {"name": "z", "type": "space"},
        {"name": "y", "type": "space"},
        {"name": "x", "type": "space"},
    ]
    image_multiscales = [{
        "version": "0.4",
        "name": "Image",
        "axes": axes,
        "datasets": [{"path": "0"}],
    }]
    intensity = np.zeros((2, 3, 2, 8, 8), dtype=np.uint16)
    intensity[1, 0, 1] = np.arange(64, dtype=np.uint16).reshape(8, 8) * 4
    intensity[1, 1, 1] = 64
    intensity[1, 2, 1, 2:6, 2:6] = 7
    labels = np.zeros((2, 1, 2, 8, 8), dtype=np.uint32)
    labels[1, 0, 1, 2:6, 2:6] = 7
    root.create_array("0", data=intensity, chunks=(1, 1, 1, 4, 4))
    root.attrs.update(
        {
            "multiscales": image_multiscales,
            "omero": {
                "channels": [
                    {
                        "label": "DNA",
                        "color": "FF0000",
                        "active": True,
                        "window": {"min": 0, "max": 255, "start": 0, "end": 255},
                    },
                    {
                        "label": "Signal",
                        "color": "00FF00",
                        "active": False,
                        "window": {"min": 0, "max": 255, "start": 0, "end": 255},
                    },
                    {
                        "label": "Cells",
                        "color": "FFFF00",
                        "active": False,
                        "window": {"min": 0, "max": 255, "start": 0, "end": 255},
                    },
                ]
            },
            "cisegmentation": {"output_store_uuid": store_uuid},
        }
    )
    root.create_group("labels")
    root["labels"].attrs["labels"] = ["cells"]
    label_group = root.create_group("labels/cells")
    label_group.attrs.update(
        {
            "multiscales": [{
                "version": "0.4",
                "name": "Cells",
                "axes": axes,
                "datasets": [{"path": "0"}],
            }],
            "image-label": {"color": [255, 255, 0, 255]},
        }
    )
    label_group.create_array("0", data=labels, chunks=(1, 1, 1, 4, 4))
    return store_uuid


def test_roi_png_renders_channel_and_selected_label(configure_storage):
    _, mount = configure_storage
    store_uuid = _write_renderable_store(mount / "sample.zarr")
    request = _request(
        "/api/images/42/roi.png"
        f"?field=.&roi=1,1,7,7&sourceChannels=1&labelPath=labels/cells"
        f"&labelValue=7&t=1&z=1&storeUuid={store_uuid}"
    )
    response = roi_png(request, 42, conn=_connection())
    assert response.status_code == 200
    assert response["Content-Type"] == "image/png"
    image = Image.open(BytesIO(response.content))
    assert image.size == (6, 6)
    pixels = np.asarray(image)
    assert tuple(pixels[1, 1]) == (255, 255, 0)
    assert pixels[2, 2, 0] > 0
    assert pixels[2, 2, 1] == 0


def test_roi_png_supports_an_appended_label_channel(configure_storage):
    _, mount = configure_storage
    _write_renderable_store(mount / "sample.zarr")
    response = roi_png(
        _request(
            "/api/images/42/roi.png"
            "?roi=1,1,7,7&sourceChannels=1&labelChannel=3"
            "&labelValue=7&t=1&z=1"
        ),
        42,
        conn=_connection(),
    )
    assert response.status_code == 200
    pixels = np.asarray(Image.open(BytesIO(response.content)))
    assert tuple(pixels[1, 1]) == (255, 255, 0)


def test_roi_png_rejects_store_mismatch_and_invalid_bounds(configure_storage):
    _, mount = configure_storage
    _write_renderable_store(mount / "sample.zarr")
    mismatch = roi_png(
        _request(
            "/api/images/42/roi.png?roi=0,0,4,4"
            "&storeUuid=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
        ),
        42,
        conn=_connection(),
    )
    assert mismatch.status_code == 409
    assert json.loads(mismatch.content)["error"]["code"] == "store_uuid_mismatch"

    invalid = roi_png(
        _request("/api/images/42/roi.png?roi=0,0,99,99"),
        42,
        conn=_connection(),
    )
    assert invalid.status_code == 400
    assert json.loads(invalid.content)["error"]["code"] == "invalid_roi"

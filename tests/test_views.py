import json

from django.test import RequestFactory

from biomero_zarr_viewer.tokens import make_read_context
from biomero_zarr_viewer.views import capabilities, data, plate_capabilities, viewer

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
    write_v2_image(mount / "sample.zarr")
    response = capabilities(_request("/api/images/42/capabilities/"), 42, conn=_connection())
    payload = json.loads(response.content)
    assert response.status_code == 200
    assert payload["schema_version"] == 1
    assert payload["supported"] is True
    assert payload["store"]["url"].endswith("/data/images/42/")
    assert payload["store"]["context"]
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

import pytest
from django.test import RequestFactory

from biomero_zarr_viewer.errors import InvalidContext
from biomero_zarr_viewer.tokens import make_read_context, validate_read_context

from .fakes import FakeConnection


def request(group=13, token=None):
    headers = {"HTTP_X_OMERO_ZARR_CONTEXT": token} if token else {}
    value = RequestFactory().get("/", **headers)
    value.session = {"active_group": group}
    return value


def test_context_is_bound_to_user_group_and_image():
    conn = FakeConnection(user_id=7, group_id=13)
    token, _ = make_read_context(request(), conn, 42, "sample.zarr")
    assert validate_read_context(request(token=token), conn, 42)["store"] == "sample.zarr"
    with pytest.raises(InvalidContext, match="another image"):
        validate_read_context(request(token=token), conn, 43)
    with pytest.raises(InvalidContext, match="another user"):
        validate_read_context(request(token=token), FakeConnection(user_id=8), 42)
    with pytest.raises(InvalidContext, match="group"):
        validate_read_context(request(group=99, token=token), conn, 42)


def test_altered_context_is_rejected():
    conn = FakeConnection()
    token, _ = make_read_context(request(), conn, 42, "sample.zarr")
    with pytest.raises(InvalidContext):
        validate_read_context(request(token=token + "x"), conn, 42)


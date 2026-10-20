import json
import tempfile
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pytest
from django.http import JsonResponse, HttpResponse
from django.test import RequestFactory

from biomero_zarr_viewer import http_source, resolver, views
from biomero_zarr_viewer.errors import DataNotFound, ROILimitExceeded, StoreNotFound, UnsafePath
from .fakes import FakeConnection, FakeImage, Value


@pytest.fixture
def virtual(monkeypatch):
    image = FakeImage(42, "ordinary.tif", [])
    for dim, size in zip("TCZYX", [1, 1, 2, 4, 4]):
        setattr(image, f"getSize{dim}", lambda value=size: value)
    for dim, value in zip("XYZ", [.5, .5, 1.5]):
        setattr(image, f"getPixelSize{dim}", lambda units=True, value=value: Value(value))
    pixels = np.arange(32, dtype="<u2").reshape(2, 4, 4)
    calls = []
    metadata = {"zarr_format": 2, "shape": [2, 4, 4], "chunks": [1, 4, 4], "dtype": "<u2",
                "compressor": None, "filters": None, "fill_value": 0, "order": "C", "dimension_separator": "/"}

    def attrs(request, iid, conn, version):
        assert iid == 42 and version == "0.4"
        calls.append("metadata")
        return JsonResponse({"multiscales": [{"version": "0.4", "axes": [
            {"name": dim, "type": "space", "unit": "micrometer"} for dim in "zyx"
        ], "datasets": [{"path": "0", "coordinateTransformations": [{"type": "scale", "scale": [1, 1, 1]}]}]}],
            "omero": {"channels": [{"label": "DNA", "color": "FFFFFF", "active": True, "window": {"start": 0, "end": 31, "min": 0, "max": 31}}]}})

    def array(request, iid, conn, level):
        assert level == "0" and iid == 42
        return JsonResponse(metadata)

    def chunk(request, iid, conn, level, chunk):
        assert level == "0" and iid == 42
        calls.append(chunk)
        # Match the upstream provider: encoding a chunk calls Zarr's sync API.
        # This catches nested-event-loop errors in server-side ROI rendering.
        import zarr
        with tempfile.TemporaryDirectory() as directory:
            kwargs = {"zarr_format": 2} if int(zarr.__version__.split(".")[0]) >= 3 else {}
            array = zarr.open_array(directory, mode="w", shape=(1, 4, 4), chunks=(1, 4, 4),
                                    dtype="<u2", compressor=None, **kwargs)
            array[0] = pixels[int(chunk.split("/")[0])]
            return HttpResponse((Path(directory) / "0.0.0").read_bytes())

    monkeypatch.setattr(http_source, "http_enabled", lambda: True)
    monkeypatch.setattr(http_source.apps, "is_installed", lambda name: name == "omero_web_zarr")
    monkeypatch.setattr(http_source, "provider_views", lambda: SimpleNamespace(image_zattrs=attrs, image_zarray=array, image_chunk=chunk))
    return SimpleNamespace(conn=FakeConnection(image), pixels=pixels, calls=calls, metadata=metadata)


def req(token=None, method="get"):
    request = getattr(RequestFactory(), method)("/", **({"HTTP_X_OMERO_ZARR_CONTEXT": token} if token else {}))
    request.session = {"active_group": 13}
    return request


def test_metadata_cache_is_session_scoped_expires_and_does_not_cache_pixels(virtual,monkeypatch):
    http_source._metadata_cache.clear()
    virtual.conn._sessionUuid='cache-test-session'
    virtual.conn.SERVICE_OPTS=SimpleNamespace(getOmeroGroup=lambda:13)
    virtual.conn.image.getPixelsId=lambda:7
    now=[100.0]
    monkeypatch.setattr(http_source.time,'monotonic',lambda:now[0])
    first=http_source.HttpZarrSource(virtual.conn.image,virtual.conn)
    first.read('0/1/0/0')
    metadata_calls=virtual.calls.count('metadata')
    second=http_source.HttpZarrSource(virtual.conn.image,virtual.conn)
    second.read('0/1/0/0')
    assert virtual.calls.count('metadata')==metadata_calls
    assert virtual.calls.count('1/0/0')==2
    virtual.conn._sessionUuid='another-session'
    http_source.HttpZarrSource(virtual.conn.image,virtual.conn).read('0/1/0/0')
    assert virtual.calls.count('metadata')==metadata_calls+1
    now[0]+=http_source._METADATA_TTL+1
    http_source.HttpZarrSource(virtual.conn.image,virtual.conn).read('0/1/0/0')
    assert virtual.calls.count('metadata')==metadata_calls+2
    http_source._metadata_cache.clear()


def test_optimized_chunk_protocol_uses_validated_metadata_and_current_image(virtual,monkeypatch):
    original=http_source.provider_views()
    def attrs(*args,_image=None,**kwargs):return original.image_zattrs(*args,**kwargs)
    def array(*args,_image=None,**kwargs):return original.image_zarray(*args,**kwargs)
    def chunk(request,iid,conn,level,chunk,array_metadata,resolution_level,_image):
        assert array_metadata==virtual.metadata
        assert resolution_level==0 and _image is virtual.conn.image
        return HttpResponse(b'chunk')
    monkeypatch.setattr(http_source,'provider_views',lambda:SimpleNamespace(
        image_zattrs=attrs,image_zarray=array,image_chunk=chunk,CHUNK_METADATA_API=1))
    source=http_source.HttpZarrSource(virtual.conn.image,virtual.conn)
    assert source.read('0/1/0/0')==b'chunk'


def test_disabled_feature_never_imports_optional_provider(monkeypatch):
    monkeypatch.setattr(http_source, "http_enabled", lambda: False)
    monkeypatch.setattr(http_source, "provider_views", lambda: pytest.fail("optional provider imported"))
    assert not http_source.available()
    with pytest.raises(StoreNotFound):
        resolver.resolve_image_store(FakeConnection(FakeImage(42, "ordinary.tif", [])), 42)


@pytest.mark.parametrize("fails", [False, True])
def test_provider_closes_only_new_rendering_engines_even_on_failure(monkeypatch, fails):
    image = FakeImage(42, "ordinary.tif", [])
    image._re = None
    closed = []
    def close():
        closed.append(image._re)
        image._re = None
    image._closeRE = close
    conn = FakeConnection(image)
    def provider(request, iid, conn):
        current = conn.getObject("Image", iid)
        current._re = object()
        if fails:
            raise RuntimeError("pixel read failed")
        return HttpResponse(b"pixels")
    monkeypatch.setattr(http_source, "provider_views", lambda: SimpleNamespace(image_chunk=provider))
    source = http_source.HttpZarrSource(image, conn)
    if fails:
        with pytest.raises(RuntimeError, match="pixel read failed"):
            source._call("image_chunk")
    else:
        assert source._call("image_chunk") == b"pixels"
    assert len(closed) == 1 and image._re is None
    # A pre-existing engine belongs to its caller, not this provider operation.
    image._re = object()
    if fails:
        with pytest.raises(RuntimeError): source._call("image_chunk")
    else:
        source._call("image_chunk")
    assert len(closed) == 1


def test_enabled_without_installed_app_does_not_change_physical_support(monkeypatch, configure_storage):
    from .conftest import write_v2_image, write_v3_image
    from .fakes import FakeExternalInfo
    _, mount = configure_storage
    monkeypatch.setattr(http_source, "http_enabled", lambda: True)
    monkeypatch.setattr(http_source.apps, "is_installed", lambda _: False)
    monkeypatch.setattr(http_source, "provider_views", lambda: pytest.fail("missing provider imported"))
    assert not http_source.available()
    for name, writer in [("v2.zarr", write_v2_image), ("v3.zarr", write_v3_image)]:
        writer(mount / name)
        conn = FakeConnection(FakeImage(42, name, [], external_info=FakeExternalInfo(f"/recorded/{name}")))
        response = views.capabilities(req(), 42, conn=conn)
        assert response.status_code == 200
        assert json.loads(response.content)["store"]["transport"] == "filesystem"


def test_missing_optional_python_module_is_unavailable(monkeypatch):
    monkeypatch.setattr(http_source, "http_enabled", lambda: True)
    monkeypatch.setattr(http_source.apps, "is_installed", lambda _: True)
    def missing():
        raise ImportError("provider not installed")
    monkeypatch.setattr(http_source, "provider_views", missing)
    assert not http_source.available()


def test_http_capability_is_lazy_calibrated_and_eligible(virtual):
    response = views.capabilities(req(), 42, conn=virtual.conn)
    assert response.status_code == 200
    model = json.loads(response.content)
    assert model["store"]["transport"] == "http"
    assert model["ngff_version"] == "0.4"
    assert model["datasets"][0]["coordinate_transformations"][0]["scale"] == [1.5, .5, .5]
    assert model["store"]["neuroglancer_url"] is None
    assert all(call == "metadata" for call in virtual.calls)
    assert resolver.image_store_registered(virtual.conn, 42)


def test_signed_http_reads_head_roi_and_metadata(virtual):
    model = json.loads(views.capabilities(req(), 42, conn=virtual.conn).content)
    token = model["store"]["context"]
    response = views.data(req(token), 42, "0/1/0/0", conn=virtual.conn)
    assert response.status_code == 200
    assert np.frombuffer(response.content, dtype="<u2").reshape(4, 4).tolist() == virtual.pixels[1].tolist()
    assert "X-Accel-Redirect" not in response
    assert response["Cache-Control"] == "private, no-store"
    response = views.data(req(token, "head"), 42, "0/1/0/0", conn=virtual.conn)
    assert response.content == b"" and int(response["Content-Length"]) == 32
    response = views.roi_png(RequestFactory().get("/", {"roi": "0,0,4,4", "z": "1"}), 42, conn=virtual.conn)
    assert response.status_code == 200 and response.content.startswith(b"\x89PNG")
    response = views.metadata_details(RequestFactory().get("/"), 42, conn=virtual.conn)
    assert response.status_code == 200
    assert json.loads(response.content)["zarr"]["nodes"]


def test_signed_http_context_rechecks_access_and_cannot_switch_sources(virtual):
    model = json.loads(views.capabilities(req(), 42, conn=virtual.conn).content)
    token = model["store"]["context"]
    assert views.data(req(token), 43, "0/0/0/0", conn=virtual.conn).status_code == 403
    assert views.data(req(), 42, "0/0/0/0", conn=virtual.conn).status_code == 401
    virtual.conn.image = None
    assert views.data(req(token), 42, "0/0/0/0", conn=virtual.conn).status_code == 404


@pytest.mark.parametrize("key", ["../secret", "/etc/passwd", "0/../0", "0\\0", "http://host/key", "0/0/0/-1", "zarr.json", "0/9/0/0", "0/0/0"])
def test_virtual_keys_are_bounded_and_never_arbitrary_urls(virtual, key):
    store = resolver.resolve_image_store(virtual.conn, 42)
    with pytest.raises((DataNotFound, UnsafePath)):
        store.http.read(key)
    assert not any("/" in item for item in virtual.calls)


def test_oversize_chunks_are_rejected_before_reading_pixels(virtual):
    virtual.metadata["chunks"] = [1, 10000, 10000]
    source = resolver.resolve_image_store(virtual.conn, 42).http
    with pytest.raises(ROILimitExceeded):
        source.read("0/0/0/0")
    assert all(item == "metadata" for item in virtual.calls)


def test_physical_registration_still_wins_with_http_enabled(virtual, configure_storage):
    from .fakes import FakeExternalInfo
    _, mount = configure_storage
    (mount / "source.zarr").mkdir()
    virtual.conn.image._obj.external_info = FakeExternalInfo("/recorded/source.zarr")
    assert resolver.resolve_image_store(virtual.conn, 42).http is None
    assert virtual.calls == []


def test_http_tokens_cannot_authorize_filesystem_cache_endpoints(virtual, monkeypatch):
    from biomero_zarr_viewer import volume_cache, neuroglancer
    monkeypatch.setattr(volume_cache, "cache_limit", lambda: 1024)
    model = json.loads(views.capabilities(req(), 42, conn=virtual.conn).content)
    token = model["store"]["context"]
    for endpoint in [views.cached_volume, views.cached_previews, neuroglancer.prepare]:
        assert endpoint(req(token), 42, conn=virtual.conn).status_code == 403

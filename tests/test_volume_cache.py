import json
import numpy as np
import pytest
import zarr

from biomero_zarr_viewer import volume_cache as cache
from biomero_zarr_viewer.errors import DataNotFound, InvalidROI, ROILimitExceeded
from .zarr_helpers import format_options, write_volume_group


@pytest.fixture
def source(tmp_path, monkeypatch, zarr_format):
    monkeypatch.setenv("BIOMERO_ZARR_CACHE_DIR", str(tmp_path / "cache"))
    monkeypatch.setenv("BIOMERO_ZARR_CACHE_MAX_BYTES", "100000")
    pixels = np.arange(2*5*7*9, dtype=np.uint16).reshape(2,5,7,9)
    path = tmp_path / "array"
    array = zarr.open_array(str(path), mode="w", shape=pixels.shape, dtype="uint16", chunks=(1,2,7,9), **format_options(zarr_format))
    array[:] = pixels
    return path, pixels


def request(path, channel=0, scope="owner", version="v1"):
    return cache.request_volume(path, ["c","z","y","x"], channel, 0, scope, version, asynchronous=False)


def test_packed_volume_matches_every_source_voxel_and_reuses_cache(source):
    path, pixels = source
    result = request(path, 1)
    assert result["status"] == "ready" and result["progress"] == 1
    file = cache.cache_root() / (result["key"] + ".bin")
    np.testing.assert_array_equal(np.fromfile(file,dtype="<u2").reshape(5,7,9),pixels[1])
    timestamp = file.stat().st_mtime_ns
    assert request(path,1)["key"] == result["key"]
    assert file.stat().st_mtime_ns == timestamp


def test_volume_status_and_download_are_scoped_to_authorized_context(source):
    path, _ = source
    result = request(path)
    with pytest.raises(DataNotFound): cache.entry(result["key"], "another-owner")


def test_disk_limit_evicts_old_ready_data_and_rejects_oversized_entries(source,monkeypatch):
    path, _ = source
    monkeypatch.setenv("BIOMERO_ZARR_CACHE_MAX_BYTES", "1000")
    first = request(path,0)
    second = request(path,1)
    assert not (cache.cache_root()/(first["key"]+".bin")).exists()
    assert (cache.cache_root()/(second["key"]+".bin")).stat().st_size == 630
    monkeypatch.setenv("BIOMERO_ZARR_CACHE_MAX_BYTES", "100")
    with pytest.raises(ROILimitExceeded): request(path,0)


def test_pixel_changes_invalidate_cached_volumes(source):
    path, _ = source
    version = cache.fingerprint(path,path.parent)
    first = request(path,version=version)
    array = zarr.open_array(str(path),mode="r+");array[0,0,0,0]=2000
    changed = cache.fingerprint(path,path.parent)
    assert version != changed
    assert request(path,version=changed)["key"] != first["key"]


def test_invalid_channel_is_rejected_before_cache_reservation(source):
    path, _ = source
    with pytest.raises(InvalidROI): request(path,2)


def test_lowered_limit_is_applied_even_when_requested_entry_already_exists(source,monkeypatch):
    path,_=source
    first=request(path,0);second=request(path,1)
    monkeypatch.setenv("BIOMERO_ZARR_CACHE_MAX_BYTES","1000")
    assert request(path,1)["key"]==second["key"]
    assert not (cache.cache_root()/(first["key"]+".bin")).exists()
    assert sum(p.stat().st_size for p in cache.cache_root().glob('*.bin'))<=1000


def test_abandoned_jobs_recover_after_pid_reuse(source,monkeypatch):
    path,_=source
    calls=[]
    monkeypatch.setattr(cache._pool,"submit",lambda *args:calls.append(args))
    result=cache.request_volume(path,["c","z","y","x"],0,0,"owner","v1")
    with cache.database() as db:
        db.execute("UPDATE entries SET owner=? WHERE key=?",(f"{cache.os.getpid()}:previous-process",result["key"]))
    cache.request_volume(path,["c","z","y","x"],0,0,"owner","v1")
    assert len(calls)==2


def test_pending_jobs_reserve_space_and_duplicate_requests_coalesce(source,monkeypatch):
    path, _ = source
    monkeypatch.setenv("BIOMERO_ZARR_CACHE_MAX_BYTES", "1000")
    calls=[]
    monkeypatch.setattr(cache._pool,"submit",lambda *args: calls.append(args))
    first=cache.request_volume(path,["c","z","y","x"],0,0,"owner","v1")
    same=cache.request_volume(path,["c","z","y","x"],0,0,"owner","v1")
    assert first["key"]==same["key"] and len(calls)==1
    with pytest.raises(ROILimitExceeded): cache.request_volume(path,["c","z","y","x"],1,0,"owner","v1")


def test_safe_route_index_reuses_parsing_and_longest_prefix(configure_storage):
    from biomero_zarr_viewer.views import _safe_data_path,_route_index
    _, mount=configure_storage
    (mount/"labels").mkdir();(mount/"labels/value").write_text("data")
    routes=[["A/1/0/labels/nuclei","labels"]]
    _route_index.cache_clear()
    for _ in range(3):
        path,_=_safe_data_path("source","A/1/0/labels/nuclei/value",routes)
        assert path==mount/"labels/value"
    assert _route_index.cache_info().misses==1
    assert _route_index.cache_info().hits==2


def test_volume_endpoint_authentication_traversal_and_binary_response(configure_storage,tmp_path,monkeypatch,zarr_format):
    from biomero_zarr_viewer.views import cached_volume
    from biomero_zarr_viewer.tokens import make_read_context
    from .test_views import _request
    from .fakes import FakeConnection
    _,mount=configure_storage
    monkeypatch.setenv("BIOMERO_ZARR_CACHE_DIR",str(tmp_path/"cache"))
    monkeypatch.setenv("BIOMERO_ZARR_CACHE_MAX_BYTES","100000")
    pixels=np.arange(24,dtype=np.uint16).reshape(1,3,2,4)
    attrs={"version":"0.5","multiscales":[{"axes":[{"name":a} for a in "czyx"],"datasets":[{"path":"0"}]}]}
    write_volume_group(mount/"volume.zarr",pixels,(1,1,2,4),attrs,zarr_format)
    conn=FakeConnection()
    token,_=make_read_context(_request("/"),conn,42,"volume.zarr")
    monkeypatch.setattr(cache._pool,"submit",lambda function,*args:function(*args))
    assert cached_volume(_request("/"),42,conn=conn).status_code==401
    assert cached_volume(_request("/?field=../outside",token=token),42,conn=conn).status_code==400
    response=cached_volume(_request("/?level=0&c=0",token=token),42,conn=conn)
    assert response.status_code==200
    result=json.loads(response.content)
    assert result["status"]=="ready"
    response=cached_volume(_request(f"/?job={result['key']}&download=1",token=token),42,conn=conn)
    np.testing.assert_array_equal(np.frombuffer(b''.join(response.streaming_content),dtype='<u2').reshape(3,2,4),pixels[0])
    wrong=FakeConnection(user_id=8)
    assert cached_volume(_request(f"/?job={result['key']}",token=token),42,conn=wrong).status_code==403


def test_cache_default_is_twenty_decimal_gigabytes(monkeypatch):
    monkeypatch.delenv('BIOMERO_ZARR_CACHE_MAX_BYTES',raising=False)
    assert cache.cache_limit()==20_000_000_000
    monkeypatch.setenv('BIOMERO_ZARR_CACHE_MAX_BYTES','50000000000')
    assert cache.cache_limit()==50_000_000_000

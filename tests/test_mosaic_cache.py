from io import BytesIO
import json
import zipfile
import numpy as np
from PIL import Image
import pytest
import zarr

from biomero_zarr_viewer import mosaic_cache as mosaic, volume_cache as cache, views
from biomero_zarr_viewer.errors import DataNotFound, InvalidROI, ROILimitExceeded
from biomero_zarr_viewer.tokens import make_read_context
from .fakes import FakeConnection
from .test_views import _request


@pytest.fixture
def plate(configure_storage,tmp_path,monkeypatch):
    _,mount=configure_storage
    monkeypatch.setenv('BIOMERO_ZARR_CACHE_DIR',str(tmp_path/'cache'))
    monkeypatch.setenv('BIOMERO_ZARR_CACHE_MAX_BYTES','20000000')
    root=zarr.open_group(str(mount/'plate.zarr'),mode='w',zarr_format=3)
    root.attrs['ome']={'plate':{'name':'Test'}}
    for field,value in [('A/1/0',50),('B/2/0',100)]:
        group=root.create_group(field)
        data=np.zeros((2,2,404,404),dtype='uint8')
        data[0,1]=value;data[1,1]=value//2
        group.create_array('0',data=data,chunks=(1,1,101,101))
        group.attrs['ome']={'multiscales':[{'axes':['c','z','y','x'],'datasets':[{'path':'0'}]}]}
    claims={'uid':7,'gid':13,'store':'plate.zarr'}
    options={'width':852,'height':852,'tiles':[{'path':'A/1/0','left':0,'top':0},{'path':'B/2/0','left':432,'top':432}],
      'channels':[{'index':0,'color':'#FF0000','low':0,'high':255},{'index':1,'color':'#00FF00','low':0,'high':255}],'z':1,'t':0}
    return claims,options,root


def build(plate,**kwargs):
    claims,options,_=plate
    return mosaic.request_mosaic(claims,'owner',options,views._safe_data_path,asynchronous=False,**kwargs)


def test_plate_pyramid_pixels_geometry_edges_and_reuse(plate):
    result=build(plate)
    assert result['status']=='ready', result.get('error')
    assert result['metadata']['levels']==2
    native=np.asarray(Image.open(BytesIO(mosaic.read_tile(result,0,0,0))))
    np.testing.assert_array_equal(native[20,20],[50,25,0])
    np.testing.assert_array_equal(native[0,0],[0,0,0])
    np.testing.assert_array_equal(native[445,445],[100,50,0])
    edge=np.asarray(Image.open(BytesIO(mosaic.read_tile(result,0,1,1))))
    assert edge.shape==(340,340,3)
    np.testing.assert_array_equal(edge[0,0],[100,50,0])
    coarse=np.asarray(Image.open(BytesIO(mosaic.read_tile(result,1,0,0))))
    assert coarse.shape==(426,426,3)
    np.testing.assert_array_equal(coarse[20,20],[50,25,0])
    file=cache.cache_root()/(result['key']+'.bin');stamp=file.stat().st_mtime_ns
    assert build(plate)['key']==result['key'] and file.stat().st_mtime_ns==stamp
    assert result['size']==file.stat().st_size
    assert not list(cache.cache_root().glob('*.scratch')) and not list(cache.cache_root().glob('*.next'))
    with pytest.raises(DataNotFound):cache.entry(result['key'],'other-user')
    with pytest.raises(InvalidROI):mosaic.read_tile(result,0,2,0)


def test_rebuild_and_metadata_or_display_changes_invalidate(plate):
    first=build(plate)
    claims,options,root=plate
    root['A/1/0/0'][0,1,20,20]=220
    rebuilt=build(plate,rebuild=True)
    assert rebuilt['key']==first['key']
    pixels=np.asarray(Image.open(BytesIO(mosaic.read_tile(rebuilt,0,0,0))))
    assert pixels[28,28,0]==220
    root.attrs['revision']=2
    changed=build(plate)
    assert changed['key']!=first['key']
    options['channels'][0]['high']=128
    assert build(plate)['key']!=changed['key']


def test_shared_quota_reserves_work_files_and_rejects_before_build(plate,monkeypatch):
    monkeypatch.setenv('BIOMERO_ZARR_CACHE_MAX_BYTES','1000')
    with pytest.raises(ROILimitExceeded):build(plate)
    assert not list(cache.cache_root().glob('*.scratch'))


def test_invalid_layout_and_failed_field_cleanup(plate):
    claims,options,root=plate
    options['tiles'][1]['path']='../escape'
    with pytest.raises(InvalidROI):build(plate)
    options['tiles'][1]['path']='missing/0'
    result=build(plate)
    assert result['status']=='error' and result['size']==0
    assert not list(cache.cache_root().glob('*.scratch')) and not list(cache.cache_root().glob('*.part'))


def test_mosaic_endpoint_requires_matching_context(plate):
    claims,options,_=plate
    conn=FakeConnection();token,_=make_read_context(_request('/'),conn,42,'plate.zarr')
    from django.test import RequestFactory
    request=RequestFactory().post('/',data=json.dumps(options),content_type='application/json')
    request.session=_request('/').session
    request.META['HTTP_X_OMERO_ZARR_CONTEXT']=token
    response=views.cached_mosaic(request,42,conn=conn)
    assert response.status_code==200
    job=json.loads(response.content)['key']
    assert views.cached_mosaic(_request('/',data={'job':job}),42,conn=conn).status_code==401
    # Wait for the actual background job before pytest removes its source files.
    import time
    for _ in range(100):
        if cache.entry(job,cache.scope_key(claims,42))['status'] in ('ready','error'):break
        time.sleep(.05)


def test_cache_default_is_twenty_decimal_gigabytes(monkeypatch):
    monkeypatch.delenv('BIOMERO_ZARR_CACHE_MAX_BYTES',raising=False)
    assert cache.cache_limit()==20_000_000_000
    monkeypatch.setenv('BIOMERO_ZARR_CACHE_MAX_BYTES','50000000000')
    assert cache.cache_limit()==50_000_000_000


def test_mosaic_jobs_coalesce_and_recover_reserved_scratch_after_restart(plate,monkeypatch):
    claims,options,_=plate
    calls=[]
    monkeypatch.setattr(cache._pool,'submit',lambda *args:calls.append(args))
    first=mosaic.request_mosaic(claims,'owner',options,views._safe_data_path)
    same=mosaic.request_mosaic(claims,'owner',options,views._safe_data_path)
    assert first['key']==same['key'] and len(calls)==1
    files=[cache.cache_root()/(first['key']+suffix) for suffix in ('.scratch','.next','.part')]
    for path in files:path.write_bytes(b'abandoned work')
    with cache.database() as db:
        db.execute('UPDATE entries SET owner=? WHERE key=?',(f'{cache.os.getpid()}:dead-process',first['key']))
    mosaic.request_mosaic(claims,'owner',options,views._safe_data_path)
    assert len(calls)==2 and not any(path.exists() for path in files)

import json
import struct
from urllib.parse import urlencode

import numpy as np
import pytest

from biomero_zarr_viewer import neuroglancer as ng, volume_cache as cache
from biomero_zarr_viewer.tokens import make_read_context
from .fakes import FakeConnection
from .test_views import _request
from .zarr_helpers import write_volume_group


@pytest.fixture
def streaming_scene(configure_storage, tmp_path, monkeypatch, zarr_format):
    _, mount = configure_storage
    monkeypatch.setenv('BIOMERO_ZARR_CACHE_DIR', str(tmp_path/'cache'))
    monkeypatch.setenv('BIOMERO_ZARR_CACHE_MAX_BYTES', '100000000')
    pixels = np.arange(2*2*6*7*8,dtype=np.uint16).reshape(2,2,6,7,8)
    attrs={'multiscales':[{'axes':[{'name':'t'},{'name':'c'}]+[{'name':a,'unit':'micrometer'} for a in 'zyx'],
        'datasets':[{'path':'0','coordinateTransformations':[{'type':'scale','scale':[1,1,.5,.2,.1]}]}]}]}
    write_volume_group(mount/'image.zarr',pixels,(1,1,2,7,8),attrs,zarr_format)
    labels=np.zeros((1,1,6,7,8),dtype=np.uint64)
    labels[0,0,1:4,2:5,3:7]=2**53+17
    write_volume_group(mount/'image.zarr/labels/cells',labels,(1,1,2,7,8),attrs,zarr_format)
    conn=FakeConnection()
    token,_=make_read_context(_request('/'),conn,42,'image.zarr')
    return mount,pixels,labels,conn,token,zarr_format


def prepare(scene, **params):
    _,_,_,conn,token,_=scene
    req=_request('/?'+urlencode(params),token=token)
    response=ng.prepare(req,42,conn=conn)
    assert response.status_code==200,response.content
    return req,json.loads(response.content)


def data(scene,req,result,key):
    req2=_request('/')
    req2.session=req.session
    context=result['url'].strip('/').split('/')[-1]
    return ng.data(req2,42,context,key,conn=scene[3])


def test_streaming_never_packs_full_volumes_and_preserves_selected_time_channel(streaming_scene,monkeypatch):
    monkeypatch.setattr(cache,'request_volume',lambda *a,**k: pytest.fail('Whole-volume packing is forbidden'))
    req,result=prepare(streaming_scene,t=1,channels='[1]')
    assert not result['pending']
    source=result['sources']['image-1']
    assert source['transport']==('zarr' if streaming_scene[-1]==2 else 'chunks')
    assert not {'array','axes','channel','timepoint'} & source.keys()
    response=data(streaming_scene,req,result,'image-1/0/0-8_0-7_0-6')
    np.testing.assert_array_equal(np.frombuffer(response.content,dtype='<u2').reshape(6,7,8),streaming_scene[1][1,1])
    assert not list(cache.cache_root().glob('*.bin'))


def test_native_virtual_metadata_maps_to_original_compressed_bytes(streaming_scene):
    if streaming_scene[-1]!=2: pytest.skip('Native path currently supports compatible v2 arrays')
    req,result=prepare(streaming_scene,t=1,channels='[1]')
    metadata=json.loads(data(streaming_scene,req,result,'image-1/zarr/0/.zarray').content)
    assert metadata['shape']==[6,7,8] and metadata['chunks']==[2,7,8]
    chunk=data(streaming_scene,req,result,'image-1/zarr/0/1.0.0')
    assert chunk.status_code==200
    assert chunk['X-Accel-Redirect'].endswith('/image.zarr/0/1.1.1.0.0')
    assert data(streaming_scene,req,result,'image-1/zarr/0/100.0.0').status_code==400
    assert data(streaming_scene,req,result,'image-1/zarr/../outside').status_code==404


def test_label_index_and_meshes_run_as_jobs_and_publish_progressively(streaming_scene,monkeypatch):
    jobs=[]
    monkeypatch.setattr(cache._pool,'submit',lambda function,*args:jobs.append((function,args)))
    params={'channels':'[0]','labels':json.dumps([{'path':'labels/cells'}])}
    req,result=prepare(streaming_scene,**params)
    identity=result['url']
    assert result['pending'] and result['sources']['label-0']['segments']==[] and len(jobs)==1
    assert data(streaming_scene,req,result,'image-0/0/0-8_0-7_0-6').status_code==200
    func,args=jobs.pop();func(*args)
    req,result=prepare(streaming_scene,**params)
    assert result['pending'] and len(jobs)==1 and result['url']==identity
    func,args=jobs.pop();func(*args)
    req,result=prepare(streaming_scene,**params)
    assert not result['pending'] and result['sources']['label-0']['segments']==[str(2**53+17)]
    assert data(streaming_scene,req,result,f'label-0/mesh/{2**53+17}').status_code==200
    prepare(streaming_scene,**params)
    assert not jobs


def test_small_explicit_selection_uses_browser_input_without_server_mesh(streaming_scene,monkeypatch):
    monkeypatch.setattr(cache._pool,'submit',lambda f,*a:f(*a))
    monkeypatch.setattr(ng,'mesh_bytes',lambda *a:pytest.fail('Browser preview must not generate a server mesh'))
    value=str(2**53+17)
    req,result=prepare(streaming_scene,channels='[0]',labels=json.dumps([{'path':'labels/cells','segments':[value],'interactive':True}]))
    source=result['sources']['label-0']
    assert source['browser_segments']==[value] and source['segments']==[value]
    response=data(streaming_scene,req,result,f'label-0/mesh-input/{value}')
    length=struct.unpack('<I',response.content[:4])[0]
    header=json.loads(response.content[4:4+length])
    assert header['shape']==[3,3,4] and header['origin']==[1,2,3]
    assert set(response.content[4+length:])=={1}
    assert data(streaming_scene,req,result,'label-0/mesh-input/2').status_code==404


def test_background_queue_coalesces_bounds_pending_jobs_and_retains_failures(tmp_path,monkeypatch):
    monkeypatch.setenv('BIOMERO_ZARR_CACHE_DIR',str(tmp_path/'cache'))
    monkeypatch.setenv('BIOMERO_ZARR_CACHE_MAX_BYTES','100000')
    monkeypatch.setenv('BIOMERO_ZARR_MAX_PENDING_JOBS','1')
    jobs=[]
    monkeypatch.setattr(cache._pool,'submit',lambda f,*a:jobs.append((f,a)))
    one=cache.request_blob('one','scope',100,{},lambda:b'one')
    assert one['status']=='queued'
    cache.request_blob('one','scope',100,{},lambda:b'unused')
    assert len(jobs)==1
    assert cache.request_blob('two','scope',100,{},lambda:b'two')['status']=='deferred'
    f,args=jobs.pop();f(*args)
    assert cache.request_blob('one','scope',100,{},lambda:b'unused')['status']=='ready'
    assert not jobs
    def fail(): raise ValueError('bounded failure')
    cache.request_blob('two','scope',100,{},fail)
    f,args=jobs.pop();f(*args)
    assert cache.request_blob('two','scope',100,{},fail)['status']=='error'
    assert not jobs


def test_cropped_mesh_matches_full_volume_physical_bounds(streaming_scene):
    mount,pixels,labels,conn,token,fmt=streaming_scene
    from django.core import signing
    from biomero_zarr_viewer.tokens import TOKEN_SALT
    claims=signing.loads(token,salt=TOKEN_SALT)
    source=ng.prepare_source(claims,'scope','labels/cells',0,0,0,True)
    full=ng.mesh_bytes(labels[0,0],2**53+17,source['resolution'])
    cropped=ng.object_mesh(source,claims,str(2**53+17),[[1,4],[2,5],[3,7]])
    assert full==cropped


def test_non_singleton_time_channel_chunks_and_permuted_axes_use_decoded_fallback(streaming_scene):
    mount,pixels,labels,conn,token,fmt=streaming_scene
    axes=["t","x","z","y","c"]
    attrs={"multiscales":[{"axes":[{"name":a,**({"unit":"micrometer"} if a in "zyx" else {})} for a in axes],
        "datasets":[{"path":"0","coordinateTransformations":[{"type":"scale","scale":[1,.1,.5,.2,1]}]}]}]}
    write_volume_group(mount/"image.zarr",pixels.transpose(0,4,2,3,1),(2,8,2,7,2),attrs,fmt)
    req,result=prepare(streaming_scene,t=1,channels="[1]")
    assert result["sources"]["image-1"]["transport"]=="chunks"
    response=data(streaming_scene,req,result,"image-1/0/0-8_0-7_0-6")
    np.testing.assert_array_equal(np.frombuffer(response.content,dtype="<u2").reshape(6,7,8),pixels[1,1])


def test_native_chunk_symlink_escape_is_rejected(streaming_scene,tmp_path):
    if streaming_scene[-1]!=2: pytest.skip("Native path is v2")
    mount=streaming_scene[0]
    outside=tmp_path/"outside.bin";outside.write_bytes(b"private")
    chunk=mount/"image.zarr/0/0.0.0.0.0"
    chunk.unlink(missing_ok=True)
    try:
        chunk.symlink_to(outside)
    except OSError:
        pytest.skip("Symlinks unavailable")
    req,result=prepare(streaming_scene,channels="[0]")
    assert data(streaming_scene,req,result,"image-0/zarr/0/0.0.0").status_code==400


def test_float64_intensities_use_float32_decoded_chunks(streaming_scene):
    mount,pixels,labels,conn,token,fmt=streaming_scene
    values=pixels.astype(np.float64)+.25
    attrs={"multiscales":[{"axes":[{"name":"t"},{"name":"c"}]+[{"name":a,"unit":"micrometer"} for a in "zyx"],
        "datasets":[{"path":"0","coordinateTransformations":[{"type":"scale","scale":[1,1,.5,.2,.1]}]}]}]}
    write_volume_group(mount/"image.zarr",values,(1,1,2,7,8),attrs,fmt)
    req,result=prepare(streaming_scene,t=1,channels="[1]")
    assert result["sources"]["image-1"]["transport"]=="chunks"
    response=data(streaming_scene,req,result,"image-1/0/0-8_0-7_0-6")
    np.testing.assert_array_equal(np.frombuffer(response.content,dtype="<f4").reshape(6,7,8),values[1,1])


def test_too_many_objects_are_rejected_before_allocating_bounding_boxes(streaming_scene,monkeypatch):
    mount,pixels,labels,conn,token,fmt=streaming_scene
    attrs={"multiscales":[{"axes":[{"name":"t"},{"name":"c"}]+[{"name":a,"unit":"micrometer"} for a in "zyx"],
        "datasets":[{"path":"0","coordinateTransformations":[{"type":"scale","scale":[1,1,.5,.2,.1]}]}]}]}
    write_volume_group(mount/"image.zarr/labels/cells",np.arange(336,dtype=np.uint32).reshape(1,1,6,7,8),(1,1,2,7,8),attrs,fmt)
    monkeypatch.setattr(ng,"MAX_OBJECTS",10)
    monkeypatch.setattr(cache._pool,"submit",lambda f,*a:f(*a))
    monkeypatch.setattr("scipy.ndimage.find_objects",lambda *a:pytest.fail("Check the object limit first"))
    req=_request('/?'+urlencode({'labels':json.dumps([{'path':'labels/cells'}])}),token=token)
    response=ng.prepare(req,42,conn=conn)
    assert response.status_code==400
    assert b"2048 objects" in response.content


def test_large_v3_streaming_grid_skips_store_walk_and_bounds_block_size(configure_storage,tmp_path,monkeypatch):
    import zarr
    if int(zarr.__version__.split('.')[0])<3:pytest.skip('v3 requires Zarr-Python 3')
    _,mount=configure_storage
    monkeypatch.setenv('BIOMERO_ZARR_CACHE_DIR',str(tmp_path/'cache'))
    monkeypatch.setenv('BIOMERO_ZARR_CACHE_MAX_BYTES','100000000')
    attrs={'multiscales':[{'axes':[{'name':a,'unit':'micrometer'} for a in 'zyx'],'datasets':[{'path':'0','coordinateTransformations':[{'type':'scale','scale':[1,1,1]}]}]}]}
    write_volume_group(mount/'large.zarr',np.ones((130,130,130),dtype=np.uint16),(32,32,32),attrs,3)
    monkeypatch.setattr(cache,'fingerprint',lambda *a,**k:pytest.fail('must validate requested keys, not walk the store'))
    conn=FakeConnection();token,_=make_read_context(_request('/'),conn,42,'large.zarr')
    req=_request('/?channels=[0]',token=token)
    response=ng.prepare(req,42,conn=conn);assert response.status_code==200,response.content
    result=json.loads(response.content);context=result['url'].strip('/').split('/')[-1]
    read=_request('/');read.session=req.session
    info=json.loads(ng.data(read,42,context,'image-0/info',conn=conn).content)
    assert info['scales'][0]['chunk_sizes']==[[128,128,128]]
    block=ng.data(read,42,context,'image-0/0/128-130_128-130_128-130',conn=conn)
    np.testing.assert_array_equal(np.frombuffer(block.content,dtype='<u2'),np.ones(8,dtype=np.uint16))

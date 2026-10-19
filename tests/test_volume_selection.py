import json
from pathlib import Path

import numpy as np
import pytest
import zarr

from biomero_zarr_viewer import volume_cache as cache
from biomero_zarr_viewer.errors import UnsafePath
from .zarr_helpers import format_options, write_volume_group


@pytest.mark.parametrize('separator', ['/', '.'])
def test_fingerprint_only_visits_selected_time_channel_chunks(tmp_path, monkeypatch, zarr_format, separator):
    root = tmp_path/'array';root.mkdir()
    shape, chunks = [40, 3, 31, 16, 16], [1, 1, 1, 16, 16]
    if zarr_format == 2:
        metadata = {'zarr_format':2,'shape':shape,'chunks':chunks,'dimension_separator':separator}
        (root/'.zarray').write_text(json.dumps(metadata))
        prefix = ''
    else:
        metadata = {'zarr_format':3,'shape':shape,'chunk_grid':{'name':'regular','configuration':{'chunk_shape':chunks}},
                    'chunk_key_encoding':{'name':'default','configuration':{'separator':separator}}}
        (root/'zarr.json').write_text(json.dumps(metadata))
        prefix = 'c'+separator
    def put(t,c,value):
        path = root/(prefix+separator.join(map(str,[t,c,0,0,0])))
        path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(value)
        return path
    selected = put(7,1,b'selected');other_time=put(30,1,b'other');other_channel=put(7,2,b'channel')
    visited=[];original=cache.os.scandir
    def scan(path):visited.append(Path(path));return original(path)
    monkeypatch.setattr(cache.os,'scandir',scan)
    signature=lambda:cache.fingerprint(root,tmp_path,axes=list('tczyx'),channel=1,timepoint=7)
    first=signature()
    if separator=='/':
        assert other_time.parent not in visited and other_channel.parent not in visited
        assert selected.parent in visited
    other_time.write_bytes(b'unrelated time changed');other_channel.write_bytes(b'unrelated channel changed')
    assert signature()==first
    selected.write_bytes(b'selected time changed')
    assert signature()!=first


def test_shared_temporal_shards_are_included_without_visiting_other_shards(tmp_path):
    root=tmp_path/'array';root.mkdir()
    (root/'zarr.json').write_text(json.dumps({'zarr_format':3,'chunk_grid':{'name':'regular','configuration':{'chunk_shape':[10,1,8,16,16]}},
        'chunk_key_encoding':{'name':'default'}}))
    for t in range(4):
        p=root/f'c/{t}/0/0/0/0';p.parent.mkdir(parents=True);p.write_bytes(b'chunk')
    signature=lambda:cache.fingerprint(root,tmp_path,axes=list('tczyx'),channel=0,timepoint=17)
    first=signature();(root/'c/3/0/0/0/0').write_bytes(b'other shard')
    assert signature()==first
    (root/'c/1/0/0/0/0').write_bytes(b'selected shard')
    assert signature()!=first


def test_selected_chunk_symlink_escape_is_rejected(tmp_path):
    root=tmp_path/'mount/array';root.mkdir(parents=True)
    (root/'.zarray').write_text(json.dumps({'chunks':[1,1,1,2,2],'dimension_separator':'.'}))
    outside=tmp_path/'outside';outside.write_bytes(b'private')
    try:(root/'0.0.0.0.0').symlink_to(outside)
    except OSError:pytest.skip('Symlinks unavailable')
    with pytest.raises(UnsafePath):cache.fingerprint(root,root.parent,axes=list('tczyx'))


def test_cached_projection_and_neuroglancer_prepare_only_requested_time(configure_storage,tmp_path,monkeypatch,zarr_format):
    from urllib.parse import urlencode
    from biomero_zarr_viewer import neuroglancer as ng, views
    from biomero_zarr_viewer.tokens import make_read_context
    from .fakes import FakeConnection
    from .test_views import _request
    _,mount=configure_storage
    monkeypatch.setenv('BIOMERO_ZARR_CACHE_DIR',str(tmp_path/'cache'))
    monkeypatch.setenv('BIOMERO_ZARR_CACHE_MAX_BYTES','1000000')
    monkeypatch.setattr(cache._pool,'submit',lambda fn,*args:fn(*args))
    pixels=np.arange(4*2*3*2*4,dtype=np.uint16).reshape(4,2,3,2,4)
    attrs={'version':'0.5','multiscales':[{'axes':[{'name':a,**({'unit':'micrometer'} if a in 'zyx' else {})} for a in 'tczyx'],
        'datasets':[{'path':'0','coordinateTransformations':[{'type':'scale','scale':[1,1,.5,.2,.2]}]}]}]}
    write_volume_group(mount/'volume.zarr',pixels,(1,1,1,2,4),attrs,zarr_format)
    conn=FakeConnection();token,_=make_read_context(_request('/'),conn,42,'volume.zarr')
    calls=[];original=cache._build
    def build(key,path,axes,c,t,meta):calls.append((c,t));return original(key,path,axes,c,t,meta)
    monkeypatch.setattr(cache,'_build',build)
    response=views.cached_volume(_request('/?t=2&c=1',token=token),42,conn=conn)
    assert response.status_code==200,response.content
    result=json.loads(response.content)
    np.testing.assert_array_equal(np.fromfile(cache.cache_root()/(result['key']+'.bin'),dtype='<u2').reshape(3,2,4),pixels[2,1])
    response=ng.prepare(_request('/?'+urlencode({'t':2,'channels':'[1]','labels':'[]'}),token=token),42,conn=conn)
    assert response.status_code==200,response.content
    assert calls==[(1,2)] # The projection packs C/T once; Neuroglancer streams the original chunks.
    response=ng.prepare(_request('/?'+urlencode({'t':3,'channels':'[1]','labels':'[]'}),token=token),42,conn=conn)
    assert response.status_code==200
    assert calls==[(1,2)]

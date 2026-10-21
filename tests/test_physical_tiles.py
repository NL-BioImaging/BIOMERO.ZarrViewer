import json
import numpy as np
import pytest
from urllib.parse import urlencode
from biomero_zarr_viewer.physical_pixels import tile, open_physical_array
from biomero_zarr_viewer.tokens import make_read_context
from .fakes import FakeConnection
from .test_views import _request
from .zarr_helpers import write_volume_group


@pytest.fixture
def sample(configure_storage,zarr_format):
    _,mount=configure_storage
    pixels=np.arange(2*2*3*9*11,dtype=np.uint16).reshape(2,2,3,9,11)
    write_volume_group(mount/'pixels.zarr',pixels,(1,1,2,4,4),{'multiscales':[]},zarr_format)
    conn=FakeConnection();token,_=make_read_context(_request('/'),conn,42,'pixels.zarr')
    return mount,pixels,conn,token


def call(sample,**params):
    return tile(_request('/?'+urlencode({'array':'0','axes':'t,c,z,y,x','size':4,'x':2,'y':2,'c':1,'t':1,'z':2,**params}),token=sample[3]),42,conn=sample[2])


def test_exact_edge_plane_without_packing_or_volume_cache(sample,monkeypatch):
    from biomero_zarr_viewer import volume_cache
    monkeypatch.setattr(volume_cache,'request_volume',lambda *a,**k:pytest.fail('must not pack volume'))
    response=call(sample)
    assert response.status_code==200,response.content
    assert response['X-Zarr-Width']=='3' and response['X-Zarr-Height']=='1'
    np.testing.assert_array_equal(np.frombuffer(response.content,dtype='<u2'),sample[1][1,1,2,8,8:])
    assert response['Cache-Control']=='private, no-store'


@pytest.mark.parametrize('selection',[{'array':'../escape'},{'x':99},{'size':4096},{'z':4},{'c':5},{'axes':'t,c,z,x,x'},{'size':'NaN'}])
def test_invalid_or_escaping_selection_is_rejected(sample,selection):
    assert call(sample,**selection).status_code in (400,403,404,413)


def test_context_is_required_and_bound_to_image(sample):
    req=_request('/?array=0&axes=t,c,z,y,x')
    assert tile(req,42,conn=sample[2]).status_code in (401,403)
    req=_request('/?array=0&axes=t,c,z,y,x',token=sample[3])
    assert tile(req,43,conn=sample[2]).status_code in (401,403)


def test_chunk_symlink_escape_is_checked_during_pixel_reads(sample,tmp_path):
    mount,pixels,conn,token=sample
    chunks=[path for path in (mount/'pixels.zarr/0').rglob('*') if path.is_file() and path.name not in ('zarr.json','.zarray','.zattrs')]
    assert chunks
    outside=tmp_path/'outside.bin';outside.write_bytes(chunks[0].read_bytes())
    chunk=chunks[0];chunk.unlink();chunk.symlink_to(outside)
    claims={'store':'pixels.zarr'}
    from biomero_zarr_viewer.errors import UnsafePath
    with pytest.raises(UnsafePath):open_physical_array(claims,'0')[:]


def test_sharded_v3_plane_is_exact_without_loading_other_z_planes(sample,zarr_format):
    if zarr_format!=3:pytest.skip('Sharding is a v3 codec')
    import zarr
    mount,pixels,_,_=sample
    group=zarr.open_group(str(mount/'pixels.zarr'),mode='a');del group['0']
    group.create_array('0',data=pixels,chunks=(1,1,1,2,2),shards=(1,1,2,4,4))
    response=call(sample)
    assert response.status_code==200,response.content
    np.testing.assert_array_equal(np.frombuffer(response.content,dtype='<u2'),pixels[1,1,2,8,8:])


def test_virtual_context_cannot_use_the_physical_tile_reader(sample):
    token,_=make_read_context(_request('/'),sample[2],42,'pixels.zarr',backend='omero-web-zarr')
    response=tile(_request('/?array=0&axes=t,c,z,y,x',token=token),42,conn=sample[2])
    assert response.status_code==403

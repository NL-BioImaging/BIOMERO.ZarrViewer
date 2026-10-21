import json
import math
import struct
from types import SimpleNamespace
import numpy as np
import pytest
from biomero_zarr_viewer import http_statistics as stats, views
from .test_http_source import virtual, virtual_v3, req


@pytest.mark.parametrize('fixture',['virtual','virtual_v3'])
def test_batched_native_samples_match_the_original_tile_sampler_and_close_reader(fixture, request):
    virtual=request.getfixturevalue(fixture)
    image=virtual.conn.image
    for axis,size in zip('TCZYX',[2,2,1,4000,5000]):
        setattr(image,'getSize'+axis,lambda size=size:size)
    image.getPixelsId=lambda:17
    calls=[]
    def tile(z,c,t,x,y,w,h):
        calls.append((z,c,t,x,y,w,h))
        values=((np.arange(h,dtype=np.uint32)[:,None]+y)*13+np.arange(w)+x+c*100+t*1000)%65535
        return values.astype('>u2').tobytes()
    close=[]
    reader=SimpleNamespace(setPixelsId=lambda *args:None,setResolutionLevel=lambda level:None,
                           getTile=tile,close=lambda:close.append(True))
    virtual.conn.createRawPixelsStore=lambda:reader
    model=json.loads(views.capabilities(req(),42,conn=virtual.conn).content)
    assert model['store']['native_samples_url']
    request=req(model['store']['context'])
    from django.test import RequestFactory
    request.GET=RequestFactory().get('/',{'channels':'[1,0]','t':'1','tile_size':'1024'}).GET
    response=stats.native_samples(request,42,conn=virtual.conn)
    assert response.status_code==200,response.content
    n,=struct.unpack('<I',response.content[:4]);header=json.loads(response.content[4:4+n]);data=np.frombuffer(response.content[4+n:],dtype='<u2')
    actual_calls=list(calls)
    coordinates=[(x*1024,y*1024) for y in [0,1,2,3] for x in [0,1,3,4]]
    cursor=0
    for item in header['channels']:
        expected=[]
        for x,y in coordinates:
            w,h=min(1024,5000-x),min(1024,4000-y)
            # Existing frontend appendSample uses a fixed per-tile sample budget.
            pixels=np.frombuffer(tile(0,item['index'],1,x,y,w,h),dtype='>u2')
            expected.extend(pixels[::math.ceil(pixels.size/(262144//16))].tolist())
        np.testing.assert_array_equal(data[cursor:cursor+item['count']],expected);cursor+=item['count']
    assert close==[True] and cursor==len(data)
    assert response['Cache-Control']=='private, no-store'
    assert len(actual_calls)==32 and all(call[2]==1 for call in actual_calls)
    assert stats.native_samples(req(),42,conn=virtual.conn).status_code==401
    assert stats.native_samples(req(model['store']['context']),43,conn=virtual.conn).status_code==403
    for query in [{'channels':'[2]'}, {'channels':'[0,0]'}, {'channels':'[true]'}, {'tile_size':'1025'}, {'t':'2'}]:
        invalid=req(model['store']['context']);invalid.GET=RequestFactory().get('/',query).GET
        assert stats.native_samples(invalid,42,conn=virtual.conn).status_code==400
    reader.getTile=lambda *args: (_ for _ in ()).throw(RuntimeError('reader failed'))
    assert stats.native_samples(request,42,conn=virtual.conn).status_code==500
    assert close==[True,True]
    virtual.conn.image=None
    assert stats.native_samples(request,42,conn=virtual.conn).status_code==404

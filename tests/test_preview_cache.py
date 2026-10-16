import base64
from io import BytesIO
import json
import numpy as np
from PIL import Image

from biomero_zarr_viewer import preview_cache,volume_cache,views
from biomero_zarr_viewer.tokens import make_read_context
from .fakes import FakeConnection
from .test_views import _request
from .zarr_helpers import write_volume_group


def test_preview_pixels_channel_ranges_and_cache_reuse(configure_storage,tmp_path,monkeypatch,zarr_format):
    _,mount=configure_storage
    monkeypatch.setenv("BIOMERO_ZARR_CACHE_DIR",str(tmp_path/"cache"))
    monkeypatch.setenv("BIOMERO_ZARR_CACHE_MAX_BYTES","1000000")
    data=np.zeros((1,2,2,8,8),np.uint16)
    data[0,0,1]=25;data[0,1,1]=35
    attrs={'version':'0.5','multiscales':[{'axes':[{'name':a} for a in 'tczyx'],'datasets':[{'path':'0'}]}]}
    write_volume_group(mount/'image.zarr',data,(1,2,1,8,8),attrs,zarr_format)
    claims={'uid':7,'gid':13,'store':'image.zarr'}
    channels=[{'index':0,'color':'#FF0000','low':0,'high':100},{'index':1,'color':'#00FF00','low':0,'high':100}]
    def render():return preview_cache.render_preview(claims,'scope','.',32,channels,1,0,views._safe_data_path)
    first=render()
    image=np.asarray(Image.open(BytesIO(base64.b64decode(first['url'].split(',')[1]))))
    np.testing.assert_array_equal(image[0,0],[63,89,0])
    files=list(volume_cache.cache_root().glob('*.bin'));assert len(files)==1
    timestamp=files[0].stat().st_mtime_ns
    assert render()==first and files[0].stat().st_mtime_ns==timestamp
    conn=FakeConnection();token,_=make_read_context(_request('/'),conn,42,'image.zarr')
    query={'fields':json.dumps(['.','../outside']),'channels':json.dumps(channels),'size':'32','z':'1'}
    result=views.cached_previews(_request('/',token=token,data=query),42,conn=conn)
    body=json.loads(result.content)
    assert body['previews'][0]['width']==8 and 'error' in body['previews'][1]
    assert views.cached_previews(_request('/',data=query),42,conn=conn).status_code==401

"""Check the installed provider against original pixels, codecs and pyramid levels."""
import inspect,itertools,json,tempfile
from pathlib import Path
from types import SimpleNamespace
import django,numpy as np,zarr
from django.conf import settings
from django.http import HttpRequest
settings.configure(SECRET_KEY="provider-build-check",ROOT_URLCONF='omero_web_zarr.urls',INSTALLED_APPS=["django.contrib.auth","django.contrib.contenttypes"])
django.setup()
from omero_web_zarr import views


class Image:
    def __init__(self, levels):
        self.levels=levels;self._re=None;self.closed=0;self.id=1
    def _size(self,axis):return self.levels[0].shape['TCZYX'.index(axis)]
    def getSizeT(self):return self._size('T')
    def getSizeC(self):return self._size('C')
    def getSizeZ(self):return self._size('Z')
    def getSizeY(self):return self._size('Y')
    def getSizeX(self):return self._size('X')
    def getPixelsId(self):return 1
    def getId(self):return 1
    def requiresPixelsPyramid(self):return len(self.levels)>1
    def getZoomLevelScaling(self):
        self._re=SimpleNamespace(getDefaultT=lambda:0,getDefaultZ=lambda:0,getResolutionDescriptions=lambda:[SimpleNamespace(sizeX=a.shape[-1],sizeY=a.shape[-2]) for a in self.levels])
        return {i:1/2**i for i in range(len(self.levels))}
    def _closeRE(self):self._re=None;self.closed+=1
    def getPrimaryPixels(self):
        name={'float32':'float','float64':'double'}.get(self.levels[0].dtype.name,self.levels[0].dtype.name)
        return SimpleNamespace(getPixelsType=lambda:SimpleNamespace(getValue=lambda:name))
    def getChannels(self):self.getZoomLevelScaling();return []
    def isGreyscaleRenderingModel(self):return True
    def getPixelSizeX(self,units=True):return self.physical(.5)
    def getPixelSizeY(self,units=True):return self.physical(.5)
    def getPixelSizeZ(self,units=True):return self.physical(1.5)
    def physical(self,value):return SimpleNamespace(getValue=lambda:value,getUnit=lambda:'MICROMETER')


class Pixels:
    def __init__(self,image):self.image=image;self.level=len(image.levels)-1;self.closed=False
    def setPixelsId(self,*args):pass
    def setResolutionLevel(self,level):self.level=level
    def getTile(self,z,c,t,x,y,w,h):
        plane=self.image.levels[len(self.image.levels)-1-self.level][t,c,z,y:y+h,x:x+w]
        return plane.astype(plane.dtype.newbyteorder('>')).tobytes()
    def close(self):self.closed=True


def check(levels):
    image=Image(levels);readers=[]
    def reader():
        value=Pixels(image);readers.append(value);return value
    conn=SimpleNamespace(getObject=lambda *args:image,createRawPixelsStore=reader)
    for version in ('0.4','0.5'):
        for level,expected in enumerate(levels):
            function=views.image_zarray if version=='0.4' else views.image_zarr_json
            response=inspect.unwrap(function)(HttpRequest(),iid=1,level=str(level),conn=conn)
            meta=json.loads(response.content)
            expected=expected[tuple(slice(None) if size>1 or axis in 'YX' else 0 for axis,size in zip('TCZYX',expected.shape))]
            assert tuple(meta['shape'])==expected.shape
            chunks=meta['chunks'] if version=='0.4' else meta['chunk_grid']['configuration']['chunk_shape']
            for fast in (False,True):
                with tempfile.TemporaryDirectory() as directory:
                    root=Path(directory);(root/('.zarray' if version=='0.4' else 'zarr.json')).write_bytes(response.content)
                    for index in itertools.product(*(range((n+c-1)//c) for n,c in zip(meta['shape'],chunks))):
                        chunk='/'.join(map(str,index))
                        options={'array_metadata':meta,'resolution_level':len(levels)-1-level,'_image':image} if fast else {}
                        result=inspect.unwrap(views.image_chunk)(HttpRequest(),iid=1,level=str(level),chunk=chunk,conn=conn,version=version,**options)
                        path=root/(chunk if version=='0.4' else 'c/'+chunk)
                        path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(result.content)
                    actual=zarr.open_array(root,mode='r')[:]
                    assert np.array_equal(actual,expected),(version,level,fast,actual.shape,expected.shape)
                assert image._re is None
    root=json.loads(inspect.unwrap(views.image_zarr_json)(HttpRequest(),iid=1,conn=conn).content)
    assert root['attributes']['ome']['version']=='0.5'
    assert root['attributes']['ome']['multiscales'][0]['datasets'][0]['coordinateTransformations'][0]['scale'][-2:]==[.5,.5]
    for version in ('0.3','0.4'):
        attrs=json.loads(inspect.unwrap(views.image_zattrs)(HttpRequest(),iid=1,conn=conn,version=version).content)
        assert attrs['multiscales'][0]['version']==version
    assert image._re is None
    assert all(reader.closed for reader in readers)


check([np.zeros((1,1,1,4,4),dtype=np.uint8)])
check([(np.arange(2*3*10*7*9).reshape(2,3,10,7,9)*257%65535).astype(np.uint16)])
full=(np.arange(3*1040*1290).reshape(1,3,1,1040,1290)%251).astype(np.uint8)
check([full,full[...,::4,::4]])
u16=(np.arange(34*39).reshape(1,1,1,34,39)*257%65535).astype(np.uint16)
check([u16,u16[...,::4,::4]])
check([np.arange(7,dtype=np.uint16).reshape(1,1,1,1,7)])
check([np.linspace(-3,7,30,dtype=np.float32).reshape(1,1,1,5,6)])
from django.urls import resolve,Resolver404
for path in ('/v0.5/image/1.zarr/zarr.json','/v0.5/image/1.zarr/0/zarr.json','/v0.5/image/1.zarr/0/c/0/0'):
    assert resolve(path).func is not None
try:resolve('/v0.5/image/1.zarr/0/.zarray')
except Resolver404:pass
else:raise AssertionError('v2 metadata must not masquerade as 0.5')
from django.http import Http404
image=Image([np.zeros((1,1,1,4,4),dtype=np.uint16)])
class BrokenPixels(Pixels):
    def getTile(self,*args):raise RuntimeError('simulated reader failure')
broken=BrokenPixels(image)
conn=SimpleNamespace(getObject=lambda *args:image,createRawPixelsStore=lambda:broken)
try:inspect.unwrap(views.image_chunk)(HttpRequest(),iid=1,level='0',chunk='0/0',conn=conn,version='0.5')
except RuntimeError:pass
else:raise AssertionError('Reader failure must propagate')
assert broken.closed and image._re is None
for key in ('0//0','-1/0','9/0'):
    try:inspect.unwrap(views.image_chunk)(HttpRequest(),iid=1,level='0',chunk=key,conn=conn,version='0.5')
    except Http404:pass
    else:raise AssertionError('Invalid chunk must be rejected')
denied=SimpleNamespace(getObject=lambda *args:None)
for fn,options in [(views.image_zarr_json,{}),(views.image_chunk,{'level':'0','chunk':'0/0','version':'0.5'})]:
    try:inspect.unwrap(fn)(HttpRequest(),iid=1,conn=denied,**options)
    except Http404:pass
    else:raise AssertionError('Unreadable image must be rejected')
print('Provider 0.3/0.4/0.5: exact black, uint16, float32, singleton XY, T/C/Z groups, padded edges and native pyramids; all readers closed; unsharded 0.5 metadata/routes/calibration valid')

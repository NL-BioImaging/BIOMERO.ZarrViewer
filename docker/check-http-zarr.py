"""Check the installed provider against original pixels, codecs and pyramid levels."""
import inspect,itertools,json,tempfile
from pathlib import Path
from types import SimpleNamespace
import django,numpy as np,zarr
from django.conf import settings
from django.http import HttpRequest
settings.configure(SECRET_KEY="provider-build-check",INSTALLED_APPS=["django.contrib.auth","django.contrib.contenttypes"])
django.setup()
from omero_web_zarr import views


class Image:
    def __init__(self, levels):
        self.levels=levels;self._re=None;self.closed=0
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
        self._re=SimpleNamespace(getResolutionDescriptions=lambda:[SimpleNamespace(sizeX=a.shape[-1],sizeY=a.shape[-2]) for a in self.levels])
        return {i:1/2**i for i in range(len(self.levels))}
    def _closeRE(self):self._re=None;self.closed+=1
    def getPrimaryPixels(self):
        return SimpleNamespace(getPixelsType=lambda:SimpleNamespace(getValue=lambda:self.levels[0].dtype.name))


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
    for level,expected in enumerate(levels):
        response=inspect.unwrap(views.image_zarray)(HttpRequest(),iid=1,level=str(level),conn=conn)
        meta=json.loads(response.content)
        expected=expected[tuple(slice(None) if size>1 or axis in 'YX' else 0 for axis,size in zip('TCZYX',expected.shape))]
        assert tuple(meta['shape'])==expected.shape
        for fast in (False,True):
            with tempfile.TemporaryDirectory() as directory:
                root=Path(directory);(root/'.zarray').write_bytes(response.content)
                for index in itertools.product(*(range((n+c-1)//c) for n,c in zip(meta['shape'],meta['chunks']))):
                    chunk='/'.join(map(str,index))
                    options={'array_metadata':meta,'resolution_level':len(levels)-1-level,'_image':image} if fast else {}
                    result=inspect.unwrap(views.image_chunk)(HttpRequest(),iid=1,level=str(level),chunk=chunk,conn=conn,**options)
                    path=root/chunk;path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(result.content)
                actual=zarr.open_array(root,mode='r')[:]
                assert np.array_equal(actual,expected),(level,fast,actual.shape,expected.shape)
            assert image._re is None
    assert all(reader.closed for reader in readers)


check([np.zeros((1,1,1,4,4),dtype=np.uint8)])
check([(np.arange(2*3*10*7*9).reshape(2,3,10,7,9)*257%65535).astype(np.uint16)])
full=(np.arange(3*1040*1290).reshape(1,3,1,1040,1290)%251).astype(np.uint8)
check([full,full[...,::4,::4]])
u16=(np.arange(34*39).reshape(1,1,1,34,39)*257%65535).astype(np.uint16)
check([u16,u16[...,::4,::4]])
print('Provider: exact black, uint16 endianness, T/C/Z groups, padded edges and native pyramid levels; all readers closed')

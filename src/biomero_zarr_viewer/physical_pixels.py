"""Bounded, exact physical pixel reads with per-key mount validation."""
import asyncio
import math
import numpy as np
import zarr
try:
    from zarr.storage import LocalStore
except ImportError:  # Zarr-Python 2 on Python 3.10 installations.
    LocalStore = None
    from zarr.storage import DirectoryStore

from django.http import HttpResponse
from django.views.decorators.http import require_GET
from .errors import DataNotFound, InvalidROI, ROILimitExceeded
from .tokens import filesystem_context, validate_read_context
from .views import _safe_data_path, api_errors, login_required


class ValidatedStore(LocalStore if LocalStore is not None else object):
    def __init__(self, claims, array_path):
        # Anchor the store itself and validate requested keys through the routes.
        root,_=_safe_data_path(claims["store"],array_path,claims.get("routes",[]),allow_directory=True)
        super().__init__(root, read_only=True)
        self.claims, self.array_path, self.paths = claims, array_path.strip("/"), {}

    async def get(self, key, prototype=None, byte_range=None):
        if key not in self.paths:
            try:
                path, _ = _safe_data_path(self.claims['store'], self.array_path+'/'+key, self.claims.get('routes', []))
                if key in ('zarr.json', '.zarray', '.zattrs') and path.stat().st_size > 4*1024*1024:
                    raise ROILimitExceeded('Array metadata exceeds 4 MiB')
                self.paths[key] = path
            except DataNotFound:
                self.paths[key] = None
        path = self.paths[key]
        if path is None:
            return None
        return await LocalStore(path.parent, read_only=True).get(path.name, prototype=prototype, byte_range=byte_range)

    async def get_partial_values(self, prototype, key_ranges):
        return await asyncio.gather(*(self.get(key, prototype, byte_range) for key, byte_range in key_ranges))


def open_physical_array(claims, path):
    if LocalStore is not None:
        store=ValidatedStore(claims, path)
    else:
        class ValidatedDirectoryStore(DirectoryStore):
            def __getitem__(self, key):
                try:
                    candidate,_=_safe_data_path(claims['store'],path+'/'+key,claims.get('routes',[]))
                except DataNotFound as exc:
                    raise KeyError(key) from exc
                if key in ('.zarray','.zattrs') and candidate.stat().st_size>4*1024*1024:
                    raise ROILimitExceeded('Array metadata exceeds 4 MiB')
                return candidate.read_bytes()
            def __contains__(self,key):
                try:self[key];return True
                except KeyError:return False
        root,_=_safe_data_path(claims['store'],path,claims.get('routes',[]),allow_directory=True)
        store=ValidatedDirectoryStore(str(root))
    return zarr.open_array(store=store, mode='r')


@require_GET
@login_required(setGroupContext=True)
@api_errors
def tile(request, image_id, conn=None, **kwargs):
    claims = filesystem_context(validate_read_context(request, conn, image_id))
    path=request.GET.get('array','')
    if not path or path.startswith('/'):
        raise InvalidROI('A relative array path is required')
    array = open_physical_array(claims,path)
    axes = request.GET.get('axes', '').split(',')
    if len(axes) != array.ndim or len(set(axes)) != len(axes) or set(axes)-set('tczyx') or not {'x','y'} <= set(axes):
        raise InvalidROI('Invalid tile axes')
    if math.prod(array.chunks)*array.dtype.itemsize > 64*1024*1024:
        raise ROILimitExceeded('Source chunks exceed 64 MiB')
    try:
        x,y,size,z,t,c = [int(request.GET.get(k,d)) for k,d in [('x',0),('y',0),('size',256),('z',0),('t',0),('c',0)]]
    except (TypeError,ValueError) as exc:
        raise InvalidROI('Invalid tile selection') from exc
    if not 1 <= size <= 512 or min(x,y,z,t,c)<0:
        raise InvalidROI('Invalid tile bounds')
    selection=[]
    for axis,extent in zip(axes,array.shape):
        if axis in 'xy':
            start=(x if axis=='x' else y)*size
            if start>=extent: raise InvalidROI('Tile outside image')
            selection.append(slice(start,min(start+size,extent)))
        else:
            index={'c':c,'z':z,'t':t}[axis]
            if index>=extent: raise InvalidROI('Tile selection outside image')
            selection.append(index)
    if array.dtype.kind not in 'uif' or array.dtype.itemsize>8 or (array.dtype.kind in 'ui' and array.dtype.itemsize>4):
        raise InvalidROI('Unsupported tile dtype')
    data=np.asarray(array[tuple(selection)])
    if axes.index('x')<axes.index('y'): data=data.T
    data=np.ascontiguousarray(data,dtype=array.dtype.newbyteorder('<'))
    response=HttpResponse(data.tobytes(),content_type='application/octet-stream')
    response['X-Zarr-Width']=str(data.shape[1]);response['X-Zarr-Height']=str(data.shape[0])
    response['Cache-Control']='private, no-store';response['X-Content-Type-Options']='nosniff'
    return response

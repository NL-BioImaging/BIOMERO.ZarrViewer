"""Bounded native samples without encoding and transferring full WSI tiles."""
import json
import math
import struct

import numpy as np
from django.http import HttpResponse
from django.views.decorators.http import require_GET

from .errors import InvalidROI, UnsupportedStore
from .tokens import validate_read_context
from .views import api_errors, login_required
from .neuroglancer import authorized_http_source

SAMPLE_BUDGET = 262144


def eligible(image):
    return image.getSizeZ() == 1 and image.getSizeC() <= 4 and image.getSizeX()*image.getSizeY() > 16*1024*1024


def sample_indices(count):
    n = min(count, 4)
    return sorted({math.floor(i*(count-1)/max(1,n-1)+.5) for i in range(n)})


@require_GET
@login_required(setGroupContext=True)
@api_errors
def native_samples(request, image_id, conn=None, **kwargs):
    source = authorized_http_source(validate_read_context(request, conn, image_id), conn, image_id)
    if source is None or not eligible(source.image):
        raise UnsupportedStore("Native sample batching requires a large virtual 2D image")
    image = source.image
    try:
        channels = json.loads(request.GET.get('channels','[0]'))
        t = int(request.GET.get('t','0'))
        tile = int(request.GET.get('tile_size','1024'))
        if (not isinstance(channels,list) or not 1 <= len(channels) <= 4 or len(set(channels)) != len(channels)
                or any(type(c) is not int or not 0 <= c < image.getSizeC() for c in channels)
                or not 0 <= t < image.getSizeT() or not 1 <= tile <= 1024):
            raise ValueError()
    except (ValueError,TypeError) as exc:
        raise InvalidROI("Invalid native sample selection") from exc
    meta = source.array_metadata('0')
    dtype = np.dtype(meta['dtype'] if source.version == '0.4' else meta['data_type']).newbyteorder('<')
    width,height = image.getSizeX(),image.getSizeY()
    coordinates = [(x*tile,y*tile) for y in sample_indices(math.ceil(height/tile))
                   for x in sample_indices(math.ceil(width/tile))]
    per_tile = SAMPLE_BUDGET//len(coordinates)
    values = {c:[] for c in channels}
    reader = conn.createRawPixelsStore()
    try:
        reader.setPixelsId(image.getPixelsId(),False)
        reader.setResolutionLevel(len(source.levels())-1)
        # Reuse one authenticated reader, including its RGB tile cache, across C.
        for x,y in coordinates:
            w,h = min(tile,width-x),min(tile,height-y)
            stride = max(1,math.ceil(w*h/per_tile))
            for channel in channels:
                raw = reader.getTile(0,channel,t,x,y,w,h)
                pixels = np.frombuffer(raw,dtype=dtype.newbyteorder('>'))
                if pixels.size != w*h:
                    raise InvalidROI("The native sample tile has an unexpected size")
                sample = pixels[::stride][:per_tile]
                values[channel].append(sample[np.isfinite(sample)].astype(dtype))
    finally:
        reader.close()
    arrays = [np.concatenate(values[c]) for c in channels]
    header = json.dumps({'dtype':dtype.str,'channels':[{'index':c,'count':a.size} for c,a in zip(channels,arrays)]}).encode()
    response = HttpResponse(struct.pack('<I',len(header))+header+b''.join(a.tobytes() for a in arrays),content_type='application/octet-stream')
    response['Cache-Control'] = 'private, no-store'
    response['X-Content-Type-Options'] = 'nosniff'
    return response

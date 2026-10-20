#
# Copyright (c) 2021-2022 University of Dundee.
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as
# published by the Free Software Foundation, either version 3 of the
# License, or (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with this program.  If not, see <http://www.gnu.org/licenses/>.
#

from django.http.response import Http404
import numpy as np
import numcodecs
from contextlib import contextmanager
import json
import requests

from django.http import HttpResponse, JsonResponse
from django.urls import reverse
from django.shortcuts import redirect

from .utils import marshal_axes, marshal_axes_v3
from .utils import generate_coordinate_transformations

from omero.model.enums import PixelsTypeint8, PixelsTypeuint8, PixelsTypeint16
from omero.model.enums import PixelsTypeuint16, PixelsTypeint32
from omero.model.enums import PixelsTypeuint32, PixelsTypefloat
from omero.model.enums import PixelsTypedouble
from omeroweb.webclient.decorators import login_required
from omeroweb.webgateway.marshal import channelMarshal

PIXEL_TYPES = {
    PixelsTypeint8: np.int8,
    PixelsTypeuint8: np.uint8,
    PixelsTypeint16: np.int16,
    PixelsTypeuint16: np.uint16,
    PixelsTypeint32: np.int32,
    PixelsTypeuint32: np.uint32,
    PixelsTypefloat: np.float32,
    PixelsTypedouble: np.float64
}


# Derived performance variant of the pinned upstream views; see docker/provider-README.md.
CHUNK_METADATA_API = 1
OPTIMIZED_LAYOUT = 'v2-z8-1024'

@contextmanager
def _read_image(conn, iid, supplied=None):
    image = supplied if supplied is not None else conn.getObject('Image', iid)
    if image is None:
        raise Http404('Image is not readable')
    if supplied is not None and int(image.getId()) != int(iid):
        raise Http404('Image context does not match')
    previous = getattr(image, '_re', None)
    try:
        yield image
    finally:
        close = getattr(image, '_closeRE', None)
        if close and previous is None: close()

def _array_metadata(image, level):
    return {'zarr_format': 2, 'shape': get_image_shape(image, level),
            'chunks': get_chunk_shape(image),
            'dtype': np.dtype(PIXEL_TYPES[image.getPrimaryPixels().getPixelsType().getValue()]).str,
            'compressor': numcodecs.Zstd(level=1).get_config(),
            'fill_value': 0, 'order': 'C', 'filters': None, 'dimension_separator': '/'}



@login_required()
def index(request, conn=None, **kwargs):
    """
    omero-web-zarr app Home page
    """
    home = request.build_absolute_uri(reverse("omero_web_zarr_index"))
    return HttpResponse(
        "To open an Image in Vizarr go to "
        "https://hms-dbmi.github.io/vizarr/?source=%simage/[IMAGE_ID].zarr"
        % home
    )


@login_required()
def image_zattrs(request, iid, version, conn=None, **kwargs):

    if version not in ("0.3", "0.4"):
        raise Http404("version not supported")

    with _read_image(conn, iid, kwargs.get('_image')) as image:

        levels = [0]
        if image.requiresPixelsPyramid():
            # init the rendering engine
            image.getZoomLevelScaling()
            res_descs = image._re.getResolutionDescriptions()
            levels = range(len(res_descs))

        datasets = [{"path": str(level)} for level in levels]

        if version != "0.3":
            shapes = get_image_shapes(image)
            transformations = generate_coordinate_transformations(shapes)
            for dataset, transform in zip(datasets, transformations):
                dataset["coordinateTransformations"] = transform

        rv = {
            "multiscales": [
                {
                    "datasets": datasets,
                    "version": version,
                    "axes": marshal_axes(image, version)
                }
            ],
            "omero": {
                "channels": [channelMarshal(x) for x in image.getChannels()],
                "id": image.id,
                "rdefs": {
                    "defaultT": image._re.getDefaultT(),
                    "defaultZ": image._re.getDefaultZ(),
                    "model": (image.isGreyscaleRenderingModel()
                              and "greyscale" or "color"),
                }
            }
        }
        return JsonResponse(rv)


def image_zgroup(request, **kwargs):
    return JsonResponse({"zarr_format": 2})


def get_image_shape(image, level):

    shapes = get_image_shapes(image)
    if level >= len(shapes):
        raise Exception(
            "Level %s higher than %s levels for this image" %
            (level, len(shapes)))
    return shapes[level]


def get_image_shapes(image):

    shape = [getattr(image, 'getSize' + dim)() for dim in ('TCZYX')]
    base_shape = [size for size in shape if size > 1]
    # For down-sampled levels of pyramid, get shape
    shapes = [base_shape]
    if image.requiresPixelsPyramid():
        # init the rendering engine
        image.getZoomLevelScaling()
        levels = image._re.getResolutionDescriptions()
        for level in levels[1:]:
            shape = base_shape[:]
            shape[-1] = level.sizeX
            shape[-2] = level.sizeY
            shapes.append(shape)
    return shapes


def get_chunk_shape(image):
    # Keep browser chunks bounded, and amortize reader setup across Z slices.
    width, height = min(image.getSizeX(), 1024), min(image.getSizeY(), 1024)
    pixel_type = image.getPrimaryPixels().getPixelsType().getValue()
    plane_bytes = width * height * np.dtype(PIXEL_TYPES[pixel_type]).itemsize
    depth = min(image.getSizeZ(), 8, max(1, (2 * 1024 * 1024) // plane_bytes))
    chunks = []
    for dim in ('TCZ'):
        if getattr(image, 'getSize' + dim)() > 1:
            chunks.append(depth if dim == 'Z' else 1)
    return chunks + [height, width]


@login_required()
def image_zarray(request, iid, level, conn=None, **kwargs):
    with _read_image(conn, iid, kwargs.get('_image')) as image:
        return JsonResponse(_array_metadata(image, int(level)))


@login_required()
def image_chunk(request, iid, level, chunk, conn=None,
                array_metadata=None, resolution_level=None, **kwargs):
    with _read_image(conn, iid, kwargs.get('_image')) as image:
        level = int(level)
        axes = marshal_axes_v3(image)
        dims = [int(dim) for dim in chunk.split('/')]
        meta = array_metadata if array_metadata is not None else _array_metadata(image, level)
        shape, chunks = meta['shape'], meta['chunks']
        if len(dims) != len(axes) or any(i < 0 or i * c >= n for i, c, n in zip(dims, chunks, shape)):
            raise Http404('Chunk is outside the image')
        dtype = np.dtype(meta['dtype'])
        if np.prod(chunks, dtype=np.int64) * dtype.itemsize > 32 * 1024 * 1024:
            raise Http404('Chunk exceeds 32 MiB')
        start = dict(zip(axes, [i*c for i,c in zip(dims,chunks)]))
        x, y = start['x'], start['y']
        width, height = min(chunks[-1], shape[-1]-x), min(chunks[-2], shape[-2]-y)
        if resolution_level is None:
            resolution_level = len(get_image_shapes(image)) - 1 - level
        data = np.zeros(chunks, dtype=dtype)
        pixels = conn.createRawPixelsStore()
        try:
            pixels.setPixelsId(image.getPixelsId(), False)
            pixels.setResolutionLevel(int(resolution_level))
            depth = chunks[axes.index('z')] if 'z' in axes else 1
            available = shape[axes.index('z')]-start['z'] if 'z' in axes else 1
            for dz in range(min(depth, available)):
                raw = pixels.getTile(start.get('z',0)+dz, start.get('c',0), start.get('t',0), x, y, width, height)
                # OMERO RawPixelsStore returns network-order (big-endian) pixels.
                plane = np.frombuffer(raw, dtype=dtype.newbyteorder('>')).reshape(height,width)
                index = [0] * (len(chunks)-2)
                if 'z' in axes: index[axes.index('z')] = dz
                data[tuple(index)+(slice(0,height),slice(0,width))] = plane
        finally:
            pixels.close()
        # Encode the exact advertised codec, without temporary Zarr directories.
        encoded = numcodecs.get_codec(meta['compressor']).encode(data)
        response = HttpResponse(bytes(encoded), content_type='application/octet-stream')
        response['Content-Length'] = len(encoded)
        return response


def apps(request, app, url):
    """
    Self-host app (vizarr or ome-ngff-validator) to avoid CORS issues

    Delegate all vizarr requests to https://hms-dbmi.github.io/vizarr/
    and validator requests to https://ome.github.io/ome-ngff-validator/
    """

    # Both vizarr and validator use 'source'
    # Openwith initially uses a 'source' that is not a valid URL e.g.
    # http://omero-server.org/zarr/vizarr/?source=/zarr/image/3978085.zarr
    # If so, make the 'source' absolute and redirect...
    source = request.GET.get("source")
    if source is not None and not source.startswith("http"):
        source = request.build_absolute_uri(source)
        new_url = reverse("zarr_app", kwargs={"url": "", "app": app})
        return redirect(new_url + "?source=" + source)

    base_urls = {
        "vizarr": "https://hms-dbmi.github.io/vizarr/",
        "validator": "https://ome.github.io/ome-ngff-validator/",
    }
    if app not in base_urls:
        raise Http404("App: %s not found" % app)

    base_url = base_urls[app]
    target_url = base_url + url

    response = requests.get(target_url)

    rsp = HttpResponse(response.content)

    if url.endswith(".js"):
        rsp['content-type'] = "application/javascript"

    return rsp

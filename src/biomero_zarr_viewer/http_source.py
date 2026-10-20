"""Optional, same-origin OME-Zarr API for ordinary OMERO images.

The trusted omero-web-zarr Django views supply the HTTP representation. Calling
their implementation with our authenticated connection avoids recursive HTTP
requests into Gunicorn, cookie forwarding, arbitrary URLs and worker deadlocks.
No pixels are exported at capability time or cached in a shared filesystem.
"""

import importlib
import inspect
import asyncio
import json
import math
import re
import tempfile
from threading import RLock
from collections.abc import MutableMapping
from pathlib import Path, PurePosixPath

import numpy as np
from django.apps import apps
from django.http import Http404, HttpRequest

from .errors import DataNotFound, InvalidMetadata, ROILimitExceeded, UnsafePath
from .settings import http_enabled, max_metadata_bytes

BACKEND = "omero-web-zarr"
MAX_CHUNK_BYTES = 32 * 1024 * 1024


def available():
    # Do not import an optional package in ordinary physical-store deployments.
    if not http_enabled() or not apps.is_installed("omero_web_zarr"):
        return False
    try:
        provider_views()
    except ImportError:
        return False
    return True


def provider_views():
    return importlib.import_module("omero_web_zarr.views")


def resolve_http_store(image, conn):
    from .resolver import ResolvedStore
    image_id = int(image.getId())
    return ResolvedStore(
        image=image, image_id=image_id, image_name=str(image.getName()),
        path=None, relative=PurePosixPath(f"__omero_web_zarr__/{image_id}"),
        recorded_root=PurePosixPath("."), recorded_files=(),
        http=HttpZarrSource(image, conn),
    )


class HttpZarrSource:
    def __init__(self, image, conn):
        self.image, self.conn = image, conn
        self.image_id = int(image.getId())
        self.documents = {}
        self._provider_lock = RLock()
        self.request = HttpRequest()
        self.request.method = "GET"

    def _call(self, name, **kwargs):
        function = inspect.unwrap(getattr(provider_views(), name))
        try:
            with self._provider_lock:
                response = function(self.request, iid=self.image_id, conn=self.conn, **kwargs)
        except Http404 as exc:
            raise DataNotFound("The virtual Zarr key does not exist") from exc
        if response.status_code != 200:
            raise DataNotFound("The virtual Zarr provider could not read this key")
        content = bytes(response.content)
        if len(content) > MAX_CHUNK_BYTES:
            raise ROILimitExceeded("The virtual Zarr response exceeds the chunk limit")
        return content

    def _json(self, key, function, **kwargs):
        if key not in self.documents:
            content = self._call(function, **kwargs)
            if len(content) > max_metadata_bytes():
                raise InvalidMetadata("Virtual Zarr metadata exceeds the configured size limit")
            try:
                value = json.loads(content)
            except (ValueError, UnicodeError) as exc:
                raise InvalidMetadata("The virtual Zarr provider returned invalid JSON") from exc
            if not isinstance(value, dict):
                raise InvalidMetadata("Virtual Zarr metadata must be an object")
            self.documents[key] = value
        return self.documents[key]

    def levels(self):
        attrs = self._json("raw-attrs", "image_zattrs", version="0.4")
        multiscales = attrs.get("multiscales", [])
        if not isinstance(multiscales, list) or len(multiscales) != 1:
            raise InvalidMetadata("The virtual image must contain one multiscale")
        datasets = multiscales[0].get("datasets", [])
        if not isinstance(datasets, list) or not 1 <= len(datasets) <= 64:
            raise InvalidMetadata("The virtual image has invalid pyramid levels")
        levels = [item.get("path") for item in datasets if isinstance(item, dict)]
        if len(levels) != len(datasets) or any(not isinstance(level, str) or not re.fullmatch(r"\d+", level) for level in levels):
            raise InvalidMetadata("Virtual pyramid levels must be numeric paths")
        return levels

    def array_metadata(self, level):
        if level not in self.levels():
            raise DataNotFound("The virtual pyramid level does not exist")
        meta = self._json(f"{level}/.zarray", "image_zarray", level=level)
        shape, chunks = meta.get("shape"), meta.get("chunks")
        if not isinstance(shape, list) or not isinstance(chunks, list) or not 2 <= len(shape) <= 5 or len(shape) != len(chunks):
            raise InvalidMetadata("Virtual array dimensions are invalid")
        if any(type(n) is not int or n < 1 for n in [*shape, *chunks]):
            raise InvalidMetadata("Virtual array dimensions must be positive integers")
        try:
            dtype = np.dtype(meta["dtype"])
        except (KeyError, TypeError) as exc:
            raise InvalidMetadata("The virtual image pixel type is invalid") from exc
        if dtype.kind not in "biuf" or dtype.itemsize > 8:
            raise InvalidMetadata("The virtual image pixel type is unsupported")
        if math.prod(chunks) * dtype.itemsize > MAX_CHUNK_BYTES:
            raise ROILimitExceeded("The virtual Zarr chunk exceeds 32 MiB")
        if meta.get("zarr_format") != 2 or meta.get("dimension_separator") != "/":
            raise InvalidMetadata("The provider must supply Zarr v2 with nested chunk keys")
        return meta

    def attributes(self):
        attrs = json.loads(json.dumps(self._json("raw-attrs", "image_zattrs", version="0.4")))
        multiscale = attrs["multiscales"][0]
        axes = multiscale.get("axes", [])
        # The provider historically emits relative pyramid scales even when its
        # axes declare physical units. Derive absolute scales from OMERO sizes
        # and each level's shape, avoiding wrong calibration or double scaling.
        for dataset in multiscale["datasets"]:
            shape = self.array_metadata(dataset["path"])["shape"]
            if len(shape) != len(axes):
                raise InvalidMetadata("Virtual image axes do not match its array dimensions")
            scale = []
            for axis, size in zip(axes, shape):
                name = axis.get("name")
                if name not in ("t", "c", "z", "y", "x"):
                    raise InvalidMetadata("Unsupported virtual image axis")
                value = getattr(self.image, f"getSize{name.upper()}")() / size
                if name in "xyz":
                    physical = getattr(self.image, f"getPixelSize{name.upper()}")(units=True)
                    if physical is not None:
                        value *= physical.getValue()
                scale.append(value)
            dataset["coordinateTransformations"] = [{"type": "scale", "scale": scale}]
        return attrs

    def read(self, key):
        if not isinstance(key, str) or len(key) > 256 or "\\" in key or "\x00" in key or any(part in ("", ".", "..") for part in key.split("/")):
            raise UnsafePath("The virtual Zarr key is unsafe")
        if key == ".zgroup":
            return b'{"zarr_format":2}'
        if key == ".zattrs":
            return json.dumps(self.attributes()).encode()
        match = re.fullmatch(r"(\d+)/(\.zarray|\.zattrs|\d+(?:/\d+)*)", key)
        if not match:
            raise DataNotFound("The virtual Zarr key does not exist")
        level, suffix = match.groups()
        meta = self.array_metadata(level)
        if suffix == ".zarray":
            return json.dumps(meta).encode()
        if suffix == ".zattrs":
            return b"{}"
        index = [int(value) for value in suffix.split("/")]
        if len(index) != len(meta["shape"]) or any(i >= (n + c - 1) // c for i, n, c in zip(index, meta["shape"], meta["chunks"])):
            raise DataNotFound("The virtual Zarr chunk is outside the image")
        return self._call("image_chunk", level=level, chunk=suffix)

    def model(self):
        from .metadata import inspect_store
        # Reuse the physical metadata validator; this temporary snapshot contains
        # only JSON, never exported image chunks, and is removed immediately.
        with tempfile.TemporaryDirectory(prefix="zarr-http-metadata-") as directory:
            root = Path(directory)
            for key in [".zgroup", ".zattrs", *[f"{level}/.zarray" for level in self.levels()]]:
                target = root / key
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(self.read(key))
            return inspect_store(root)

    def open_group(self):
        import zarr
        if int(zarr.__version__.split(".")[0]) >= 3:
            from zarr.storage import MemoryStore

            source = self

            class SourceStore(MemoryStore):
                async def get(self, key, prototype, byte_range=None):
                    try:
                        # The provider itself uses synchronous Zarr APIs to
                        # encode chunks. Never call those inside Zarr's loop.
                        value = await asyncio.to_thread(source.read, key)
                    except DataNotFound:
                        return None
                    if byte_range is not None:
                        from zarr.abc.store import RangeByteRequest, OffsetByteRequest, SuffixByteRequest
                        if isinstance(byte_range, RangeByteRequest):
                            value = value[byte_range.start:byte_range.end]
                        elif isinstance(byte_range, OffsetByteRequest):
                            value = value[byte_range.offset:]
                        elif isinstance(byte_range, SuffixByteRequest):
                            value = value[-byte_range.suffix:]
                    return prototype.buffer.from_bytes(value)

                async def exists(self, key):
                    try:
                        await asyncio.to_thread(source.read, key)
                        return True
                    except DataNotFound:
                        return False

            return zarr.open_group(store=SourceStore(read_only=True), mode="r", zarr_format=2, use_consolidated=False)

        source = self

        class SourceMapping(MutableMapping):
            def __getitem__(self, key):
                try:
                    return source.read(key)
                except DataNotFound as exc:
                    raise KeyError(key) from exc

            def __iter__(self):
                return iter([".zgroup", ".zattrs", *[f"{n}/.zarray" for n in source.levels()]])

            def __len__(self):
                return 2 + len(source.levels())

            def __setitem__(self, key, value):
                raise TypeError("Virtual Zarr is read-only")

            def __delitem__(self, key):
                raise TypeError("Virtual Zarr is read-only")

        return zarr.open_group(store=SourceMapping(), mode="r")

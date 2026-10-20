"""Authenticated, bounded Neuroglancer volumes and cached label surfaces.

Only derived display data is written, in the existing quota-managed cache.
Neuroglancer uses same-origin session cookies; signed store contexts remain in
the server session, never in data URLs or a third-party viewer.
"""
import hashlib
import json
import math
from pathlib import Path, PurePosixPath
import re
import struct
import itertools

import zarr

import numpy as np

from django.http import HttpResponse, JsonResponse
from django.urls import reverse
from django.views.decorators.http import require_GET, require_http_methods

from . import volume_cache as cache
from . import neuroglancer_contexts as contexts
from .calibration import compose_transforms, MICROMETERS
from .errors import ContextRequired, DataNotFound, InvalidROI, ROILimitExceeded, UnsupportedStore, UnsafePath
from .settings import mount_root
from .tokens import TOKEN_HEADER, validate_read_context, filesystem_context
from .views import _safe_data_path, api_errors, login_required, data as physical_data

MAX_OBJECTS = 2048
MAX_SOURCE_CHUNK_BYTES = 64 * 1024 * 1024
MAX_NATIVE_CHUNK_BYTES = 8 * 1024 * 1024
MAX_INTERACTIVE_VOXELS = 64 ** 3
MAX_MESH_VOXELS = 32 * 1024 * 1024
MAX_MESH_BYTES = 32 * 1024 * 1024
NANOMETERS = {unit:factor*1000 for unit,factor in MICROMETERS.items()}


def spatial_transform(multiscale, dataset, *, allow_uncalibrated=False):
    axes = multiscale.get("axes", [])
    names = [a.get("name") if isinstance(a, dict) else a for a in axes]
    try:
        scale, offset, found_scale = compose_transforms(len(axes), [*dataset.get("coordinateTransformations", []), *multiscale.get("coordinateTransformations", [])])
    except (TypeError, ValueError) as exc:
        raise UnsupportedStore(str(exc)) from exc
    if not found_scale:
        raise UnsupportedStore("3D labels require physical voxel-size metadata")
    spatial_units = [axes[names.index(a)].get("unit", "") if isinstance(axes[names.index(a)], dict) else ""
                     for a in "xyz" if a in names]
    pixel_coordinates = allow_uncalibrated and len(spatial_units) == 3 and all(
        unit.lower() in ("", "pixel", "pixels", "px") for unit in spatial_units)
    resolution, translation = [], []
    for axis in "xyz":
        if axis not in names:
            raise UnsupportedStore("3D labels require X, Y and Z axes")
        index = names.index(axis)
        unit = axes[index].get("unit", "") if isinstance(axes[index], dict) else ""
        factor = 1 if pixel_coordinates else NANOMETERS.get(unit.lower())
        if factor is None:
            raise UnsupportedStore("3D labels require calibrated X, Y and Z units")
        resolution.append(float(scale[index] * factor))
        translation.append(float(offset[index] * factor))
    return names, resolution, translation


def prepare_source(claims, scope, group, level, channel, timepoint, segmentation=False):
    if not isinstance(group, str) or group.startswith("/") or "\\" in group or ".." in PurePosixPath(group).parts:
        raise UnsafePath("Invalid 3D source path")
    prefix = "" if group == "." else group.strip("/") + "/"
    group_path = None
    for filename in ("zarr.json", ".zattrs"):
        try:
            group_path, _ = _safe_data_path(claims["store"], prefix + filename, claims.get("routes", []))
            break
        except DataNotFound:
            pass
    if group_path is None:
        raise DataNotFound("3D source metadata is missing")
    if group_path.stat().st_size > 4 * 1024 * 1024:
        raise ROILimitExceeded("3D source metadata is too large")
    metadata = json.loads(group_path.read_text())
    if group_path.name == "zarr.json":
        metadata = metadata.get("attributes", {}).get("ome", {})
    multiscale = metadata.get("multiscales", [{}])[0]
    datasets = multiscale.get("datasets", [])
    if not datasets or level < 0:
        raise InvalidROI("Invalid 3D pyramid level")
    # Label pyramids may contain fewer levels than the intensity image.
    selected = min(level, len(datasets) - 1) if segmentation else level
    if selected >= len(datasets):
        raise InvalidROI("Invalid 3D pyramid level")
    dataset = datasets[selected]
    axes, resolution, translation = spatial_transform(multiscale, dataset, allow_uncalibrated=not segmentation)
    coordinate_unit = "nanometer" if all(
        isinstance(axis, dict) and axis.get("unit", "").lower() in NANOMETERS
        for axis in multiscale["axes"] if (axis.get("name") if isinstance(axis, dict) else axis) in "xyz"
    ) else "pixel"
    dataset_path = str(dataset["path"])
    if dataset_path.startswith("/") or "\\" in dataset_path or ".." in PurePosixPath(dataset_path).parts:
        raise UnsafePath("Invalid 3D dataset path")
    array_metadata, _ = _safe_data_path(claims["store"], prefix + dataset_path + ("/zarr.json" if group_path.name == "zarr.json" else "/.zarray"), claims.get("routes", []))
    if array_metadata.stat().st_size > 4 * 1024 * 1024:
        raise ROILimitExceeded("3D array metadata is too large")
    array = zarr.open_array(str(array_metadata.parent), mode="r")
    if math.prod(array.chunks) * np.dtype(array.dtype).itemsize > MAX_SOURCE_CHUNK_BYTES:
        raise ROILimitExceeded("Source chunks exceed 64 MiB; rechunk or select a coarser level")
    description = cache.describe_volume(array_metadata.parent, axes, channel, timepoint, allow_integer64=segmentation, bounded=False)
    shape, dtype, _ = description
    if segmentation and dtype.kind not in "ui":
        raise UnsupportedStore("3D labels require integer label values")
    if segmentation and math.prod(shape) > MAX_MESH_VOXELS:
        raise ROILimitExceeded("Choose a lower 3D quality: labels must contain at most 32 million voxels")
    version = hashlib.sha256(group_path.read_bytes() + array_metadata.read_bytes()).hexdigest()
    if segmentation:
        version += cache.fingerprint(array_metadata.parent, Path(mount_root()), axes=axes, channel=channel, timepoint=timepoint)
    # Intensity chunks are never derived/cached here. A new viewer instance reads
    # current source bytes; walking every source chunk adds no cache validity.
    # Only the server session retains logical storage paths and selection.
    # No decoded full-volume file is required by either streaming transport.
    key = hashlib.sha256(json.dumps(["ng-stream-v1", scope, prefix + dataset_path,
        axes, channel, timepoint, version], sort_keys=True).encode()).hexdigest()
    source = {"key": key, "shape": shape, "dtype": dtype.str, "resolution": resolution,
              "translation": translation, "coordinate_unit": coordinate_unit, "segmentation": segmentation, "status": "ready", "progress": 1,
              "array": prefix + dataset_path, "axes": axes, "channel": channel, "timepoint": timepoint}
    source["transport"] = "zarr" if native_metadata(source, claims) is not None else "chunks"
    if source["transport"] == "chunks" and not segmentation:
        # Python's decoder opens stored chunks itself. Preserve the original
        # symlink/mount validation for layouts not served through Nginx.
        cache.fingerprint(array_metadata.parent, Path(mount_root()), axes=axes, channel=channel, timepoint=timepoint)
    return source


def source_array(source, claims):
    filename = "/.zarray"
    try:
        metadata, _ = _safe_data_path(claims["store"], source["array"] + filename, claims.get("routes", []))
    except DataNotFound:
        metadata, _ = _safe_data_path(claims["store"], source["array"] + "/zarr.json", claims.get("routes", []))
    return zarr.open_array(str(metadata.parent), mode="r")


def read_block(source, claims, bounds, array=None):
    array = source_array(source, claims) if array is None else array
    by_axis = dict(zip("zyx", bounds))
    selection = tuple(slice(*by_axis[a]) if a in by_axis else source["channel"] if a == "c"
                      else source["timepoint"] if a == "t" else 0 for a in source["axes"])
    block = np.asarray(array[selection])
    remaining = [a for a in source["axes"] if a in "zyx"]
    return np.transpose(block, [remaining.index(a) for a in "zyx"])


def native_metadata(source, claims):
    """Expose an exact 3D view of compatible v2 chunks, without recompression.

    C/T chunks must be singleton: stripping those dimensions then preserves the
    compressed byte layout. Other layouts/codecs use bounded decoded chunks.
    """
    try:
        path, _ = _safe_data_path(claims["store"], source["array"] + "/.zarray", claims.get("routes", []))
    except DataNotFound:
        return None
    meta = json.loads(path.read_text())
    axes = source["axes"]
    if [a for a in axes if a in "zyx"] != list("zyx") or meta.get("order") != "C" or meta.get("filters"):
        return None
    if np.dtype(meta["dtype"]).name == "float64":
        return None  # Neuroglancer textures use float32, not float64.
    chunks = meta["chunks"]
    if any(chunks[i] != 1 for i,a in enumerate(axes) if a not in "zyx"):
        return None
    compressor = meta.get("compressor")
    if compressor and compressor.get("id") not in ("blosc", "gzip", "zlib"):
        return None
    if math.prod(chunks) * np.dtype(meta["dtype"]).itemsize > MAX_NATIVE_CHUNK_BYTES:
        return None
    if meta.get("dimension_separator", ".") not in ("/", "."):
        return None
    return {**meta, "shape": source["shape"], "chunks": [chunks[axes.index(a)] for a in "zyx"]}


def native_data(request, image_id, source, claims, key, conn):
    meta = native_metadata(source, claims)
    if meta is None:
        raise UnsupportedStore("Native Zarr chunks are unavailable for this layout")
    if key == ".zgroup":
        return JsonResponse({"zarr_format": 2})
    if key == ".zattrs":
        return JsonResponse({"multiscales": [{"version": "0.4", "axes": [
            {"name": a, "type": "space", "unit": "nanometer"} for a in "zyx"],
            "datasets": [{"path": "0", "coordinateTransformations": [
                {"type": "scale", "scale": source["resolution"][::-1]}]}]}]})
    if key == "0/.zarray":
        return JsonResponse(meta)
    if key == "0/.zattrs":
        return JsonResponse({"_ARRAY_DIMENSIONS": list("zyx")})
    separator = meta.get("dimension_separator", ".")
    parts = key.removeprefix("0/").split(separator)
    if not key.startswith("0/") or len(parts) != 3 or any(not re.fullmatch(r"0|[1-9][0-9]*", p) for p in parts):
        raise DataNotFound("Zarr key not found")
    if any(int(p) >= math.ceil(n/c) for p,n,c in zip(parts, meta["shape"], meta["chunks"])):
        raise InvalidROI("Invalid Zarr chunk coordinates")
    spatial = dict(zip("zyx", parts))
    original = separator.join(spatial[a] if a in spatial else str(source["channel"] if a == "c"
                              else source["timepoint"] if a == "t" else 0) for a in source["axes"])
    # Reuse the existing authorization, containment and Nginx range/file path.
    return physical_data(request, image_id, source["array"] + "/" + original, conn=conn)


def derived_key(kind, source, *extra):
    return hashlib.sha256(json.dumps([kind, source["key"], *extra], sort_keys=True).encode()).hexdigest()


def label_index(source, claims):
    """Scan bounded source blocks once; retain each object's bounding box."""
    from scipy.ndimage import find_objects
    boxes = {}
    array = source_array(source, claims)
    shape = source["shape"]
    # Match stored chunks: scanning planes would repeatedly decompress a 3D
    # label chunk for each Z plane. No full-volume temporary is created.
    block_shape = [min(shape[i], int(array.chunks[source["axes"].index(a)])) for i,a in enumerate("zyx")]
    for origin in itertools.product(*(range(0,n,c) for n,c in zip(shape,block_shape))):
        bounds = [(a,min(n,a+c)) for a,n,c in zip(origin,shape,block_shape)]
        block = read_block(source, claims, bounds, array)
        if block.dtype.kind == "i" and np.any(block < 0):
            raise UnsupportedStore("3D labels cannot contain negative object identifiers")
        values, inverse = np.unique(block, return_inverse=True)
        if np.count_nonzero(values) > MAX_OBJECTS:
            raise ROILimitExceeded("3D labels are limited to 2048 objects per layer")
        # Reserve dense zero for background, retaining uint64 IDs as integers.
        objects = find_objects((inverse.reshape(block.shape) + 1).astype(np.int32))
        for value, slices in zip(values, objects):
            if not value or slices is None:
                continue
            name = str(int(value))
            box = [[o+s.start,o+s.stop] for o,s in zip(origin,slices)]
            if name in boxes:
                box = [[min(a,c),max(b,d)] for (a,b),(c,d) in zip(boxes[name],box)]
            boxes[name] = box
            if len(boxes) > MAX_OBJECTS:
                raise ROILimitExceeded("3D labels are limited to 2048 objects per layer")
    return json.dumps(boxes, sort_keys=True).encode()


def object_mesh(source, claims, label_id, bounds):
    block = read_block(source, claims, bounds)
    content = mesh_bytes(block, int(label_id), source["resolution"])
    count, = struct.unpack("<I", content[:4])
    vertices = np.frombuffer(content, dtype="<f4", count=count*3, offset=4).reshape(-1,3).copy()
    vertices += np.asarray([a for a,b in bounds][::-1]) * np.asarray(source["resolution"])
    return content[:4] + vertices.astype("<f4").tobytes() + content[4+count*12:]


def prepare_labels(source, claims, scope, selected=None, interactive=False, retry_failed=False):
    index_key = derived_key("ng-index-v1", source)
    if retry_failed:
        cache.retry_failed(index_key, scope)
    job = cache.request_blob(index_key, scope, 1024*1024, {}, lambda: label_index(source, claims))
    if job["status"] == "error":
        raise InvalidROI(job["error"])
    source["segments"] = []
    source["browser_segments"] = []
    source["mesh_errors"] = {}
    if job["status"] != "ready":
        return True
    boxes = json.loads((cache.cache_root() / (index_key + ".bin")).read_bytes())
    wanted = sorted(boxes, key=int) if selected is None else [s for s in selected if s in boxes]
    pending = False
    for label_id in wanted:
        if interactive and selected is not None and len(wanted) <= 3 and math.prod(b-a+2 for a,b in boxes[label_id]) <= MAX_INTERACTIVE_VOXELS:
            source["browser_segments"].append(label_id)
            source["segments"].append(label_id)
            continue
        key = derived_key("ng-mesh-v2", source, label_id, source["resolution"])
        if retry_failed:
            cache.retry_failed(key, scope)
        job = cache.request_blob(key, scope, MAX_MESH_BYTES, {},
            lambda label_id=label_id: object_mesh(source, claims, label_id, boxes[label_id]))
        if job["status"] == "error":
            source["mesh_errors"][label_id] = job["error"]
            continue
        if job["status"] == "ready":
            source["segments"].append(label_id)
        else:
            pending = True
    return pending


def mesh_bytes(data, label_id, resolution):
    from skimage.measure import marching_cubes
    mask = data == label_id
    if not mask.any():
        return struct.pack("<I", 0)
    bounds = []
    for axis in range(3):
        occupied = np.flatnonzero(np.any(mask, axis=tuple(i for i in range(3) if i != axis)))
        bounds.append((int(occupied[0]), int(occupied[-1]) + 1))
    crop = np.pad(mask[tuple(slice(a, b) for a, b in bounds)], 1)
    edges = sum(np.count_nonzero(np.diff(crop, axis=axis)) for axis in range(3))
    if edges * 72 > MAX_MESH_BYTES:
        raise ROILimitExceeded("Label surface is too complex; select a lower 3D quality")
    # Padding closes objects touching the image border. Vertices are converted
    # from ZYX voxel centers to XYZ physical nanometers, as precomputed expects.
    vertices, faces, _, _ = marching_cubes(crop, level=.5, allow_degenerate=False)
    if 4 + vertices.size * 4 + faces.size * 4 > MAX_MESH_BYTES:
        raise ROILimitExceeded("Label surface is too large; select a lower 3D quality")
    vertices += np.asarray([a - 1 for a, _ in bounds])
    vertices = np.ascontiguousarray((vertices[:, ::-1] + .5) * np.asarray(resolution), dtype="<f4")
    # Reversing the axis order reverses handedness, so reverse triangle winding.
    faces = np.ascontiguousarray(faces[:, ::-1], dtype="<u4")
    return struct.pack("<I", len(vertices)) + vertices.tobytes() + faces.tobytes()


@require_GET
@login_required(setGroupContext=True)
@api_errors
def prepare(request, image_id, conn=None, **kwargs):
    if not cache.cache_limit():
        raise UnsupportedStore("3D label rendering requires the volume cache")
    claims = filesystem_context(validate_read_context(request, conn, image_id))
    scope = cache.scope_key(claims, image_id)
    try:
        level = int(request.GET.get("level", "0"))
        timepoint = int(request.GET.get("t", "0"))
        channels = json.loads(request.GET.get("channels", "[0]"))
        labels = json.loads(request.GET.get("labels", "[]"))
        if not isinstance(channels, list) or not isinstance(labels, list) or len(channels) > 10 or len(labels) > 8:
            raise ValueError()
        if any(type(c) is not int or c < 0 for c in channels) or timepoint < 0:
            raise ValueError()
        if any(not isinstance(item, dict) or not isinstance(item.get("path"), str) or type(item.get("channel", 0)) is not int or item.get("channel", 0) < 0 for item in labels):
            raise ValueError()
    except (TypeError, ValueError) as exc:
        raise InvalidROI("Invalid 3D selection") from exc
    field = request.GET.get("field", ".")
    view_id = request.GET.get("view_id")
    if view_id is not None and not re.fullmatch(r"[0-9a-f]{32}", view_id):
        raise InvalidROI("Invalid 3D view identifier")
    sources = {}
    for channel in channels:
        sources[f"image-{channel}"] = prepare_source(claims, scope, field, level, channel, timepoint)
    for index, label in enumerate(labels):
        sources[f"label-{index}"] = prepare_source(claims, scope, label["path"], level, label.get("channel", 0), timepoint, True)
    if not sources:
        raise InvalidROI("Select an image or label layer")
    if len({source["coordinate_unit"] for source in sources.values()}) > 1:
        raise UnsupportedStore("Image and labels must use matching calibrated coordinate units")
    pending = False
    for index, label in enumerate(labels):
        selected = label.get("segments")
        if selected is not None and (not isinstance(selected, list) or len(selected) > MAX_OBJECTS or
                any(not isinstance(v,str) or not re.fullmatch(r"[1-9][0-9]{0,19}",v) for v in selected)):
            raise InvalidROI("Invalid selected segmentation IDs")
        pending = prepare_labels(sources[f"label-{index}"], claims, scope, selected, label.get("interactive") is True, request.GET.get("retryFailed") == "1") or pending
    identity = hashlib.sha256(json.dumps([scope, view_id, [(name, s["key"]) for name,s in sources.items()]], sort_keys=True).encode()).hexdigest()[:32]
    import time
    from .settings import context_ttl_seconds
    now = time.time()
    contexts.put(request.session, identity, {"token": request.META[TOKEN_HEADER], "sources": sources, "scope": scope, "expires": now + context_ttl_seconds(), **({"view_id": view_id} if view_id else {})})
    base = reverse("biomero_zarr_viewer_neuroglancer_data", kwargs={"image_id": image_id, "context_id": identity, "data_key": "placeholder"}).removesuffix("placeholder")
    # Strip server-only paths/selections from the public response.
    public = {name: {k:v for k,v in item.items() if k not in ("array","axes","channel","timepoint")}
              for name,item in sources.items()}
    return JsonResponse({"status": "ready", "pending": pending, "url": base, "sources": public})


@require_http_methods(["GET", "HEAD"])
@login_required(setGroupContext=True)
@api_errors
def data(request, image_id, context_id, data_key, conn=None, **kwargs):
    context = contexts.get(request.session, context_id)
    if not context:
        raise ContextRequired("Reopen the 3D view to authorize its data")
    request.META[TOKEN_HEADER] = context["token"]
    claims = filesystem_context(validate_read_context(request, conn, image_id))
    scope = cache.scope_key(claims, image_id)
    if scope != context["scope"]:
        raise ContextRequired("The 3D context belongs to another image or group")
    source_name, _, key = data_key.partition("/")
    source = context["sources"].get(source_name)
    if source is None:
        raise DataNotFound("3D source not found")
    dtype = np.dtype(source["dtype"])
    output_dtype = np.dtype("<u8" if dtype.itemsize == 8 else "<u4") if source["segmentation"] and dtype.kind == "i" else dtype if dtype.kind == "u" or dtype == np.dtype("<f4") else np.dtype("<f4")
    if key.startswith("zarr/"):
        response = native_data(request, image_id, source, claims, key[5:], conn)
    elif key.startswith("mesh-input/") and source["segmentation"]:
        label_id = key.removeprefix("mesh-input/")
        if label_id not in source.get("browser_segments", []):
            raise DataNotFound("Interactive label not selected")
        index_key = derived_key("ng-index-v1", source)
        cache.entry(index_key, scope)
        boxes = json.loads((cache.cache_root() / (index_key + ".bin")).read_bytes())
        bounds = boxes[label_id]
        if math.prod(b-a+2 for a,b in bounds) > MAX_INTERACTIVE_VOXELS:
            raise ROILimitExceeded("Interactive label is too large for browser meshing")
        mask = np.ascontiguousarray(read_block(source, claims, bounds) == int(label_id), dtype=np.uint8)
        header = json.dumps({"shape": list(mask.shape), "origin": [a for a,b in bounds], "resolution": source["resolution"]}).encode()
        response = HttpResponse(struct.pack("<I",len(header)) + header + mask.tobytes(), content_type="application/octet-stream")
    elif key == "info":
        info = {"@type": "neuroglancer_multiscale_volume", "type": "segmentation" if source["segmentation"] else "image",
                "data_type": output_dtype.name, "num_channels": 1,
                "scales": [{"key": "0", "size": source["shape"][::-1], "resolution": source["resolution"],
                            "voxel_offset": [0, 0, 0], "chunk_sizes": [[64, 64, 64]], "encoding": "raw"}]}
        if source["segmentation"]:
            info["mesh"] = "mesh"
        response = JsonResponse(info)
    elif key == "mesh/info" and source["segmentation"]:
        response = JsonResponse({"@type": "neuroglancer_legacy_mesh"})
    elif source["segmentation"] and re.fullmatch(r"mesh/[1-9][0-9]*:0", key):
        label_id = key.split("/")[1].split(":")[0]
        if label_id not in source["segments"]:
            raise DataNotFound("Label not found")
        response = JsonResponse({"fragments": [label_id]})
    elif source["segmentation"] and re.fullmatch(r"mesh/[1-9][0-9]*", key):
        label_id = key.split("/")[1]
        if label_id not in source["segments"]:
            raise DataNotFound("Label not found")
        mesh_key = derived_key("ng-mesh-v2", source, label_id, source["resolution"])
        job = cache.entry(mesh_key, scope)
        if job["status"] != "ready":
            return JsonResponse({"status": job["status"]}, status=202, headers={"Retry-After": "1"})
        response = HttpResponse((cache.cache_root() / (mesh_key + ".bin")).read_bytes(), content_type="application/octet-stream")
    elif re.fullmatch(r"0/\d+-\d+_\d+-\d+_\d+-\d+", key):
        bounds = [tuple(map(int, pair.split("-"))) for pair in key[2:].split("_")]
        if any(start < 0 or end <= start or end > size or end - start > 64 for (start, end), size in zip(bounds, source["shape"][::-1])):
            raise InvalidROI("Invalid 3D chunk bounds")
        block = read_block(source, claims, bounds[::-1])
        response = HttpResponse(np.ascontiguousarray(block, dtype=output_dtype).tobytes(), content_type="application/octet-stream")
    else:
        raise DataNotFound("3D data not found")
    response["Cache-Control"] = "private, no-store"
    response["X-Content-Type-Options"] = "nosniff"
    return response

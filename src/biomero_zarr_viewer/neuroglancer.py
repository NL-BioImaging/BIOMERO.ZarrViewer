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

import numpy as np

from django.http import HttpResponse, JsonResponse
from django.urls import reverse
from django.views.decorators.http import require_GET

from . import volume_cache as cache
from .errors import ContextRequired, DataNotFound, InvalidROI, ROILimitExceeded, UnsupportedStore, UnsafePath
from .settings import mount_root
from .tokens import TOKEN_HEADER, validate_read_context
from .views import _safe_data_path, api_errors, login_required

MAX_OBJECTS = 2048
MAX_MESH_VOXELS = 32 * 1024 * 1024
MAX_MESH_BYTES = 32 * 1024 * 1024
NANOMETERS = {"meter": 1e9, "metre": 1e9, "millimeter": 1e6, "millimetre": 1e6,
              "micrometer": 1e3, "micrometre": 1e3, "um": 1e3, "µm": 1e3,
              "nanometer": 1, "nanometre": 1, "nm": 1, "picometer": .001}


def spatial_transform(multiscale, dataset):
    axes = multiscale.get("axes", [])
    names = [a.get("name") if isinstance(a, dict) else a for a in axes]
    scale = np.ones(len(axes), dtype=float)
    offset = np.zeros(len(axes), dtype=float)
    found_scale = False
    # NGFF applies dataset transforms first, then shared multiscale transforms.
    for transform in [*dataset.get("coordinateTransformations", []), *multiscale.get("coordinateTransformations", [])]:
        kind = transform.get("type")
        if kind not in ("scale", "translation"):
            raise UnsupportedStore("Unsupported 3D coordinate transformation")
        values = np.asarray(transform.get(kind, []), dtype=float)
        if values.shape != scale.shape or not np.all(np.isfinite(values)):
            raise UnsupportedStore("Invalid 3D coordinate transformation")
        if kind == "scale":
            found_scale = True
            if np.any(values <= 0):
                raise UnsupportedStore("3D voxel sizes must be positive")
            scale *= values
            offset *= values
        else:
            offset += values
    if not found_scale:
        raise UnsupportedStore("3D labels require physical voxel-size metadata")
    resolution, translation = [], []
    for axis in "xyz":
        if axis not in names:
            raise UnsupportedStore("3D labels require X, Y and Z axes")
        index = names.index(axis)
        unit = axes[index].get("unit", "") if isinstance(axes[index], dict) else ""
        factor = NANOMETERS.get(unit.lower())
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
    axes, resolution, translation = spatial_transform(multiscale, dataset)
    dataset_path = str(dataset["path"])
    if dataset_path.startswith("/") or "\\" in dataset_path or ".." in PurePosixPath(dataset_path).parts:
        raise UnsafePath("Invalid 3D dataset path")
    array_metadata, _ = _safe_data_path(claims["store"], prefix + dataset_path + ("/zarr.json" if group_path.name == "zarr.json" else "/.zarray"), claims.get("routes", []))
    description = cache.describe_volume(array_metadata.parent, axes, channel, timepoint, allow_integer64=segmentation)
    shape, dtype, _ = description
    if segmentation and dtype.kind not in "ui":
        raise UnsupportedStore("3D labels require integer label values")
    if segmentation and math.prod(shape) > MAX_MESH_VOXELS:
        raise ROILimitExceeded("Choose a lower 3D quality: labels must contain at most 32 million voxels")
    version = hashlib.sha256(group_path.read_bytes()).hexdigest() + cache.fingerprint(
        array_metadata.parent, Path(mount_root()), axes=axes, channel=channel, timepoint=timepoint)
    job = cache.request_volume(array_metadata.parent, axes, channel, timepoint, scope, version, description=description)
    return {"key": job["key"], "shape": shape, "dtype": dtype.str, "resolution": resolution,
            "translation": translation, "segmentation": segmentation, "status": job["status"], "progress": job["progress"]}


def volume(source, scope):
    result = cache.entry(source["key"], scope)
    if result["status"] != "ready":
        raise DataNotFound("3D volume is not ready; reload the 3D view")
    try:
        return np.memmap(cache.cache_root() / (source["key"] + ".bin"), mode="r", dtype=source["dtype"], shape=tuple(source["shape"]))
    except FileNotFoundError as exc:
        raise DataNotFound("3D data was evicted; reload the 3D view") from exc


def segment_ids(source, scope):
    # Limit auxiliary memory by scanning Z planes rather than sorting the whole volume.
    data = volume(source, scope)
    values = set()
    for plane in data:
        if data.dtype.kind == "i" and np.any(plane < 0):
            raise UnsupportedStore("3D labels cannot contain negative object identifiers")
        values.update(int(value) for value in np.unique(plane) if value)
        if len(values) > MAX_OBJECTS:
            raise ROILimitExceeded("3D labels are limited to 2048 objects per layer")
    return [str(value) for value in sorted(values)]


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
    claims = validate_read_context(request, conn, image_id)
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
    sources = {}
    for channel in channels:
        sources[f"image-{channel}"] = prepare_source(claims, scope, field, level, channel, timepoint)
    for index, label in enumerate(labels):
        sources[f"label-{index}"] = prepare_source(claims, scope, label["path"], level, label.get("channel", 0), timepoint, True)
    if not sources:
        raise InvalidROI("Select an image or label layer")
    if any(source["status"] == "error" for source in sources.values()):
        raise InvalidROI("A 3D volume could not be prepared")
    if any(source["status"] != "ready" for source in sources.values()):
        return JsonResponse({"status": "building", "progress": sum(s["progress"] for s in sources.values()) / len(sources)})
    for source in sources.values():
        if source["segmentation"]:
            source["segments"] = segment_ids(source, scope)
    identity = hashlib.sha256(json.dumps([scope, sources], sort_keys=True).encode()).hexdigest()[:32]
    contexts = request.session.get("biomero_neuroglancer", {})
    contexts.pop(identity, None)
    contexts[identity] = {"token": request.META[TOKEN_HEADER], "sources": sources, "scope": scope}
    request.session["biomero_neuroglancer"] = dict(list(contexts.items())[-4:])
    base = reverse("biomero_zarr_viewer_neuroglancer_data", kwargs={"image_id": image_id, "context_id": identity, "data_key": "placeholder"}).removesuffix("placeholder")
    return JsonResponse({"status": "ready", "url": base, "sources": sources})


@require_GET
@login_required(setGroupContext=True)
@api_errors
def data(request, image_id, context_id, data_key, conn=None, **kwargs):
    context = request.session.get("biomero_neuroglancer", {}).get(context_id)
    if not context:
        raise ContextRequired("Reopen the 3D view to authorize its data")
    request.META[TOKEN_HEADER] = context["token"]
    claims = validate_read_context(request, conn, image_id)
    scope = cache.scope_key(claims, image_id)
    if scope != context["scope"]:
        raise ContextRequired("The 3D context belongs to another image or group")
    source_name, _, key = data_key.partition("/")
    source = context["sources"].get(source_name)
    if source is None:
        raise DataNotFound("3D source not found")
    dtype = np.dtype(source["dtype"])
    output_dtype = np.dtype("<u8" if dtype.itemsize == 8 else "<u4") if source["segmentation"] and dtype.kind == "i" else dtype if dtype.kind == "u" or dtype == np.dtype("<f4") else np.dtype("<f4")
    if key == "info":
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
        mesh_key = hashlib.sha256(json.dumps(["ng-mesh-v1", source["key"], label_id, source["resolution"]]).encode()).hexdigest()
        content = cache.cached_blob(mesh_key, scope, MAX_MESH_BYTES, {}, lambda: mesh_bytes(volume(source, scope), int(label_id), source["resolution"]))
        response = HttpResponse(content, content_type="application/octet-stream")
    elif re.fullmatch(r"0/\d+-\d+_\d+-\d+_\d+-\d+", key):
        bounds = [tuple(map(int, pair.split("-"))) for pair in key[2:].split("_")]
        if any(start < 0 or end <= start or end > size or end - start > 64 for (start, end), size in zip(bounds, source["shape"][::-1])):
            raise InvalidROI("Invalid 3D chunk bounds")
        block = volume(source, scope)[tuple(slice(a, b) for a, b in bounds[::-1])]
        response = HttpResponse(np.ascontiguousarray(block, dtype=output_dtype).tobytes(), content_type="application/octet-stream")
    else:
        raise DataNotFound("3D data not found")
    response["Cache-Control"] = "private, no-store"
    response["X-Content-Type-Options"] = "nosniff"
    return response

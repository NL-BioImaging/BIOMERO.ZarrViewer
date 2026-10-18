"""Metadata-only inspection of readable Zarr hierarchies and OMERO objects."""
import json
from collections import deque
from datetime import date, datetime
from itertools import islice
from pathlib import PurePosixPath

from .errors import DataNotFound, InvalidMetadata
from .settings import max_hierarchy_entries, max_metadata_bytes

METADATA_FILES = ("zarr.json", ".zattrs", ".zarray", ".zgroup", ".zmetadata")


def zarr_details(store, resolve):
    routes = [[str(route.logical), str(route.physical)] for route in store.routes]
    queue = deque(["."])
    for route in store.routes:
        queue.extend(str(parent) for parent in reversed(route.logical.parents))
        queue.append(str(route.logical))
    seen, nodes, notices = set(), [], []
    directories = {}
    total = 0
    while queue:
        logical = queue.popleft()
        if logical in seen:
            continue
        seen.add(logical)
        if len(seen) > max_hierarchy_entries():
            notices.append("The hierarchy entry limit was reached; some metadata is not shown.")
            break
        documents, directory = {}, directories.get(logical)
        for name in METADATA_FILES:
            key = str(PurePosixPath(logical) / name)
            try:
                path, _ = resolve(store.relative, key, routes)
            except DataNotFound:
                continue
            size = path.stat().st_size
            if size > max_metadata_bytes() or total + size > 16 * max_metadata_bytes():
                notices.append(f"Metadata size limit reached for {key}; this document is not shown.")
                continue
            total += size
            try:
                documents[name] = json.loads(path.read_text(encoding="utf-8"))
            except (ValueError, UnicodeError) as exc:
                raise InvalidMetadata(f"Invalid JSON in {key}") from exc
            directory = path.parent
        node = documents.get("zarr.json", {})
        attributes = node.get("attributes", documents.get(".zattrs", {}))
        array = node if node.get("node_type") == "array" else documents.get(".zarray")
        if documents:
            nodes.append({"path": logical, "attributes": attributes, "array": array, "documents": documents})
        # Never walk inside arrays: their directories contain pixel chunks.
        if array is None and directory is not None:
            for child in sorted(directory.iterdir(), key=lambda item: item.name):
                if child.is_dir() and not child.is_symlink():
                    child_key = str(PurePosixPath(logical) / child.name)
                    directories[child_key] = child
                    queue.append(child_key)
    return {"nodes": nodes, "notices": notices}


def json_value(value, depth=0):
    if depth > 12:
        return str(value)
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, dict):
        return {str(key): json_value(item, depth + 1) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [json_value(item, depth + 1) for item in value]
    getter = getattr(value, "getValue", None)
    if callable(getter):
        unit = getattr(value, "getUnit", None)
        if callable(unit):
            return {"value": json_value(getter(), depth + 1), "unit": str(unit())}
        return json_value(getter(), depth + 1)
    marshal = getattr(value, "simpleMarshal", None)
    if callable(marshal):
        return json_value(marshal(), depth + 1)
    return str(value)


def omero_details(image):
    notices = []

    def read(obj, method, *args, **kwargs):
        getter = getattr(obj, method, None)
        if not callable(getter):
            return None
        try:
            value = getter(*args, **kwargs)
            if value is not None and method in ("listAnnotations", "listParents", "getChannels", "copyPlaneInfo"):
                value = list(islice(value, max_hierarchy_entries() + 1))
                if len(value) > max_hierarchy_entries():
                    notices.append(f"OMERO {method}: entry limit reached; some metadata is not shown.")
                    value = value[:max_hierarchy_entries()]
            return value
        except Exception:
            notices.append(f"OMERO {method.removeprefix('get')}: unavailable for this object.")
            return None

    def description(obj):
        info = read(obj, "simpleMarshal")
        if info is None:
            info = {"id": read(obj, "getId"), "name": read(obj, "getName"), "type": type(obj).__name__.removesuffix("Wrapper")}
        return json_value(info)

    def annotations(obj):
        result = []
        for annotation in islice(read(obj, "listAnnotations") or [], max_hierarchy_entries()):
            item = {"id": read(annotation, "getId"), "type": (getattr(annotation, "OMERO_CLASS", None) or type(annotation).__name__.strip("_")),
                    "namespace": read(annotation, "getNs"), "description": read(annotation, "getDescription")}
            try:
                item["value"] = json_value(read(annotation, "getValue"))
                file = read(annotation, "getFile")
                if file is not None:
                    item["file"] = {name: json_value(read(file, method)) for name, method in
                                    [("id", "getId"), ("name", "getName"), ("size", "getSize"), ("mimetype", "getMimetype")]}
            except Exception:
                notices.append("Some annotation values could not be read.")
            result.append(json_value(item))
        return result

    result = {"image": description(image), "annotations": annotations(image), "ancestors": [], "notices": notices}
    for name, method in [("acquisition_date", "getAcquisitionDate"),
                         ("instrument", "getInstrument"), ("objective", "getObjectiveSettings"),
                         ("environment", "getImagingEnvironment"), ("stage", "getStageLabel")]:
        value = read(image, method)
        if value is not None:
            try:
                result[name] = json_value(value)
            except Exception:
                notices.append(f"OMERO {name}: some metadata is unavailable.")
    pixels = read(image, "getPrimaryPixels")
    if pixels is not None:
        result["pixels"] = {name: json_value(read(pixels, method)) for name, method in [
            ("id", "getId"), ("pixel_type", "getPixelsType"), ("dimension_order", "getDimensionOrder"),
            *[(f"size_{axis}", f"getSize{axis}") for axis in "XYZCT"],
            *[(f"physical_size_{axis}", f"getPhysicalSize{axis}") for axis in "XYZ"],
            ("time_increment", "getTimeIncrement")]}
        planes = read(pixels, "copyPlaneInfo")
        if planes is not None:
            result["planes"] = [{name: json_value(read(plane, method)) for name, method in [
                ("z", "getTheZ"), ("c", "getTheC"), ("t", "getTheT"),
                ("exposure_time", "getExposureTime"), ("delta_t", "getDeltaT"),
                *[(f"position_{axis}", f"getPosition{axis}") for axis in "XYZ"]]}
                for plane in islice(planes, max_hierarchy_entries())]
    channels = read(image, "getChannels", noRE=True)
    if channels is not None:
        result["channels"] = []
        for index, channel in enumerate(channels):
            try:
                result["channels"].append({"index": index, "id": json_value(read(channel, "getId")),
                                          "label": json_value(read(channel, "getLabel")),
                                          "logical_channel": json_value(read(channel, "getLogicalChannel"))})
            except Exception:
                notices.append("Some OMERO channel metadata is unavailable.")
    queue = deque((parent, 1) for parent in (read(image, "listParents") or []))
    seen = set()
    while queue and len(seen) < max_hierarchy_entries():
        obj, depth = queue.popleft()
        key = (type(obj).__name__, str(read(obj, "getId")))
        if key in seen:
            continue
        seen.add(key)
        result["ancestors"].append({**description(obj), "annotations": annotations(obj)})
        if depth < 6:
            queue.extend((parent, depth + 1) for parent in (read(obj, "listParents") or []))
    original = read(image, "loadOriginalMetadata")
    if original is not None and len(original) == 3:
        result["original_metadata"] = {"global": json_value(original[1]), "series": json_value(original[2])}
    return result

"""Small, read-only OME-NGFF 0.4 and 0.5 metadata adapters."""

import json
import re
from pathlib import Path, PurePosixPath
from uuid import UUID

from .errors import InvalidMetadata, UnsupportedStore, UnsafePath
from .settings import max_hierarchy_entries, max_metadata_bytes

INTEGER_DTYPES = re.compile(
    r"^(?:[<>=|])?(?:(?:u?int)(?:8|16|32|64)|[ui](?:1|2|4|8))$", re.I
)


def _read_json(path):
    try:
        size = path.stat().st_size
    except OSError as exc:
        raise InvalidMetadata("Required OME-Zarr metadata is missing") from exc
    if size > max_metadata_bytes():
        raise InvalidMetadata("OME-Zarr metadata exceeds the configured size limit")
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise InvalidMetadata("OME-Zarr metadata is not valid JSON") from exc
    if not isinstance(value, dict):
        raise InvalidMetadata("OME-Zarr metadata must be a JSON object")
    return value


def _safe_relative(value, *, allow_dot=False):
    value = str(value or ".").replace("\\", "/")
    path = PurePosixPath(value)
    if path.is_absolute() or ".." in path.parts or "\x00" in value:
        raise UnsafePath("OME-Zarr metadata contains an unsafe relative path")
    normalized = str(path).strip("/")
    if not normalized and not allow_dot:
        raise InvalidMetadata("OME-Zarr metadata contains an empty path")
    return normalized or "."


def _join(*parts):
    clean = [str(part).strip("/") for part in parts if part not in (None, "", ".")]
    return "/".join(clean) or "."


def _axes(multiscale):
    result = []
    for axis in multiscale.get("axes", []) if isinstance(multiscale, dict) else []:
        if isinstance(axis, str):
            result.append({"name": axis})
        elif isinstance(axis, dict) and axis.get("name"):
            item = {"name": str(axis["name"])}
            for key in ("type", "unit"):
                if axis.get(key) is not None:
                    item[key] = str(axis[key])
            result.append(item)
    return result


def _datasets(multiscale):
    result = []
    for dataset in multiscale.get("datasets", []) if isinstance(multiscale, dict) else []:
        if not isinstance(dataset, dict) or "path" not in dataset:
            raise InvalidMetadata("A multiscale dataset is missing its path")
        item = {"path": _safe_relative(dataset["path"])}
        transformations = dataset.get("coordinateTransformations")
        if isinstance(transformations, list):
            item["coordinate_transformations"] = transformations
        result.append(item)
    if not result:
        raise InvalidMetadata("The multiscale image contains no datasets")
    return result


def _normalize_color(value):
    if isinstance(value, str):
        value = value.strip().lstrip("#")
        if re.fullmatch(r"[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?", value):
            return "#" + value[:6].upper()
    if isinstance(value, list) and len(value) >= 3:
        try:
            return "#" + "".join(f"{max(0, min(255, int(x))):02X}" for x in value[:3])
        except (TypeError, ValueError):
            pass
    return None


def _channels(omero, axis_count):
    values = omero.get("channels", []) if isinstance(omero, dict) else []
    result = []
    for index, channel in enumerate(values):
        if not isinstance(channel, dict):
            channel = {}
        window = channel.get("window") if isinstance(channel.get("window"), dict) else {}
        item = {
            "index": index,
            "label": str(channel.get("label") or f"Channel {index + 1}"),
            "active": bool(channel.get("active", True)),
        }
        color = _normalize_color(channel.get("color"))
        if color:
            item["color"] = color
        try:
            item["window"] = {
                "min": float(window.get("min", 0)),
                "max": float(window.get("max", 65535)),
                "start": float(window.get("start", window.get("min", 0))),
                "end": float(window.get("end", window.get("max", 65535))),
            }
        except (TypeError, ValueError):
            pass
        result.append(item)
    palette = ["#FFFFFF", "#00FF00", "#FF00FF", "#00FFFF", "#FFFF00", "#FF0000"]
    if axis_count:
        result = result[:axis_count]
        for index in range(len(result), axis_count):
            result.append(
                {
                    "index": index,
                    "label": f"Channel {index + 1}",
                    "active": index < 3,
                    "color": palette[index % len(palette)],
                }
            )
    return result


def _metadata_at(root, relative, version):
    directory = root if relative in ("", ".") else root.joinpath(*PurePosixPath(relative).parts)
    if version == "0.4":
        return _read_json(directory / ".zattrs")
    node = _read_json(directory / "zarr.json")
    attributes = node.get("attributes", {})
    if not isinstance(attributes, dict):
        raise InvalidMetadata("Zarr v3 attributes must be an object")
    ome = attributes.get("ome", {})
    return ome if isinstance(ome, dict) else {}


def _array_metadata(root, array_path, version):
    directory = root.joinpath(*PurePosixPath(array_path).parts)
    return _read_json(directory / (".zarray" if version == "0.4" else "zarr.json"))


def _array_dtype(root, array_path, version):
    metadata = _array_metadata(root, array_path, version)
    return metadata.get("dtype") if version == "0.4" else metadata.get("data_type")


def _is_integer_dtype(value):
    if isinstance(value, dict):
        value = value.get("name")
    text = str(value or "").replace("_", "")
    return bool(INTEGER_DTYPES.match(text))


def _image_model(root, image_path, version):
    metadata = _metadata_at(root, image_path, version)
    multiscales = metadata.get("multiscales")
    if not isinstance(multiscales, list) or not multiscales or not isinstance(multiscales[0], dict):
        raise InvalidMetadata("Image group does not contain multiscales metadata")
    multiscale = multiscales[0]
    axes = _axes(multiscale)
    datasets = _datasets(multiscale)
    channel_axis = next((index for index, axis in enumerate(axes) if axis.get("name") == "c" or axis.get("type") == "channel"), None)
    channel_count = 0
    if channel_axis is not None:
        array = _array_metadata(root, _join(image_path, datasets[0]["path"]), version)
        shape = array.get("shape")
        if not isinstance(shape, list) or channel_axis >= len(shape):
            raise InvalidMetadata("The image array shape does not match its declared axes")
        try:
            channel_count = int(shape[channel_axis])
        except (TypeError, ValueError) as exc:
            raise InvalidMetadata("The image array has an invalid channel dimension") from exc
        if channel_count < 1 or channel_count > max_hierarchy_entries():
            raise InvalidMetadata("The image channel dimension exceeds the configured limit")
    return {
        "path": image_path,
        "name": str(multiscale.get("name") or PurePosixPath(image_path).name or "Image"),
        "axes": axes,
        "datasets": datasets,
        "channels": _channels(metadata.get("omero", {}), channel_count),
        "labels": _labels(root, image_path, version),
    }


def _labels(root, image_path, version):
    labels_path = _join(image_path, "labels")
    directory = root.joinpath(*PurePosixPath(labels_path).parts)
    marker = directory / (".zattrs" if version == "0.4" else "zarr.json")
    if not marker.is_file():
        return []
    metadata = _metadata_at(root, labels_path, version)
    values = metadata.get("labels", [])
    if not isinstance(values, list):
        raise InvalidMetadata("Label-group metadata must contain a labels list")
    if len(values) > max_hierarchy_entries():
        raise InvalidMetadata("OME-Zarr label hierarchy exceeds the configured limit")

    result = []
    for index, value in enumerate(values):
        relative = value.get("path") if isinstance(value, dict) else value
        relative = _safe_relative(relative)
        path = _join(labels_path, relative)
        label_metadata = _metadata_at(root, path, version)
        multiscales = label_metadata.get("multiscales")
        if not isinstance(multiscales, list) or not multiscales:
            raise InvalidMetadata(f"Label image '{relative}' has no multiscales metadata")
        datasets = _datasets(multiscales[0])
        dtype = _array_dtype(root, _join(path, datasets[0]["path"]), version)
        if not _is_integer_dtype(dtype):
            raise InvalidMetadata(f"Label image '{relative}' does not use integer pixels")
        display = label_metadata.get("image-label", {})
        if not isinstance(display, dict):
            display = {}
        item = {
            "id": f"label-{index}",
            "name": str(display.get("name") or PurePosixPath(relative).name),
            "path": path,
            "axes": _axes(multiscales[0]),
            "datasets": datasets,
        }
        color = _normalize_color(display.get("color"))
        if color:
            item["color"] = color
        if isinstance(display.get("opacity"), (int, float)):
            item["opacity"] = max(0.0, min(1.0, float(display["opacity"])))
        result.append(item)
    return result


def inspect_label(root, logical_path, version, *, label_id=0):
    """Inspect one label group whose physical and logical locations differ."""
    root = Path(root)
    metadata = _metadata_at(root, ".", version)
    multiscales = metadata.get("multiscales")
    if not isinstance(multiscales, list) or not multiscales:
        raise InvalidMetadata(f"Label image '{logical_path}' has no multiscales metadata")
    datasets = _datasets(multiscales[0])
    dtype = _array_dtype(root, datasets[0]["path"], version)
    if not _is_integer_dtype(dtype):
        raise InvalidMetadata(f"Label image '{logical_path}' does not use integer pixels")
    display = metadata.get("image-label", {})
    if not isinstance(display, dict):
        display = {}
    item = {
        "id": f"label-{label_id}",
        "name": str(display.get("name") or PurePosixPath(logical_path).name),
        "path": str(logical_path),
        "axes": _axes(multiscales[0]),
        "datasets": datasets,
    }
    color = _normalize_color(display.get("color"))
    if color:
        item["color"] = color
    if isinstance(display.get("opacity"), (int, float)):
        item["opacity"] = max(0.0, min(1.0, float(display["opacity"])))
    return item


def _plate_model(root, plate, version, recorded_files):
    rows = plate.get("rows", [])
    columns = plate.get("columns", [])
    wells = plate.get("wells", [])
    acquisitions = plate.get("acquisitions", [])
    if not all(isinstance(value, list) for value in (rows, columns, wells, acquisitions)):
        raise InvalidMetadata("Plate rows, columns, wells, and acquisitions must be lists")
    if len(wells) > max_hierarchy_entries():
        raise InvalidMetadata("OME-Zarr plate hierarchy exceeds the configured limit")

    normalized_wells = []
    all_fields = []
    for well in wells:
        if not isinstance(well, dict) or "path" not in well:
            raise InvalidMetadata("A plate well is missing its path")
        well_path = _safe_relative(well["path"])
        well_metadata = _metadata_at(root, well_path, version).get("well", {})
        images = well_metadata.get("images", []) if isinstance(well_metadata, dict) else []
        if not isinstance(images, list):
            raise InvalidMetadata(f"Well '{well_path}' images must be a list")
        fields = []
        for image in images:
            if not isinstance(image, dict) or "path" not in image:
                raise InvalidMetadata(f"Well '{well_path}' contains an invalid image")
            field = {
                "path": _join(well_path, _safe_relative(image["path"])),
                "name": str(image.get("name") or image["path"]),
            }
            if image.get("acquisition") is not None:
                field["acquisition"] = image["acquisition"]
            fields.append(field)
            all_fields.append(field)
            if len(all_fields) > max_hierarchy_entries():
                raise InvalidMetadata("OME-Zarr plate hierarchy exceeds the configured limit")
        normalized_wells.append(
            {
                "path": well_path,
                "row_index": int(well.get("rowIndex", 0)),
                "column_index": int(well.get("columnIndex", 0)),
                "fields": fields,
            }
        )
    if not all_fields:
        raise InvalidMetadata("The OME-Zarr plate contains no image fields")

    normalized_recorded = [value.replace("\\", "/") for value in recorded_files]
    initial = next(
        (
            field
            for field in all_fields
            if any(f"/{field['path']}/" in f"/{value.strip('/')}/" for value in normalized_recorded)
        ),
        all_fields[0],
    )
    return {
        "name": str(plate.get("name") or "Plate"),
        "rows": [str(value.get("name", index + 1)) if isinstance(value, dict) else str(value) for index, value in enumerate(rows)],
        "columns": [str(value.get("name", index + 1)) if isinstance(value, dict) else str(value) for index, value in enumerate(columns)],
        "acquisitions": acquisitions,
        "wells": normalized_wells,
        "initial_path": initial["path"],
    }


def inspect_store(root, recorded_files=()):
    root = Path(root)
    if (root / ".zgroup").is_file():
        group = _read_json(root / ".zgroup")
        if group.get("zarr_format") != 2:
            raise UnsupportedStore("Only Zarr v2 is supported for OME-Zarr 0.4")
        metadata = _read_json(root / ".zattrs")
        declared_versions = []
        if isinstance(metadata.get("multiscales"), list) and metadata["multiscales"]:
            declared_versions.append(metadata["multiscales"][0].get("version"))
        if isinstance(metadata.get("plate"), dict):
            declared_versions.append(metadata["plate"].get("version"))
        version = next((str(item) for item in declared_versions if item), "0.4")
        zarr_format = 2
        root_attributes = metadata
    elif (root / "zarr.json").is_file():
        group = _read_json(root / "zarr.json")
        if group.get("zarr_format") != 3 or group.get("node_type") != "group":
            raise UnsupportedStore("The root zarr.json is not a Zarr v3 group")
        attributes = group.get("attributes", {})
        root_attributes = attributes if isinstance(attributes, dict) else {}
        metadata = root_attributes.get("ome", {})
        if not isinstance(metadata, dict):
            raise InvalidMetadata("OME-Zarr 0.5 metadata must be under attributes.ome")
        version = str(metadata.get("version") or "")
        zarr_format = 3
    else:
        raise UnsupportedStore("The directory is not a supported Zarr group")

    expected = "0.4" if zarr_format == 2 else "0.5"
    if version and version != expected:
        raise UnsupportedStore(f"OME-Zarr {version} is not supported with Zarr v{zarr_format}")
    version = expected
    cisegmentation = root_attributes.get("cisegmentation", {})
    store_uuid = (
        str(cisegmentation.get("output_store_uuid", "")).strip()
        if isinstance(cisegmentation, dict)
        else ""
    )
    if store_uuid:
        try:
            store_uuid = str(UUID(store_uuid))
        except ValueError as exc:
            raise InvalidMetadata(
                "The CI Segmentation output store UUID is invalid"
            ) from exc

    if isinstance(metadata.get("plate"), dict):
        plate = _plate_model(root, metadata["plate"], version, recorded_files)
        image = _image_model(root, plate["initial_path"], version)
        return {
            "kind": "plate",
            "ngff_version": version,
            "zarr_format": zarr_format,
            "initial_path": plate["initial_path"],
            "axes": image["axes"],
            "datasets": image["datasets"],
            "channels": image["channels"],
            "labels": image["labels"],
            "plate": plate,
            "store_uuid": store_uuid or None,
        }
    if isinstance(metadata.get("multiscales"), list):
        image = _image_model(root, ".", version)
        return {
            "kind": "image",
            "ngff_version": version,
            "zarr_format": zarr_format,
            "initial_path": ".",
            "axes": image["axes"],
            "datasets": image["datasets"],
            "channels": image["channels"],
            "labels": image["labels"],
            "store_uuid": store_uuid or None,
        }
    raise UnsupportedStore("The Zarr root is neither an OME multiscale image nor a plate")

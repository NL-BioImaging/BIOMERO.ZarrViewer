"""Bounded, authenticated server-side ROI rendering for OME-Zarr stores."""

from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
from pathlib import PurePosixPath
import re
from typing import Any

import numpy as np
from PIL import Image
import zarr

from .errors import InvalidMetadata, InvalidROI, ROILimitExceeded, StoreMismatch
from .settings import (
    roi_max_channels,
    roi_max_height,
    roi_max_output_bytes,
    roi_max_width,
)

UUID_PATTERN = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    re.I,
)


@dataclass(frozen=True)
class RenderedROI:
    content: bytes
    filename: str


def render_roi_png(store_path, model: dict[str, Any], query) -> RenderedROI:
    field = _field(model, query.get("field"))
    requested_uuid = str(query.get("storeUuid") or "").strip().lower()
    actual_uuid = str(model.get("store_uuid") or "").strip().lower()
    if requested_uuid:
        if not UUID_PATTERN.fullmatch(requested_uuid) or requested_uuid != actual_uuid:
            raise StoreMismatch(
                "The requested measurement database does not match this OME-Zarr store"
            )

    bounds = _bounds(query.get("roi"))
    source_channels = _channels(query.get("sourceChannels"))
    timepoint = _index(query.get("t"), "t")
    z_index = _index(query.get("z"), "z")
    label_path = _safe_path(query.get("labelPath"), "labelPath")
    label_channel = _optional_positive_index(query.get("labelChannel"), "labelChannel")
    label_value = _optional_positive_index(query.get("labelValue"), "labelValue")
    if label_path and label_channel is not None:
        raise InvalidROI("Use either labelPath or labelChannel, not both")

    root = zarr.open_group(str(store_path), mode="r")
    image_array = _array(root, field, model["datasets"][0]["path"])
    axes = _axis_names(model.get("axes"), image_array.ndim)
    _validate_bounds(bounds, image_array.shape, axes)
    available_channels = _axis_size(image_array.shape, axes, "c")
    if source_channels is None:
        active = [
            int(channel["index"]) + 1
            for channel in model.get("channels", [])
            if channel.get("active", True)
        ]
        source_channels = (active or [1])[: roi_max_channels()]
    if len(source_channels) > roi_max_channels():
        raise ROILimitExceeded(
            f"At most {roi_max_channels()} intensity channels may be rendered"
        )
    if any(channel > available_channels for channel in source_channels):
        raise InvalidROI("sourceChannels contains an unavailable channel")

    height = bounds[3] - bounds[1]
    width = bounds[2] - bounds[0]
    composite = np.zeros((height, width, 3), dtype=np.float32)
    channel_metadata = {
        int(channel.get("index", index)) + 1: channel
        for index, channel in enumerate(model.get("channels", []))
    }
    for channel_number in source_channels:
        plane = _plane(
            image_array,
            axes,
            bounds,
            channel=channel_number,
            timepoint=timepoint,
            z_index=z_index,
        )
        metadata = channel_metadata.get(channel_number, {})
        window = metadata.get("window", {})
        low = _finite(window.get("start"), float(np.nanmin(plane)))
        high = _finite(window.get("end"), float(np.nanmax(plane)))
        if high <= low:
            high = low + 1.0
        normalized = np.clip(
            (plane.astype(np.float32, copy=False) - low) / (high - low), 0, 1
        )
        color = _color(metadata.get("color"), "#FFFFFF")
        composite += normalized[..., None] * np.asarray(color, dtype=np.float32)
    composite = np.clip(composite, 0, 1)

    if label_path or label_channel is not None:
        if label_path:
            label = _label(model, field, label_path)
            label_array = _array(root, label_path, label["datasets"][0]["path"])
            label_axes = _axis_names(label.get("axes"), label_array.ndim)
            _validate_bounds(bounds, label_array.shape, label_axes)
            label_plane = _plane(
                label_array,
                label_axes,
                bounds,
                channel=1,
                timepoint=timepoint,
                z_index=z_index,
            )
            label_color = _color(label.get("color"), "#FFFF00")
        else:
            if label_channel is None or label_channel > available_channels:
                raise InvalidROI("labelChannel is unavailable")
            label_plane = _plane(
                image_array,
                axes,
                bounds,
                channel=label_channel,
                timepoint=timepoint,
                z_index=z_index,
            )
            label_color = _color(None, "#FFFF00")
        mask = (
            label_plane == label_value
            if label_value is not None
            else label_plane != 0
        )
        outline = _outline(np.asarray(mask, dtype=bool))
        composite[outline] = np.asarray(label_color, dtype=np.float32)

    pixels = np.rint(composite * 255).astype(np.uint8)
    buffer = BytesIO()
    Image.fromarray(pixels, mode="RGB").save(buffer, format="PNG", optimize=True)
    content = buffer.getvalue()
    if len(content) > roi_max_output_bytes():
        raise ROILimitExceeded(
            f"The encoded ROI exceeds {roi_max_output_bytes()} bytes"
        )
    safe_field = re.sub(r"[^A-Za-z0-9_.-]+", "_", field).strip("_") or "image"
    return RenderedROI(content, f"{safe_field}_roi.png")


def _field(model: dict[str, Any], requested: Any) -> str:
    initial = str(model.get("initial_path") or ".")
    fields = (
        [
            str(field["path"])
            for well in model.get("plate", {}).get("wells", [])
            for field in well.get("fields", [])
        ]
        if model.get("kind") == "plate"
        else [initial]
    )
    field = str(requested or initial).strip()
    if field not in fields:
        raise InvalidROI("field is not part of this OME-Zarr store")
    return field


def _bounds(value: Any) -> tuple[int, int, int, int]:
    parts = str(value or "").split(",")
    if len(parts) != 4 or any(not re.fullmatch(r"\d+", part.strip()) for part in parts):
        raise InvalidROI("roi must be x0,y0,x1,y1 using nonnegative integers")
    x0, y0, x1, y1 = (int(part) for part in parts)
    if x1 <= x0 or y1 <= y0:
        raise InvalidROI("roi maxima must be greater than minima")
    if x1 - x0 > roi_max_width() or y1 - y0 > roi_max_height():
        raise ROILimitExceeded(
            f"ROI dimensions may not exceed {roi_max_width()}×{roi_max_height()}"
        )
    return x0, y0, x1, y1


def _channels(value: Any) -> list[int] | None:
    if value in (None, ""):
        return None
    parts = str(value).split(",")
    if not parts or any(not re.fullmatch(r"[1-9]\d*", part.strip()) for part in parts):
        raise InvalidROI("sourceChannels must contain one-based positive integers")
    result = list(dict.fromkeys(int(part) for part in parts))
    return result


def _index(value: Any, name: str) -> int:
    if value in (None, ""):
        return 0
    text = str(value)
    if not re.fullmatch(r"\d+", text):
        raise InvalidROI(f"{name} must be a zero-based nonnegative integer")
    return int(text)


def _optional_positive_index(value: Any, name: str) -> int | None:
    if value in (None, ""):
        return None
    text = str(value)
    if not re.fullmatch(r"[1-9]\d*", text):
        raise InvalidROI(f"{name} must be a positive integer")
    return int(text)


def _safe_path(value: Any, name: str) -> str | None:
    if value in (None, ""):
        return None
    text = str(value).replace("\\", "/")
    path = PurePosixPath(text)
    if path.is_absolute() or ".." in path.parts or "\x00" in text:
        raise InvalidROI(f"{name} is unsafe")
    return str(path).strip("/")


def _array(root, prefix: str, dataset: str):
    path = "/".join(
        value.strip("/")
        for value in (prefix, str(dataset))
        if value not in ("", ".")
    )
    try:
        return root[path]
    except (KeyError, TypeError) as exc:
        raise InvalidMetadata(f"OME-Zarr array '{path}' is unavailable") from exc


def _axis_names(values: Any, ndim: int) -> tuple[str, ...]:
    names = tuple(
        str(axis.get("name", "")) if isinstance(axis, dict) else str(axis)
        for axis in (values or [])
    )
    if len(names) != ndim or "y" not in names or "x" not in names:
        raise InvalidMetadata("OME-Zarr axes do not match the selected array")
    return names


def _axis_size(shape, axes: tuple[str, ...], name: str) -> int:
    return int(shape[axes.index(name)]) if name in axes else 1


def _validate_bounds(
    bounds: tuple[int, int, int, int], shape, axes: tuple[str, ...]
) -> None:
    x0, y0, x1, y1 = bounds
    if x1 > _axis_size(shape, axes, "x") or y1 > _axis_size(shape, axes, "y"):
        raise InvalidROI("roi extends beyond the native image bounds")


def _plane(
    array,
    axes: tuple[str, ...],
    bounds: tuple[int, int, int, int],
    *,
    channel: int,
    timepoint: int,
    z_index: int,
) -> np.ndarray:
    x0, y0, x1, y1 = bounds
    if timepoint and "t" not in axes:
        raise InvalidROI("Requested timepoint is unavailable")
    if z_index and "z" not in axes:
        raise InvalidROI("Requested Z plane is unavailable")
    selections: list[int | slice] = []
    for axis, size in zip(axes, array.shape):
        if axis == "x":
            selections.append(slice(x0, x1))
        elif axis == "y":
            selections.append(slice(y0, y1))
        elif axis == "c":
            if channel > int(size):
                raise InvalidROI("Requested channel is unavailable")
            selections.append(channel - 1)
        elif axis == "t":
            if timepoint >= int(size):
                raise InvalidROI("Requested timepoint is unavailable")
            selections.append(timepoint)
        elif axis == "z":
            if z_index >= int(size):
                raise InvalidROI("Requested Z plane is unavailable")
            selections.append(z_index)
        else:
            selections.append(0)
    try:
        plane = np.asarray(array[tuple(selections)])
    except (IndexError, ValueError) as exc:
        raise InvalidROI("The requested ROI could not be read") from exc
    plane = np.squeeze(plane)
    if plane.shape != (y1 - y0, x1 - x0):
        raise InvalidMetadata("The selected OME-Zarr plane is not two-dimensional")
    return plane


def _label(model: dict[str, Any], field: str, requested: str) -> dict[str, Any]:
    initial = str(model.get("initial_path") or ".")
    for label in model.get("labels", []):
        path = str(label.get("path") or "")
        resolved = (
            path
            if initial == "."
            else field + path[len(initial) :]
            if path == initial or path.startswith(initial + "/")
            else path
        )
        if requested == resolved:
            return {**label, "path": resolved}
    raise InvalidROI("labelPath is not an available label image for this field")


def _finite(value: Any, fallback: float) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return fallback
    return number if np.isfinite(number) else fallback


def _color(value: Any, fallback: str) -> tuple[float, float, float]:
    text = str(value or fallback).strip().lstrip("#")
    if not re.fullmatch(r"[0-9a-fA-F]{6}", text):
        text = fallback.lstrip("#")
    return tuple(int(text[index : index + 2], 16) / 255 for index in (0, 2, 4))


def _outline(mask: np.ndarray) -> np.ndarray:
    if not mask.any():
        return mask
    interior = mask.copy()
    up = np.zeros_like(mask)
    up[1:] = mask[:-1]
    down = np.zeros_like(mask)
    down[:-1] = mask[1:]
    left = np.zeros_like(mask)
    left[:, 1:] = mask[:, :-1]
    right = np.zeros_like(mask)
    right[:, :-1] = mask[:, 1:]
    interior &= up & down & left & right
    return mask & ~interior

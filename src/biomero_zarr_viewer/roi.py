"""Bounded, authenticated server-side ROI and gallery rendering."""

from __future__ import annotations

import math
import re
from dataclasses import dataclass
from io import BytesIO
from pathlib import PurePosixPath
from typing import Any

import numpy as np
import zarr
from PIL import Image, ImageDraw, ImageFont

from .errors import InvalidMetadata, InvalidROI, ROILimitExceeded, StoreMismatch
from .settings import (
    render_max_aggregate_pixels,
    render_max_overlays,
    render_max_panels,
    roi_max_channels,
    roi_max_height,
    roi_max_output_bytes,
    roi_max_width,
)

UUID_PATTERN = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    re.IGNORECASE,
)
HEX_COLOR_PATTERN = re.compile(r"^#?[0-9a-fA-F]{6}$")


@dataclass(frozen=True)
class RenderedROI:
    content: bytes
    filename: str


def render_roi_png(store_path, model: dict[str, Any], query, label_roots=None) -> RenderedROI:
    """Render the legacy single-overlay GET contract."""
    overlay = {}
    for source, target in (
        ("labelPath", "labelPath"),
        ("labelChannel", "labelChannel"),
        ("labelValue", "values"),
    ):
        value = query.get(source)
        if value not in (None, ""):
            overlay[target] = [value] if target == "values" else value
    if overlay:
        overlay["mode"] = "outline"
        overlay["outlineWidth"] = 2
    recipe = {
        "storeUuid": query.get("storeUuid"),
        "panels": [
            {
                "field": query.get("field"),
                "roi": query.get("roi"),
                "sourceChannels": query.get("sourceChannels"),
                "t": query.get("t"),
                "z": query.get("z"),
                "overlays": [overlay] if overlay else [],
                "scaleBar": False,
            }
        ],
    }
    return render_recipe_png(
        store_path, model, recipe, decorate=False, label_roots=label_roots
    )


def render_recipe_png(
    store_path,
    model: dict[str, Any],
    recipe: dict[str, Any],
    *,
    decorate: bool = True,
    label_roots=None,
) -> RenderedROI:
    if not isinstance(recipe, dict):
        raise InvalidROI("The render recipe must be a JSON object")
    _validate_store_uuid(model, recipe.get("storeUuid"))
    panels = recipe.get("panels")
    if not isinstance(panels, list) or not panels:
        raise InvalidROI("panels must be a non-empty array")
    if len(panels) > render_max_panels():
        raise ROILimitExceeded(
            f"At most {render_max_panels()} panels may be rendered"
        )

    validated = [_validate_panel(model, panel) for panel in panels]
    aggregate_pixels = sum(
        (panel["bounds"][2] - panel["bounds"][0])
        * (panel["bounds"][3] - panel["bounds"][1])
        for panel in validated
    )
    if aggregate_pixels > render_max_aggregate_pixels():
        raise ROILimitExceeded(
            "The render recipe exceeds the aggregate native-pixel budget"
        )

    root = zarr.open_group(str(store_path), mode="r")
    arrays: dict[str, Any] = {}
    planes: dict[tuple[Any, ...], np.ndarray] = {}
    rendered = [
        _render_panel(root, model, panel, arrays, planes, label_roots or {})
        for panel in validated
    ]
    if len(rendered) == 1 and not decorate:
        output = rendered[0]
    else:
        output = _compose_gallery(
            rendered,
            validated,
            columns=_layout_columns(recipe.get("layout"), len(rendered)),
            title=_bounded_text(recipe.get("title"), 200),
        )
    content = _encode_png(output)
    safe_name = re.sub(
        r"[^A-Za-z0-9_.-]+",
        "_",
        _bounded_text(recipe.get("filename"), 100) or (
            "zarr_gallery.png" if len(rendered) > 1 else "zarr_render.png"
        ),
    ).strip("_")
    if not safe_name.lower().endswith(".png"):
        safe_name += ".png"
    return RenderedROI(content, safe_name or "zarr_render.png")


def _validate_store_uuid(model: dict[str, Any], requested: Any) -> None:
    requested_uuid = str(requested or "").strip().lower()
    actual_uuid = str(model.get("store_uuid") or "").strip().lower()
    if requested_uuid and (
        not UUID_PATTERN.fullmatch(requested_uuid) or requested_uuid != actual_uuid
    ):
        raise StoreMismatch(
            "The requested measurement database does not match this OME-Zarr store"
        )


def _validate_panel(model: dict[str, Any], value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise InvalidROI("Each panel must be a JSON object")
    field = _field(model, value.get("field"))
    bounds = _bounds(value.get("roi"))
    timepoint = _index(value.get("t"), "t")
    z_index = _index(value.get("z"), "z")
    channels = _channel_specs(value, model)
    overlays = value.get("overlays", [])
    if overlays is None:
        overlays = []
    if not isinstance(overlays, list):
        raise InvalidROI("overlays must be an array")
    if len(overlays) > render_max_overlays():
        raise ROILimitExceeded(
            f"At most {render_max_overlays()} overlays may be rendered per panel"
        )
    return {
        "field": field,
        "bounds": bounds,
        "timepoint": timepoint,
        "z_index": z_index,
        "channels": channels,
        "overlays": [_overlay(item) for item in overlays],
        "title": _bounded_text(value.get("title"), 160),
        "caption": _bounded_text(value.get("caption"), 320),
        "scale_bar": value.get("scaleBar", True) is not False,
    }


def _channel_specs(panel: dict[str, Any], model: dict[str, Any]) -> list[dict[str, Any]]:
    raw_specs = panel.get("channels")
    if raw_specs not in (None, ""):
        if not isinstance(raw_specs, list) or not raw_specs:
            raise InvalidROI("channels must be a non-empty array")
        specs = []
        for item in raw_specs:
            if not isinstance(item, dict):
                raise InvalidROI("Each channel must be a JSON object")
            specs.append(
                {
                    "index": _positive_index(item.get("index"), "channel index"),
                    "color": _color_text(item.get("color")),
                    "low": _optional_finite(item.get("low"), "channel low"),
                    "high": _optional_finite(item.get("high"), "channel high"),
                }
            )
    else:
        selected = _channels(panel.get("sourceChannels"))
        if selected is None:
            selected = [
                int(channel["index"]) + 1
                for channel in model.get("channels", [])
                if channel.get("active", True)
            ]
            selected = (selected or [1])[: roi_max_channels()]
        specs = [
            {"index": index, "color": None, "low": None, "high": None}
            for index in selected
        ]
    if len(specs) > roi_max_channels():
        raise ROILimitExceeded(
            f"At most {roi_max_channels()} intensity channels may be rendered"
        )
    indexes = [item["index"] for item in specs]
    if len(indexes) != len(set(indexes)):
        raise InvalidROI("Intensity channel indexes must be unique")
    return specs


def _overlay(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise InvalidROI("Each overlay must be a JSON object")
    label_path = _safe_path(value.get("labelPath"), "labelPath")
    label_channel = _optional_positive_index(
        value.get("labelChannel"), "labelChannel"
    )
    if bool(label_path) == bool(label_channel):
        raise InvalidROI("Each overlay must use either labelPath or labelChannel")
    mode = str(value.get("mode") or "outline").strip().lower()
    if mode not in {"outline", "fill", "outline-fill"}:
        raise InvalidROI("overlay mode must be outline, fill, or outline-fill")
    values = _label_values(value.get("values", value.get("labelValue")))
    default_opacity = 0.3 if mode == "fill" else 1.0
    return {
        "label_path": label_path,
        "label_channel": label_channel,
        "values": values,
        "mode": mode,
        "color": _color_text(value.get("color")),
        "opacity": _opacity(value.get("opacity"), default_opacity),
        "outline_width": _outline_width(value.get("outlineWidth")),
        "name": _bounded_text(value.get("name"), 80),
    }


def _render_panel(root, model, panel, arrays, planes, label_roots) -> Image.Image:
    field = panel["field"]
    bounds = panel["bounds"]
    image_path = _joined_path(field, model["datasets"][0]["path"])
    image_array = _cached_array(root, image_path, arrays)
    axes = _axis_names(model.get("axes"), image_array.ndim)
    _validate_bounds(bounds, image_array.shape, axes)
    available_channels = _axis_size(image_array.shape, axes, "c")
    channel_metadata = {
        int(channel.get("index", index)) + 1: channel
        for index, channel in enumerate(model.get("channels", []))
    }
    height = bounds[3] - bounds[1]
    width = bounds[2] - bounds[0]
    composite = np.zeros((height, width, 3), dtype=np.float32)
    for channel in panel["channels"]:
        number = channel["index"]
        if number > available_channels:
            raise InvalidROI("An intensity channel is unavailable")
        plane = _cached_plane(
            image_array,
            axes,
            bounds,
            number,
            panel["timepoint"],
            panel["z_index"],
            planes,
        )
        metadata = channel_metadata.get(number, {})
        window = metadata.get("window", {})
        low = channel["low"]
        high = channel["high"]
        low = _finite(window.get("start"), float(np.nanmin(plane))) if low is None else low
        high = _finite(window.get("end"), float(np.nanmax(plane))) if high is None else high
        if high <= low:
            high = low + 1.0
        normalized = np.clip(
            (plane.astype(np.float32, copy=False) - low) / (high - low), 0, 1
        )
        color = _color(channel["color"] or metadata.get("color"), "#FFFFFF")
        composite += normalized[..., None] * np.asarray(color, dtype=np.float32)
    composite = np.clip(composite, 0, 1)

    for overlay in panel["overlays"]:
        label_color = overlay["color"]
        if overlay["label_path"]:
            label = _label(model, field, overlay["label_path"])
            label_root_path = label_roots.get(label["path"])
            if label_root_path is None:
                label_root = root
                label_path = _joined_path(label["path"], label["datasets"][0]["path"])
            else:
                label_root = zarr.open_group(str(label_root_path), mode="r")
                label_path = str(label["datasets"][0]["path"])
            label_array = _cached_array(label_root, label_path, arrays)
            label_axes = _axis_names(label.get("axes"), label_array.ndim)
            if label_color is None:
                label_color = label.get("color")
            channel = 1
        else:
            channel = overlay["label_channel"]
            if channel > available_channels:
                raise InvalidROI("An appended label channel is unavailable")
            label_array = image_array
            label_axes = axes
        padded, crop = _expanded_bounds(
            bounds,
            label_array.shape,
            label_axes,
            overlay["outline_width"],
        )
        label_plane = _cached_plane(
            label_array,
            label_axes,
            padded,
            channel,
            panel["timepoint"],
            panel["z_index"],
            planes,
        )
        if overlay["values"] is None:
            padded_mask = label_plane != 0
        else:
            padded_mask = np.isin(label_plane, overlay["values"])
        mask = padded_mask[crop]
        color = np.asarray(_color(label_color, "#FFFF00"), dtype=np.float32)
        if overlay["mode"] in {"fill", "outline-fill"}:
            composite[mask] = (
                composite[mask] * (1.0 - overlay["opacity"])
                + color * overlay["opacity"]
            )
        if overlay["mode"] in {"outline", "outline-fill"}:
            outline = _inside_outline(
                padded_mask, overlay["outline_width"]
            )[crop]
            composite[outline] = (
                composite[outline] * (1.0 - overlay["opacity"])
                + color * overlay["opacity"]
            )

    pixels = np.rint(np.clip(composite, 0, 1) * 255).astype(np.uint8)
    image = Image.fromarray(pixels, mode="RGB")
    if panel["scale_bar"]:
        _draw_scale_bar(image, model)
    return image


def _compose_gallery(
    images: list[Image.Image],
    panels: list[dict[str, Any]],
    *,
    columns: int,
    title: str,
) -> Image.Image:
    font = ImageFont.load_default()
    panel_width = max(image.width for image in images)
    text_height = 44
    panel_height = max(image.height for image in images) + text_height
    rows = math.ceil(len(images) / columns)
    title_height = 24 if title else 0
    canvas = Image.new(
        "RGB",
        (panel_width * columns, title_height + panel_height * rows),
        (8, 12, 18),
    )
    draw = ImageDraw.Draw(canvas)
    if title:
        draw.text((8, 6), title, fill=(255, 255, 255), font=font)
    for index, (image, panel) in enumerate(zip(images, panels)):
        column, row = index % columns, index // columns
        x = column * panel_width + (panel_width - image.width) // 2
        y = title_height + row * panel_height
        canvas.paste(image, (x, y))
        title_text = panel["title"] or f"Panel {index + 1}"
        draw.text((column * panel_width + 6, y + max(item.height for item in images) + 4), title_text, fill=(255, 255, 255), font=font)
        caption = panel["caption"]
        if caption:
            draw.text((column * panel_width + 6, y + max(item.height for item in images) + 18), caption, fill=(180, 196, 215), font=font)
        legend_x = column * panel_width + 6
        legend_y = y + max(item.height for item in images) + 31
        for overlay in panel["overlays"]:
            if not overlay["name"]:
                continue
            color = tuple(int(value * 255) for value in _color(overlay["color"], "#FFFF00"))
            draw.rectangle((legend_x, legend_y, legend_x + 7, legend_y + 7), fill=color)
            draw.text((legend_x + 10, legend_y - 2), overlay["name"], fill=(220, 225, 232), font=font)
            legend_x += min(120, 16 + len(overlay["name"]) * 6)
    return canvas


def _draw_scale_bar(image: Image.Image, model: dict[str, Any]) -> None:
    pixel_size, unit = _pixel_scale(model)
    if pixel_size is None:
        return
    target_units = pixel_size * max(20, image.width // 5)
    power = 10 ** math.floor(math.log10(target_units))
    normalized = target_units / power
    nice = (1 if normalized < 1.5 else 2 if normalized < 3.5 else 5 if normalized < 7.5 else 10) * power
    length = max(12, min(image.width // 3, round(nice / pixel_size)))
    draw = ImageDraw.Draw(image)
    x1, y = image.width - 8, image.height - 10
    x0 = x1 - length
    draw.line((x0, y, x1, y), fill=(255, 255, 255), width=2)
    draw.line((x0, y - 3, x0, y + 3), fill=(255, 255, 255), width=1)
    draw.line((x1, y - 3, x1, y + 3), fill=(255, 255, 255), width=1)
    label = f"{nice:g} {unit}"
    draw.text((x0, max(0, y - 12)), label, fill=(255, 255, 255), font=ImageFont.load_default())


def _pixel_scale(model: dict[str, Any]) -> tuple[float | None, str]:
    axes = model.get("axes") or []
    x_index = next(
        (index for index, axis in enumerate(axes) if axis.get("name") == "x"),
        None,
    )
    transforms = (model.get("datasets") or [{}])[0].get(
        "coordinate_transformations", []
    )
    for transform in transforms if isinstance(transforms, list) else []:
        values = transform.get("scale") if transform.get("type") == "scale" else None
        if x_index is not None and isinstance(values, list) and x_index < len(values):
            size = _finite(values[x_index], 0.0)
            if size > 0:
                return size, str(axes[x_index].get("unit") or "px")
    return None, "px"


def _encode_png(image: Image.Image) -> bytes:
    buffer = BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    content = buffer.getvalue()
    if len(content) > roi_max_output_bytes():
        raise ROILimitExceeded(
            f"The encoded render exceeds {roi_max_output_bytes()} bytes"
        )
    return content


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
    parts = value if isinstance(value, (list, tuple)) else str(value or "").split(",")
    if (
        len(parts) != 4
        or any(not re.fullmatch(r"\d+", str(part).strip()) for part in parts)
    ):
        raise InvalidROI("roi must contain x0,y0,x1,y1 nonnegative integers")
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
    parts = value if isinstance(value, list) else str(value).split(",")
    if not parts or any(
        not re.fullmatch(r"[1-9]\d*", str(part).strip()) for part in parts
    ):
        raise InvalidROI("sourceChannels must contain one-based positive integers")
    return list(dict.fromkeys(int(part) for part in parts))


def _label_values(value: Any) -> list[int] | None:
    if value in (None, "", []):
        return None
    parts = value if isinstance(value, list) else [value]
    if len(parts) > 256:
        raise ROILimitExceeded("An overlay may select at most 256 label values")
    if any(not re.fullmatch(r"[1-9]\d*", str(part).strip()) for part in parts):
        raise InvalidROI("Overlay label values must be positive integers")
    return list(dict.fromkeys(int(part) for part in parts))


def _index(value: Any, name: str) -> int:
    if value in (None, ""):
        return 0
    if not re.fullmatch(r"\d+", str(value)):
        raise InvalidROI(f"{name} must be a zero-based nonnegative integer")
    return int(value)


def _positive_index(value: Any, name: str) -> int:
    result = _optional_positive_index(value, name)
    if result is None:
        raise InvalidROI(f"{name} must be a positive integer")
    return result


def _optional_positive_index(value: Any, name: str) -> int | None:
    if value in (None, ""):
        return None
    if not re.fullmatch(r"[1-9]\d*", str(value)):
        raise InvalidROI(f"{name} must be a positive integer")
    return int(value)


def _safe_path(value: Any, name: str) -> str | None:
    if value in (None, ""):
        return None
    text = str(value).replace("\\", "/")
    path = PurePosixPath(text)
    if path.is_absolute() or ".." in path.parts or "\x00" in text:
        raise InvalidROI(f"{name} is unsafe")
    return str(path).strip("/")


def _optional_finite(value: Any, name: str) -> float | None:
    if value in (None, ""):
        return None
    try:
        result = float(value)
    except (TypeError, ValueError) as exc:
        raise InvalidROI(f"{name} must be finite") from exc
    if not np.isfinite(result):
        raise InvalidROI(f"{name} must be finite")
    return result


def _opacity(value: Any, fallback: float) -> float:
    result = _optional_finite(value, "overlay opacity")
    if result is None:
        return fallback
    if result < 0 or result > 1:
        raise InvalidROI("overlay opacity must be between 0 and 1")
    return result


def _outline_width(value: Any) -> int:
    if value in (None, ""):
        return 2
    if not re.fullmatch(r"[1-8]", str(value)):
        raise InvalidROI("outlineWidth must be an integer from 1 through 8")
    return int(value)


def _color_text(value: Any) -> str | None:
    if value in (None, ""):
        return None
    text = str(value).strip()
    if not HEX_COLOR_PATTERN.fullmatch(text):
        raise InvalidROI("Colors must use six hexadecimal digits")
    return "#" + text.lstrip("#").upper()


def _bounded_text(value: Any, maximum: int) -> str:
    text = " ".join(str(value or "").split())
    return text[:maximum]


def _layout_columns(value: Any, panel_count: int) -> int:
    columns = value.get("columns") if isinstance(value, dict) else None
    if columns is None:
        return max(1, math.ceil(math.sqrt(panel_count)))
    if not re.fullmatch(r"[1-5]", str(columns)):
        raise InvalidROI("layout.columns must be an integer from 1 through 5")
    return min(int(columns), panel_count)


def _joined_path(prefix: str, dataset: str) -> str:
    return "/".join(
        part.strip("/")
        for part in (prefix, str(dataset))
        if part not in ("", ".")
    )


def _cached_array(root, path: str, cache: dict[str, Any]):
    key = (str(getattr(root, "path", "")), str(getattr(root.store, "path", "")), path)
    if key not in cache:
        try:
            cache[key] = root[path]
        except (KeyError, TypeError) as exc:
            raise InvalidMetadata(f"OME-Zarr array '{path}' is unavailable") from exc
    return cache[key]


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


def _validate_bounds(bounds, shape, axes: tuple[str, ...]) -> None:
    _x0, _y0, x1, y1 = bounds
    if x1 > _axis_size(shape, axes, "x") or y1 > _axis_size(shape, axes, "y"):
        raise InvalidROI("roi extends beyond the native image bounds")


def _cached_plane(
    array,
    axes,
    bounds,
    channel,
    timepoint,
    z_index,
    cache,
) -> np.ndarray:
    path = str(getattr(array, "path", repr(array)))
    key = (path, tuple(bounds), channel, timepoint, z_index)
    if key not in cache:
        cache[key] = _plane(
            array,
            axes,
            bounds,
            channel=channel,
            timepoint=timepoint,
            z_index=z_index,
        )
    return cache[key]


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


def _expanded_bounds(bounds, shape, axes, padding):
    x0, y0, x1, y1 = bounds
    px0 = max(0, x0 - padding)
    py0 = max(0, y0 - padding)
    px1 = min(_axis_size(shape, axes, "x"), x1 + padding)
    py1 = min(_axis_size(shape, axes, "y"), y1 + padding)
    padded = (px0, py0, px1, py1)
    crop = (
        slice(y0 - py0, y1 - py0),
        slice(x0 - px0, x1 - px0),
    )
    return padded, crop


def _erode_once(mask: np.ndarray) -> np.ndarray:
    interior = mask.copy()
    up = np.zeros_like(mask)
    up[1:] = mask[:-1]
    down = np.zeros_like(mask)
    down[:-1] = mask[1:]
    left = np.zeros_like(mask)
    left[:, 1:] = mask[:, :-1]
    right = np.zeros_like(mask)
    right[:, :-1] = mask[:, 1:]
    return interior & up & down & left & right


def _inside_outline(mask: np.ndarray, width: int = 1) -> np.ndarray:
    if not mask.any():
        return mask
    interior = mask.copy()
    for _ in range(width):
        interior = _erode_once(interior)
    return mask & ~interior


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

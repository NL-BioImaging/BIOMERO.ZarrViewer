"""Bounded scientific vector overlays shared by ROI and gallery rendering."""

from __future__ import annotations

import json
import math
import re

from PIL import ImageDraw

from .errors import InvalidROI, ROILimitExceeded

_COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")
MAX_ITEMS = 256
MAX_BYTES = 16_384


def _coordinate(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise InvalidROI("Vector coordinates must be numbers")
    if not math.isfinite(value) or not 0 <= value <= 1_000_000_000:
        raise InvalidROI("Vector coordinate is out of bounds")
    return float(value)


def _index(value):
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise InvalidROI("Vector t and z must be non-negative integers")
    return value


def validate_vectors(value):
    if value is None:
        return []
    if not isinstance(value, dict) or value.get("version") != 1:
        raise InvalidROI("Unsupported vector overlay version")
    items = value.get("items")
    if not isinstance(items, list):
        raise InvalidROI("Vector items must be an array")
    if len(items) > MAX_ITEMS:
        raise ROILimitExceeded("At most 256 vector items may be rendered")
    if len(json.dumps(value, separators=(",", ":")).encode("utf-8")) > MAX_BYTES:
        raise ROILimitExceeded("Vector overlay exceeds 16 KiB")
    checked = []
    for item in items:
        if not isinstance(item, dict) or item.get("kind") not in {"point", "line"}:
            raise InvalidROI("Invalid vector item")
        kind = item["kind"]
        color = item.get("color")
        if not isinstance(color, str) or not _COLOR.fullmatch(color):
            raise InvalidROI("Invalid vector color")
        size = item.get("radius" if kind == "point" else "width", 4 if kind == "point" else 2)
        if isinstance(size, bool) or not isinstance(size, (int, float)) or not math.isfinite(size) or not 1 <= size <= 20:
            raise InvalidROI("Invalid vector marker size")
        checked.append({
            "kind": kind,
            "x": _coordinate(item.get("x")),
            "y": _coordinate(item.get("y")),
            "x2": _coordinate(item.get("x2")) if kind == "line" else None,
            "y2": _coordinate(item.get("y2")) if kind == "line" else None,
            "t": _index(item.get("t")),
            "z": _index(item.get("z")),
            "color": color,
            "size": float(size),
            "dashed": item.get("dashed") is True,
            "trail": item.get("trail") is True,
        })
    return checked


def draw_vectors(image, items, bounds, t, z, start_t=None):
    draw = ImageDraw.Draw(image)
    x0, y0, _, _ = bounds
    for item in items:
        if not _visible(item, t, z, start_t):
            continue
        x, y = item["x"] - x0, item["y"] - y0
        color = item["color"]
        if item["kind"] == "point":
            radius = item["size"]
            if x + radius < 0 or y + radius < 0 or x - radius >= image.width or y - radius >= image.height:
                continue
            draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=color, outline="white", width=1)
            continue
        x2, y2 = item["x2"] - x0, item["y2"] - y0
        clipped = _clip_line(x, y, x2, y2, image.width, image.height)
        if clipped is None:
            continue
        x, y, x2, y2 = clipped
        width = max(1, round(item["size"]))
        length = math.hypot(x2 - x, y2 - y)
        if not item["dashed"] or length <= 8:
            draw.line((x, y, x2, y2), fill=color, width=width)
        else:
            for start in range(0, min(math.ceil(length), 64 * 12), 12):
                end = min(length, start + 7)
                draw.line((x + (x2 - x) * start / length, y + (y2 - y) * start / length,
                           x + (x2 - x) * end / length, y + (y2 - y) * end / length), fill=color, width=width)


def _visible(item, t, z, start_t):
    if item["z"] != z or item["t"] > t:
        return False
    if start_t is not None:
        return item["t"] >= start_t
    return item["trail"] or item["t"] == t


def svg_vectors(items, bounds, t, z, start_t=None):
    """Return bounded SVG geometry in crop-local coordinates."""
    x0, y0, x1, y1 = bounds
    width, height = x1 - x0, y1 - y0
    elements = []
    for item in items:
        if not _visible(item, t, z, start_t):
            continue
        x, y = item["x"] - x0, item["y"] - y0
        color = item["color"]
        if item["kind"] == "point":
            radius = item["size"]
            if x + radius < 0 or y + radius < 0 or x - radius >= width or y - radius >= height:
                continue
            elements.append(f'<circle cx="{x:.3f}" cy="{y:.3f}" r="{radius:.3f}" fill="{color}" stroke="white" stroke-width="1"/>')
            continue
        clipped = _clip_line(x, y, item["x2"] - x0, item["y2"] - y0, width, height)
        if clipped is None:
            continue
        ax, ay, bx, by = clipped
        dash = ' stroke-dasharray="7 5"' if item["dashed"] else ""
        elements.append(f'<path d="M{ax:.3f} {ay:.3f}L{bx:.3f} {by:.3f}" fill="none" stroke="{color}" stroke-width="{item["size"]:.3f}"{dash}/>')
    return elements


def _clip_line(x, y, x2, y2, width, height):
    """Clip before asking Pillow to draw potentially huge untrusted coordinates."""
    dx, dy = x2 - x, y2 - y
    start, end = 0.0, 1.0
    for p, q in ((-dx, x), (dx, width - 1 - x), (-dy, y), (dy, height - 1 - y)):
        if p == 0:
            if q < 0:
                return None
        else:
            ratio = q / p
            if p < 0:
                start = max(start, ratio)
            else:
                end = min(end, ratio)
            if start > end:
                return None
    return x + dx * start, y + dy * start, x + dx * end, y + dy * end

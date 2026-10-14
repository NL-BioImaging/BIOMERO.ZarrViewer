"""A persistent, tiled RGB plate pyramid in the shared cache.

The derivative is a ZIP_STORED archive of lossless PNG tiles. Construction uses
disk-backed arrays and bounded blocks, never a whole plate in Python memory.
"""
from io import BytesIO
import hashlib
import json
import math
from pathlib import Path
import time
import zipfile

import numpy as np
from PIL import Image, ImageOps
import zarr

from . import volume_cache as cache
from .errors import DataNotFound, InvalidROI, ROILimitExceeded
from .settings import mount_root

TILE_SIZE = 512
CELL_SIZE = 420
INSET = 8
IMAGE_SIZE = CELL_SIZE - 2 * INSET


def _group(claims, field, safe_path):
    for name in ("zarr.json", ".zattrs"):
        try:
            path, _ = safe_path(claims["store"], f"{field}/{name}", claims.get("routes", []))
        except DataNotFound:
            continue
        if path.stat().st_size > 4 * 1024 * 1024:
            raise ROILimitExceeded("Mosaic metadata too large")
        raw = path.read_bytes()
        value = json.loads(raw)
        if name == "zarr.json": value = value.get("attributes", {}).get("ome", {})
        return value, raw, name
    raise DataNotFound("Mosaic field metadata not found")


def _array(claims, field, safe_path):
    meta, raw, name = _group(claims, field, safe_path)
    multiscale = meta["multiscales"][0]
    axes = [a["name"] if isinstance(a, dict) else a for a in multiscale["axes"]]
    dataset = multiscale["datasets"][0]["path"]
    path, _ = safe_path(claims["store"], f"{field}/{dataset}/{'zarr.json' if name == 'zarr.json' else '.zarray'}", claims.get("routes", []))
    array = zarr.open_array(str(path.parent), mode="r")
    if len(axes) != array.ndim or len(set(axes)) != len(axes) or not {"x", "y"} <= set(axes):
        raise InvalidROI("Invalid mosaic axes")
    width, height = [int(array.shape[axes.index(a)]) for a in ("x", "y")]
    if width * height > 16_777_216:
        raise ROILimitExceeded("A mosaic field exceeds 16 million pixels")
    return array, axes, width, height, raw, path.parent


def validate_options(options):
    try:
        width, height = int(options["width"]), int(options["height"])
        tiles = options["tiles"]
        channels = options["channels"]
        z, t = int(options.get("z", 0)), int(options.get("t", 0))
        if not (0 < width <= 100_000 and 0 < height <= 100_000 and z >= 0 and t >= 0): raise ValueError()
        if not isinstance(tiles, list) or not 1 <= len(tiles) <= 1536: raise ValueError()
        if not isinstance(channels, list) or len(channels) > 8: raise ValueError()
        seen = set()
        clean = []
        for tile in tiles:
            field, left, top = tile["path"], int(tile["left"]), int(tile["top"])
            if not isinstance(field, str) or len(field) > 512 or not field or field.startswith(("/", "\\")) or ".." in field.replace("\\", "/").split("/"): raise ValueError()
            if field in seen or min(left, top) < 0 or left + CELL_SIZE > width or top + CELL_SIZE > height: raise ValueError()
            seen.add(field)
            clean.append({"path": field, "left": left, "top": top})
        clean_channels = []
        for channel in channels:
            index, low, high = int(channel["index"]), float(channel["low"]), float(channel["high"])
            color = channel["color"].lstrip("#")
            if index < 0 or len(color) != 6 or not np.isfinite([low, high]).all() or high < low: raise ValueError()
            int(color, 16)
            clean_channels.append({"index": index, "low": low, "high": high, "color": color})
        return {"width": width, "height": height, "tiles": clean, "channels": clean_channels, "z": z, "t": t}
    except (KeyError, TypeError, ValueError, OverflowError, AttributeError) as exc:
        raise InvalidROI("Invalid plate mosaic options") from exc


def request_mosaic(claims, scope, options, safe_path, *, rebuild=False, asynchronous=True):
    options = validate_options(options)
    _, _, field_width, field_height, raw, _ = _array(claims, options["tiles"][0]["path"], safe_path)
    factor = max(field_width, field_height) / IMAGE_SIZE
    width, height = [math.ceil(options[a] * factor) for a in ("width", "height")]
    levels = math.ceil(math.log2(max(width, height) / TILE_SIZE)) + 1 if max(width, height) > TILE_SIZE else 1
    # Worst-case PNG archive (all levels), two disk-backed working levels and
    # per-tile headers are reserved before any writes. All share the same quota.
    reservation = width * height * 9 + math.ceil(width / TILE_SIZE) * math.ceil(height / TILE_SIZE) * 8192 + 65536
    metadata = {"kind": "plate-mosaic-v1", "width": width, "height": height, "factor": factor,
                "levels": levels, "tile_size": TILE_SIZE, "full_width": field_width, "fields": len(options["tiles"])}
    # OME-Zarr imports are treated as immutable. Metadata/route changes select a
    # new derivative; the explicit rebuild action covers in-place chunk edits.
    root_meta, root_raw, _ = _group(claims, ".", safe_path)
    identity = [scope, claims["store"], claims.get("routes", []), hashlib.sha256(root_raw + raw).hexdigest(), options, metadata]
    key = hashlib.sha256(json.dumps(identity, sort_keys=True).encode()).hexdigest()
    if cache._reserve(key, scope, reservation, metadata, rebuild=rebuild):
        if asynchronous:
            cache._pool.submit(_build, key, claims, options, metadata, safe_path, reservation)
        else:
            _build(key, claims, options, metadata, safe_path, reservation)
    return cache.entry(key, scope)


def _rgb(array, axes, channels, z, t):
    height, width = [array.shape[axes.index(a)] for a in ("y", "x")]
    output = np.zeros((height, width, 3), dtype=np.float32)
    for channel in channels:
        index = channel["index"]
        if ("c" not in axes and index) or ("c" in axes and index >= array.shape[axes.index("c")]):
            raise InvalidROI("Mosaic channel is unavailable in a field")
        selection = [slice(None) if a in ("y", "x") else index if a == "c" else min(n-1, z) if a == "z" else min(n-1, t) if a == "t" else 0 for a, n in zip(axes, array.shape)]
        pixels = np.asarray(array[tuple(selection)], dtype=np.float32)
        if axes.index("x") < axes.index("y"): pixels = pixels.T
        intensity = np.clip((pixels - channel["low"]) / max(np.finfo(float).eps, channel["high"] - channel["low"]), 0, 1)
        color = np.array([int(channel["color"][i:i+2], 16) for i in (0, 2, 4)], dtype=np.float32)
        output += intensity[..., None] * color
    return Image.fromarray(np.nan_to_num(np.clip(output, 0, 255)).astype(np.uint8))


def _progress(key, value):
    with cache.database() as db:
        db.execute("UPDATE entries SET status='building',progress=? WHERE key=?", (value, key))


def _build(key, claims, options, metadata, safe_path, reservation):
    root = cache.cache_root()
    scratch, following = root / (key + ".scratch"), root / (key + ".next")
    temporary, target = root / (key + ".part"), root / (key + ".bin")
    current = smaller = None
    try:
        width, height, factor = metadata["width"], metadata["height"], metadata["factor"]
        current = np.memmap(scratch, mode="w+", dtype="uint8", shape=(height, width, 3))
        # New files read as zero; do not eagerly touch the entire plate.
        for index, tile in enumerate(options["tiles"]):
            array, axes, _, _, _, array_path = _array(claims, tile["path"], safe_path)
            cache.fingerprint(array_path, Path(mount_root()))
            image = _rgb(array, axes, options["channels"], options["z"], options["t"])
            extent = max(1, round(IMAGE_SIZE * factor))
            image = ImageOps.contain(image, (extent, extent), Image.Resampling.LANCZOS)
            left = round((tile["left"] + INSET) * factor) + (extent - image.width) // 2
            top = round((tile["top"] + INSET) * factor) + (extent - image.height) // 2
            current[top:top+image.height, left:left+image.width] = np.asarray(image)
            _progress(key, .55 * (index + 1) / len(options["tiles"]))
        with zipfile.ZipFile(temporary, "w", compression=zipfile.ZIP_STORED, allowZip64=True) as archive:
            for level in range(metadata["levels"]):
                for y in range(0, height, TILE_SIZE):
                    for x in range(0, width, TILE_SIZE):
                        image = Image.fromarray(np.asarray(current[y:min(height,y+TILE_SIZE), x:min(width,x+TILE_SIZE)]))
                        encoded = BytesIO(); image.save(encoded, format="PNG", compress_level=1)
                        archive.writestr(f"{level}/{x//TILE_SIZE}/{y//TILE_SIZE}.png", encoded.getvalue())
                    _progress(key, .55 + .44 * (level + min(height, y + TILE_SIZE) / height) / metadata["levels"])
                _progress(key, .55 + .44 * (level + 1) / metadata["levels"])
                if level + 1 == metadata["levels"]: break
                next_width, next_height = (width + 1) // 2, (height + 1) // 2
                smaller = np.memmap(following, mode="w+", dtype="uint8", shape=(next_height, next_width, 3))
                # Even block boundaries preserve the same box average at seams.
                for y in range(0, next_height, TILE_SIZE):
                    for x in range(0, next_width, TILE_SIZE):
                        right, bottom = min(next_width,x+TILE_SIZE), min(next_height,y+TILE_SIZE)
                        image = Image.fromarray(np.asarray(current[y*2:min(height,bottom*2), x*2:min(width,right*2)]))
                        smaller[y:bottom,x:right] = np.asarray(image.resize((right-x,bottom-y), Image.Resampling.BOX))
                smaller.flush(); del smaller; smaller = None
                del current; current = None
                scratch.unlink(); following.replace(scratch)
                width, height = next_width, next_height
                current = np.memmap(scratch, mode="r", dtype="uint8", shape=(height,width,3))
        del current; current = None
        scratch.unlink()
        size = temporary.stat().st_size
        if size > reservation: raise ROILimitExceeded("Mosaic exceeds reserved cache space")
        temporary.replace(target)
        with cache.database() as db:
            db.execute("UPDATE entries SET status='ready',progress=1,size=?,accessed=? WHERE key=?", (size,time.time(),key))
    except Exception as exc:
        if current is not None: del current
        if smaller is not None: del smaller
        for path in (scratch, following, temporary): path.unlink(missing_ok=True)
        with cache.database() as db:
            db.execute("UPDATE entries SET status='error',size=0,error=? WHERE key=?", (str(exc)[:500], key))


def read_tile(result, level, x, y):
    meta = result["metadata"]
    if result["status"] != "ready" or meta.get("kind") != "plate-mosaic-v1":
        raise DataNotFound("Plate mosaic is not ready")
    if not 0 <= level < meta["levels"] or min(x, y) < 0 or x*TILE_SIZE >= math.ceil(meta["width"]/2**level) or y*TILE_SIZE >= math.ceil(meta["height"]/2**level):
        raise InvalidROI("Invalid mosaic tile")
    try:
        with zipfile.ZipFile(cache.cache_root() / (result["key"] + ".bin")) as archive:
            return archive.read(f"{level}/{x}/{y}.png")
    except (FileNotFoundError, KeyError) as exc:
        raise DataNotFound("Mosaic was evicted; reopen the plate") from exc

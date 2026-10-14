"""Bounded, shared on-disk volumes with cross-process jobs and LRU eviction."""
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
import hashlib
import json
import os
import math
from pathlib import Path
import sqlite3
import time
from functools import lru_cache

import numpy as np
import zarr

from .errors import DataNotFound, InvalidROI, ROILimitExceeded, UnsafePath

MAX_VOLUME_BYTES = 256 * 1024 * 1024
_pool = ThreadPoolExecutor(max_workers=2, thread_name_prefix="zarr-cache")


def cached_blob(key, scope, reservation, metadata, build):
    """Reuse the same quota/index for display previews and raw volumes."""
    root = cache_root()
    if _reserve(key, scope, reservation, metadata):
        temporary = root / (key + ".part")
        try:
            content = build()
            if len(content) > reservation:
                raise ROILimitExceeded("Preview exceeds its reserved cache budget")
            temporary.write_bytes(content)
            temporary.replace(root / (key + ".bin"))
            with database() as db:
                db.execute("UPDATE entries SET status='ready',progress=1,size=? WHERE key=?", (len(content), key))
        except Exception as exc:
            temporary.unlink(missing_ok=True)
            with database() as db:
                db.execute("UPDATE entries SET status='error',size=0,error=? WHERE key=?", (str(exc)[:500], key))
            raise
    for _ in range(200):
        result = entry(key, scope)
        if result["status"] == "ready":
            return (root / (key + ".bin")).read_bytes()
        if result["status"] == "error":
            raise InvalidROI(result["error"])
        time.sleep(.05)
    raise ROILimitExceeded("Preview is busy; retry shortly")


@lru_cache(maxsize=32)
def _ensure_root(value):
    path = Path(value)
    path.mkdir(parents=True, exist_ok=True)
    return path


def cache_root():
    return _ensure_root(os.environ.get("BIOMERO_ZARR_CACHE_DIR", "/opt/omero/web/OMERO.web/var/zarr-cache"))


def cache_limit():
    return max(0, int(os.environ.get("BIOMERO_ZARR_CACHE_MAX_BYTES", "20000000000")))


def _process_stamp(pid):
    if os.name == "nt":
        import ctypes
        from ctypes import wintypes
        kernel = ctypes.windll.kernel32
        kernel.OpenProcess.restype = wintypes.HANDLE
        kernel.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
        kernel.CloseHandle.argtypes = [wintypes.HANDLE]
        kernel.GetProcessTimes.argtypes = [wintypes.HANDLE] + [ctypes.POINTER(wintypes.FILETIME)]*4
        handle = kernel.OpenProcess(0x1000, False, pid)
        if not handle: return None
        try:
            values = [wintypes.FILETIME() for _ in range(4)]
            if not kernel.GetProcessTimes(handle, *[ctypes.byref(value) for value in values]): return None
            return str((values[0].dwHighDateTime << 32) | values[0].dwLowDateTime)
        finally:
            kernel.CloseHandle(handle)
    try:
        return Path(f"/proc/{pid}/stat").read_text().rsplit(")",1)[1].split()[19]
    except (OSError,IndexError):
        return None


_OWNER = f"{os.getpid()}:{_process_stamp(os.getpid())}"


def _owner_alive(owner):
    # PID alone can be reused after a container restart. Include process birth.
    if owner == _OWNER: return True
    if not isinstance(owner,str) or ":" not in owner: return False
    pid,stamp = owner.split(":",1)
    actual = _process_stamp(int(pid))
    return actual is not None and actual == stamp


@contextmanager
def database():
    connection = sqlite3.connect(cache_root() / "index.sqlite", timeout=30)
    connection.row_factory = sqlite3.Row
    if connection.execute("PRAGMA user_version").fetchone()[0] != 1:
        connection.execute("PRAGMA journal_mode=WAL")
        connection.execute("CREATE TABLE IF NOT EXISTS entries (key TEXT PRIMARY KEY, scope TEXT, size INTEGER, status TEXT, progress REAL, accessed REAL, metadata TEXT, error TEXT, owner INTEGER)")
        connection.execute("PRAGMA user_version=1")
    try:
        yield connection
        connection.commit()
    finally:
        connection.close()


def scope_key(claims, image_id):
    return hashlib.sha256(json.dumps([claims["uid"], claims["gid"], image_id, claims["store"]]).encode()).hexdigest()


def fingerprint(directory, mount):
    # Resolve the root once. Regular scandir entries cannot introduce an escape;
    # only symbolic links need another canonical-path check. This avoids hundreds
    # of expensive Docker Desktop lstat calls for every tiny plate preview.
    directory = directory.resolve(strict=True)
    mount = mount.resolve(strict=True)
    try:
        directory.relative_to(mount)
    except ValueError as exc:
        raise UnsafePath("Volume data escapes the configured mount") from exc
    digest = hashlib.sha256()
    count = 0
    def walk(folder, relative, ancestors):
        nonlocal count
        with os.scandir(folder) as iterator:
            entries = sorted(iterator, key=lambda item: item.name)
        for item in entries:
            name = relative + "/" + item.name
            if item.is_symlink():
                target = Path(item.path).resolve(strict=True)
                try:
                    target.relative_to(mount)
                except ValueError as exc:
                    raise UnsafePath("Volume data escapes the configured mount") from exc
                digest.update(f"link:{name}:{target}".encode())
                if target.is_dir():
                    if target in ancestors: raise UnsafePath("Cyclic volume data link")
                    walk(target, name, ancestors | {target})
                    continue
                stat = target.stat()
            elif item.is_dir(follow_symlinks=False):
                walk(Path(item.path), name, ancestors)
                continue
            elif item.is_file(follow_symlinks=False):
                stat = item.stat(follow_symlinks=False)
            else:
                continue
            digest.update(f"{name}:{stat.st_size}:{stat.st_mtime_ns}".encode())
            count += 1
            if count > 100_000: raise ROILimitExceeded("Too many source chunks for a bounded volume")
    walk(directory, "", {directory})
    return digest.hexdigest()


def entry(key, scope):
    with database() as db:
        row = db.execute("SELECT * FROM entries WHERE key=? AND scope=?", (key, scope)).fetchone()
        if row is None:
            raise DataNotFound("Cached volume is unavailable")
        db.execute("UPDATE entries SET accessed=? WHERE key=? AND accessed<?", (time.time(), key, time.time()-10))
        result = dict(row)
        result["metadata"] = json.loads(result["metadata"])
        return result


def _reserve(key, scope, size, metadata):
    root = cache_root()
    limit = cache_limit()
    if not limit or size > limit:
        raise ROILimitExceeded("Volume exceeds BIOMERO_ZARR_CACHE_MAX_BYTES")
    with database() as db:
        hit = db.execute("SELECT status FROM entries WHERE key=?", (key,)).fetchone()
        if hit and hit["status"] == "ready" and (root / (key + ".bin")).is_file():
            if db.execute("SELECT COALESCE(SUM(size),0) FROM entries").fetchone()[0] <= limit:
                return False
        db.execute("BEGIN IMMEDIATE")
        for abandoned in db.execute("SELECT key,owner FROM entries WHERE status IN ('queued','building')").fetchall():
            if not _owner_alive(abandoned["owner"]):
                (root / (abandoned["key"] + ".part")).unlink(missing_ok=True)
                (root / (abandoned["key"] + ".bin")).unlink(missing_ok=True)
                db.execute("DELETE FROM entries WHERE key=?", (abandoned["key"],))
        existing = db.execute("SELECT * FROM entries WHERE key=?", (key,)).fetchone()
        if existing and existing["status"] in ("queued", "building"):
            return False
        if existing and existing["status"] == "ready" and (root / (key + ".bin")).is_file():
            total = db.execute("SELECT COALESCE(SUM(size),0) FROM entries").fetchone()[0]
            for old in db.execute("SELECT key,size FROM entries WHERE status='ready' AND key<>? ORDER BY accessed",(key,)).fetchall():
                if total <= limit: break
                (root / (old["key"] + ".bin")).unlink(missing_ok=True)
                db.execute("DELETE FROM entries WHERE key=?",(old["key"],))
                total -= old["size"]
            if total > limit: raise ROILimitExceeded("Cache is busy applying its new size limit")
            return False
        db.execute("DELETE FROM entries WHERE key=?", (key,))
        # Reservations count towards the limit, including files still being built.
        total = db.execute("SELECT COALESCE(SUM(size),0) FROM entries").fetchone()[0]
        for old in db.execute("SELECT key,size FROM entries WHERE status='ready' ORDER BY accessed").fetchall():
            if total + size <= limit:
                break
            (root / (old["key"] + ".bin")).unlink(missing_ok=True)
            db.execute("DELETE FROM entries WHERE key=?", (old["key"],))
            total -= old["size"]
        if total + size > limit:
            raise ROILimitExceeded("Volume cache is busy; retry when current jobs complete")
        db.execute("INSERT INTO entries VALUES (?,?,?,?,?,?,?,?,?)", (key, scope, size, "queued", 0, time.time(), json.dumps(metadata), None, _OWNER))
    return True


def describe_volume(array_path, axes, channel, timepoint):
    array = zarr.open_array(str(array_path), mode="r")
    if len(axes) != array.ndim or "x" not in axes or "y" not in axes:
        raise InvalidROI("Invalid volume axes")
    for axis, value in (("c", channel), ("t", timepoint)):
        if value < 0 or (axis in axes and value >= array.shape[axes.index(axis)]) or (axis not in axes and value != 0):
            raise InvalidROI(f"Invalid {axis} selection")
    shape = [int(array.shape[axes.index(a)]) if a in axes else 1 for a in ("z", "y", "x")]
    dtype = np.dtype(array.dtype).newbyteorder("<")
    if dtype.name not in ("uint8","uint16","uint32","int8","int16","int32","float32","float64"):
        raise InvalidROI("Unsupported volume pixel type")
    size = math.prod(shape) * dtype.itemsize
    if size > MAX_VOLUME_BYTES:
        raise ROILimitExceeded("Select a smaller pyramid level: volume exceeds 256 MiB")
    return shape, dtype, size


def request_volume(array_path, axes, channel, timepoint, scope, source_version, *, asynchronous=True, description=None):
    shape, dtype, size = description or describe_volume(array_path, axes, channel, timepoint)
    metadata = {"shape": shape, "dtype": dtype.str, "bytes": size}
    key = hashlib.sha256(json.dumps([str(array_path), axes, channel, timepoint, source_version, scope, metadata], sort_keys=True).encode()).hexdigest()
    if _reserve(key, scope, size, metadata):
        if asynchronous:
            _pool.submit(_build, key, array_path, axes, channel, timepoint, metadata)
        else:
            _build(key, array_path, axes, channel, timepoint, metadata)
    return entry(key, scope)


def _build(key, array_path, axes, channel, timepoint, metadata):
    target = cache_root() / (key + ".bin")
    temporary = cache_root() / (key + ".part")
    output = None
    try:
        array = zarr.open_array(str(array_path), mode="r")
        shape = metadata["shape"]
        output = np.memmap(temporary, mode="w+", dtype=metadata["dtype"], shape=tuple(shape))
        chunks = getattr(array, "shards", None) or array.chunks
        chunk_depth = int(chunks[axes.index("z")]) if "z" in axes else 1
        block_depth = max(1, min(chunk_depth, 16*1024*1024 // max(1, shape[1]*shape[2]*output.dtype.itemsize)))
        for start in range(0, shape[0], block_depth):
            stop = min(shape[0], start + block_depth)
            selection = [slice(start, stop) if a == "z" else slice(None) if a in ("y", "x") else channel if a == "c" else timepoint if a == "t" else 0 for a in axes]
            block = np.asarray(array[tuple(selection)])
            remaining = [a for a in axes if a in ("z", "y", "x")]
            if "z" not in remaining:
                block = block[None]
                remaining.insert(0, "z")
            output[start:stop] = np.transpose(block, [remaining.index(a) for a in ("z", "y", "x")])
            with database() as db:
                db.execute("UPDATE entries SET status='building', progress=? WHERE key=?", (stop/shape[0], key))
        output.flush()
        del output
        output = None
        temporary.replace(target)
        with database() as db:
            db.execute("UPDATE entries SET status='ready',progress=1,accessed=? WHERE key=?", (time.time(), key))
    except Exception as exc:
        if output is not None:
            del output
        temporary.unlink(missing_ok=True)
        with database() as db:
            db.execute("UPDATE entries SET status='error',size=0,error=? WHERE key=?", (str(exc)[:500], key))

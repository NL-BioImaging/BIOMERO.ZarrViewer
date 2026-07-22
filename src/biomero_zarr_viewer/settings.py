"""OMERO custom settings and safe accessors for the viewer."""

import os

DEFAULT_SOURCE_ROOT = os.environ.get("BIOMERO_ZARR_SOURCE_ROOT", "/data")
DEFAULT_MOUNT_ROOT = os.environ.get("BIOMERO_ZARR_MOUNT_ROOT", "/data")
DEFAULT_INTERNAL_PREFIX = "/_biomero_zarr_internal/"
DEFAULT_CONTEXT_TTL_SECONDS = 900
DEFAULT_MAX_METADATA_BYTES = 4 * 1024 * 1024
DEFAULT_MAX_HIERARCHY_ENTRIES = 20_000

CUSTOM_SETTINGS_MAPPINGS = {
    "omero.web.zarr_viewer.source_root": [
        "BIOMERO_ZARR_SOURCE_ROOT",
        DEFAULT_SOURCE_ROOT,
        str,
        "Source path prefix recorded by OMERO in-place import",
    ],
    "omero.web.zarr_viewer.mount_root": [
        "BIOMERO_ZARR_MOUNT_ROOT",
        DEFAULT_MOUNT_ROOT,
        str,
        "Read-only BIOMERO data mount visible to OMERO.web and Nginx",
    ],
    "omero.web.zarr_viewer.internal_prefix": [
        "BIOMERO_ZARR_INTERNAL_PREFIX",
        DEFAULT_INTERNAL_PREFIX,
        str,
        "Nginx internal location used by X-Accel-Redirect",
    ],
    "omero.web.zarr_viewer.context_ttl_seconds": [
        "BIOMERO_ZARR_CONTEXT_TTL_SECONDS",
        DEFAULT_CONTEXT_TTL_SECONDS,
        int,
        "Lifetime of a signed Zarr read context",
    ],
    "omero.web.zarr_viewer.max_metadata_bytes": [
        "BIOMERO_ZARR_MAX_METADATA_BYTES",
        DEFAULT_MAX_METADATA_BYTES,
        int,
        "Maximum accepted size of one Zarr metadata document",
    ],
    "omero.web.zarr_viewer.max_hierarchy_entries": [
        "BIOMERO_ZARR_MAX_HIERARCHY_ENTRIES",
        DEFAULT_MAX_HIERARCHY_ENTRIES,
        int,
        "Maximum wells, fields, datasets, and labels parsed per store",
    ],
}


def _setting(name, default):
    return globals().get(name, default)


def _integer(name, default, minimum=1):
    try:
        return max(minimum, int(_setting(name, default)))
    except (TypeError, ValueError):
        return default


def source_root():
    return str(_setting("BIOMERO_ZARR_SOURCE_ROOT", DEFAULT_SOURCE_ROOT))


def mount_root():
    return str(_setting("BIOMERO_ZARR_MOUNT_ROOT", DEFAULT_MOUNT_ROOT))


def internal_prefix():
    value = str(_setting("BIOMERO_ZARR_INTERNAL_PREFIX", DEFAULT_INTERNAL_PREFIX))
    return "/" + value.strip("/") + "/"


def context_ttl_seconds():
    return _integer(
        "BIOMERO_ZARR_CONTEXT_TTL_SECONDS", DEFAULT_CONTEXT_TTL_SECONDS
    )


def max_metadata_bytes():
    return _integer("BIOMERO_ZARR_MAX_METADATA_BYTES", DEFAULT_MAX_METADATA_BYTES)


def max_hierarchy_entries():
    return _integer(
        "BIOMERO_ZARR_MAX_HIERARCHY_ENTRIES", DEFAULT_MAX_HIERARCHY_ENTRIES
    )


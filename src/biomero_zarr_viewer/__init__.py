"""Authenticated OME-Zarr viewing for BIOMERO and OMERO.web."""

from importlib.metadata import PackageNotFoundError, version

try:
    __version__ = version("biomero-zarr-viewer")
except PackageNotFoundError:
    __version__ = "0+unknown"

default_app_config = "biomero_zarr_viewer.apps.BiomeroZarrViewerConfig"

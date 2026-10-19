"""Real volume fixtures for both supported Zarr-Python generations."""
from copy import deepcopy

import zarr


def format_options(format_version):
    if int(zarr.__version__.split(".")[0]) >= 3:
        return {"zarr_format": format_version}
    return {"zarr_version": format_version}


def write_volume_group(path, values, chunks, attrs, format_version):
    group = zarr.open_group(str(path), mode="w", **format_options(format_version))
    if hasattr(group, "create_array"):
        group.create_array("0", data=values, chunks=chunks)
    else:
        group.create_dataset("0", data=values, chunks=chunks)
    if format_version == 3:
        group.attrs["ome"] = attrs
    else:
        attrs = deepcopy(attrs)
        attrs["version"] = "0.4"
        for multiscale in attrs["multiscales"]:
            multiscale["version"] = "0.4"
        group.attrs.update(attrs)
    return group

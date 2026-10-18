"""Batch small plate previews behind one authenticated request."""
import base64
import hashlib
from io import BytesIO
import json
from pathlib import Path, PurePosixPath
import re

import numpy as np
from PIL import Image
import zarr

from .errors import DataNotFound, InvalidROI, ROILimitExceeded, UnsafePath
from .settings import mount_root
from . import volume_cache


def render_preview(claims, scope, field, size, channels, z, t, safe_path):
    if not isinstance(field,str) or field.startswith("/") or ".." in PurePosixPath(field.replace("\\","/")).parts:
        raise UnsafePath("Invalid preview field")
    prefix = "" if field == "." else field.strip("/") + "/"
    group_path = None
    for name in ("zarr.json", ".zattrs"):
        try:
            group_path,_ = safe_path(claims["store"],prefix+name,claims.get("routes",[]))
            break
        except DataNotFound:
            continue
    if group_path is None:
        raise DataNotFound("Preview metadata not found")
    if group_path.stat().st_size > 4*1024*1024:
        raise ROILimitExceeded("Preview metadata too large")
    raw = group_path.read_bytes()
    meta = json.loads(raw)
    v3 = group_path.name == "zarr.json"
    if v3: meta = meta.get("attributes",{}).get("ome",{})
    multiscale = meta["multiscales"][0]
    axes = [a.get("name") if isinstance(a,dict) else a for a in multiscale["axes"]]
    datasets = multiscale["datasets"]
    def open_level(index):
        dataset = str(datasets[index]["path"])
        if PurePosixPath(dataset.replace("\\","/")).is_absolute():
            raise UnsafePath("Invalid preview dataset")
        path,_=safe_path(claims["store"],prefix+dataset+("/zarr.json" if v3 else "/.zarray"),claims.get("routes",[]))
        return zarr.open_array(str(path.parent),mode="r"),path.parent
    first,_=open_level(0)
    def scale(index,axis):
        transforms=[x["scale"][axis] for x in datasets[index].get("coordinateTransformations",[]) if x.get("type")=="scale"]
        return float(np.prod(transforms)) if transforms else 2**index
    level=0
    for index in range(len(datasets)):
        extent=max(first.shape[axes.index(a)] * scale(0,axes.index(a)) / scale(index,axes.index(a)) for a in ("y","x"))
        if extent >= size/1.25: level=index
    array,path=open_level(level)
    height,width=[int(array.shape[axes.index(a)]) for a in ("y","x")]
    if height*width > 4_194_304:
        raise ROILimitExceeded("No bounded pyramid level for this preview")
    metadata={"format":"png","width":width,"height":height,"full_width":int(first.shape[axes.index("x")]),"level":level}
    from .metadata import _axes, _datasets
    from .roi import _pixel_scale
    spacing, unit = _pixel_scale({"axes": _axes(multiscale), "datasets": _datasets(multiscale)})
    metadata.update(physical_size_x=spacing, physical_unit=unit)
    selected_t = min(first.shape[axes.index("t")]-1, t) if "t" in axes else 0
    signature = [volume_cache.fingerprint(path,Path(mount_root()),axes=axes,channel=int(channel["index"]),timepoint=selected_t)
                 for channel in channels if 0 <= int(channel["index"]) < (array.shape[axes.index("c")] if "c" in axes else 1)]
    key=hashlib.sha256(json.dumps(["preview-v1",scope,str(path),signature,hashlib.sha256(raw).hexdigest(),channels,z,t],sort_keys=True).encode()).hexdigest()
    def build():
        output=np.zeros((height,width,3),dtype=np.float32)
        for channel in channels:
            index=int(channel["index"])
            if index < 0 or ("c" in axes and index >= array.shape[axes.index("c")]) or ("c" not in axes and index):
                continue
            color=channel.get("color","#FFFFFF").lstrip("#")
            if not re.fullmatch("[0-9a-fA-F]{6}",color): raise InvalidROI("Invalid preview color")
            low,high=float(channel["low"]),float(channel["high"])
            if not np.isfinite([low,high]).all() or high<low: raise InvalidROI("Invalid preview range")
            selection=[]
            for axis,extent in zip(axes,array.shape):
                if axis in ("y","x"): selection.append(slice(None))
                elif axis=="c": selection.append(index)
                elif axis=="z": selection.append(min(extent-1,max(0,int(z*extent/first.shape[axes.index("z")]))))
                elif axis=="t": selection.append(min(extent-1,max(0,t)))
                else: selection.append(0)
            pixels=np.asarray(array[tuple(selection)],dtype=np.float32)
            if axes.index("x") < axes.index("y"): pixels=pixels.T
            intensity=np.clip((pixels-low)/max(np.finfo(float).eps,high-low),0,1)
            rgb=np.array([int(color[i:i+2],16) for i in (0,2,4)],dtype=np.float32)
            output += intensity[...,None]*rgb
        encoded=BytesIO();Image.fromarray(np.clip(output,0,255).astype(np.uint8)).save(encoded,format="PNG")
        return encoded.getvalue()
    content=volume_cache.cached_blob(key,scope,height*width*4+8192,metadata,build)
    return {"field":field,**metadata,"url":"data:image/png;base64,"+base64.b64encode(content).decode("ascii")}

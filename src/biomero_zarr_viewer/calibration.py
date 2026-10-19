"""NGFF dataset-then-group transform composition shared by renderers."""
import numpy as np

MICROMETERS = {"meter":1e6,"metre":1e6,"centimeter":1e4,"centimetre":1e4,
               "millimeter":1e3,"millimetre":1e3,"micrometer":1,"micrometre":1,
               "um":1,"µm":1,"nanometer":.001,"nanometre":.001,"nm":.001,
               "picometer":1e-6,"picometre":1e-6,"pm":1e-6}


def compose_transforms(count, transforms):
    scale, offset, found = np.ones(count), np.zeros(count), False
    for transform in transforms:
        kind = transform.get("type")
        if kind not in ("scale", "translation"):
            raise ValueError("Unsupported coordinate transformation")
        values = np.asarray(transform.get(kind, []), dtype=float)
        if values.shape != scale.shape or not np.isfinite(values).all():
            raise ValueError("Invalid coordinate transformation")
        if kind == "scale":
            if np.any(values <= 0):
                raise ValueError("Voxel sizes must be positive")
            scale *= values
            offset *= values
            found = True
        else:
            offset += values
    return scale, offset, found


def model_calibration(model):
    axes = model.get("axes", [])
    transforms = (model.get("datasets") or [{}])[0].get("coordinate_transformations", [])
    scale, offset, found = compose_transforms(len(axes), transforms)
    return {a["name"]:{"size":float(scale[i])*MICROMETERS.get(a.get("unit", ""),1),
                       "origin":float(offset[i])*MICROMETERS.get(a.get("unit", ""),1),
                       "unit":"micrometer" if a.get("unit") in MICROMETERS else a.get("unit", "px"),
                       "declared":found}
            for i,a in enumerate(axes)}

import numpy as np
import pytest

from biomero_zarr_viewer.roi import InvalidROI, _inside_outline, _outline_width


def test_circular_outlines_are_complete_and_have_requested_width():
    yy, xx = np.indices((96, 96))
    mask = (xx - 48) ** 2 + (yy - 48) ** 2 <= 30**2

    one = _inside_outline(mask, 1)
    two = _inside_outline(mask, 2)
    eight = _inside_outline(mask, 8)

    assert np.all(two[one])
    assert np.all(eight[two])
    assert two.sum() > one.sum()
    assert eight.sum() > two.sum()
    for angle in np.linspace(0, 2 * np.pi, 72, endpoint=False):
        y = round(48 + 30 * np.sin(angle))
        x = round(48 + 30 * np.cos(angle))
        assert two[y - 1 : y + 2, x - 1 : x + 2].any()


def test_outline_is_continuous_across_artificial_tile_boundaries():
    mask = np.zeros((64, 64), dtype=bool)
    mask[8:56, 8:56] = True
    outline = _inside_outline(mask, 2)

    # The synthetic tile boundaries at x/y=32 do not create gaps or seams.
    assert outline[8:10, 8:56].all()
    assert outline[54:56, 8:56].all()
    assert outline[8:56, 8:10].all()
    assert outline[8:56, 54:56].all()
    assert not outline[30:34, 30:34].any()


def test_outline_width_accepts_the_viewer_range():
    assert _outline_width(None) == 2
    assert _outline_width("20") == 20
    for value in ("0", "21", "2.5", "wide"):
        with pytest.raises(InvalidROI):
            _outline_width(value)


def test_instance_colors_opacity_adjacent_outlines_and_legacy_recipes(tmp_path, zarr_format):
    from io import BytesIO
    from PIL import Image
    from biomero_zarr_viewer.roi import render_recipe_png, _instance_outline
    from .zarr_helpers import write_volume_group
    axes = [{"name":a} for a in "cyx"]
    attrs = {"multiscales":[{"axes":axes,"datasets":[{"path":"0"}]}]}
    root = tmp_path / "colors.zarr"
    write_volume_group(root, np.zeros((1,6,8), dtype=np.uint16), (1,6,8), attrs, zarr_format)
    labels = np.ones((1,6,8), dtype=np.uint32)
    labels[:,:,4:] = 7
    write_volume_group(root / "labels/cells", labels, (1,6,8), attrs, zarr_format)
    model = {"kind":"image","initial_path":".","axes":axes,"datasets":[{"path":"0"}],"channels":[{"index":0}],"labels":[{"path":"labels/cells","axes":axes,"datasets":[{"path":"0"}]}]}
    overlay = {"labelPath":"labels/cells","mode":"fill","opacity":.7,"colorMode":"instance"}
    panel = {"field":".","roi":[0,0,8,6],"channelSettings":[],"overlays":[overlay],"scaleBar":False}
    def render(value):
        return np.asarray(Image.open(BytesIO(render_recipe_png(root, model, {"panels":[{**panel,"overlays":[value]}]}, decorate=False).content)))
    # Same golden hashes as labelIdColor in the browser; no modulo palette.
    np.testing.assert_array_equal(render(overlay)[2,2], np.rint(np.array([192,144,137])*.7))
    np.testing.assert_array_equal(render({**overlay,"color":"#FF0000"})[2,2], [178,0,0])
    np.testing.assert_array_equal(render({"labelPath":"labels/cells","mode":"fill","opacity":1})[2,2], [255,255,0])
    edges = _instance_outline(labels[0], labels[0]!=0, 1)
    assert edges[2,3] and edges[2,4] and not edges[2,2]


def test_export_calibration_composes_all_scale_transforms():
    from biomero_zarr_viewer.roi import _pixel_scale
    model = {"axes":[{"name":"x","unit":"micrometer"}],"datasets":[{"coordinate_transformations":[{"type":"scale","scale":[.2]},{"type":"translation","translation":[5]},{"type":"scale","scale":[3]}]}]}
    assert _pixel_scale(model) == (pytest.approx(.6), "micrometer")


def test_png_label_calibration_matches_translated_downsampled_movie_grid(tmp_path, zarr_format):
    import zarr
    from .zarr_helpers import format_options
    from biomero_zarr_viewer.roi import _calibrated_label_plane
    array = zarr.open_array(str(tmp_path/"labels"),mode="w",shape=(2,2),chunks=(2,2),dtype="uint32",**format_options(zarr_format))
    array[:]=[[1,2],[3,4]]
    def model(size,origin):
        return {"axes":[{"name":a,"unit":"micrometer"} for a in "yx"],"datasets":[{"coordinate_transformations":[{"type":"scale","scale":[size,size]},{"type":"translation","translation":[origin,origin]}]}]}
    pixels=_calibrated_label_plane(array,["y","x"],(0,0,6,4),1,0,0,{},model(1,0),model(2,2))
    np.testing.assert_array_equal(pixels,[[0,0,0,0,0,0],[0,0,0,0,0,0],[0,0,1,1,2,2],[0,0,1,1,2,2]])


def test_gallery_resolves_metadata_independently_for_heterogeneous_fields(configure_storage):
    import json
    from .conftest import write_v2_image, write_json
    from biomero_zarr_viewer.metadata import inspect_store
    from biomero_zarr_viewer.roi import _field_model
    _, mount = configure_storage
    root = write_v2_image(mount/"plate.zarr",plate=True)
    write_v2_image(root/"B/2/9")
    write_json(root/"B/2/.zattrs",{"well":{"images":[{"path":"9"}]}})
    attrs=json.loads((root/"B/2/9/.zattrs").read_text())
    attrs["omero"]["channels"][0]["label"]="Independent channel"
    write_json(root/"B/2/9/.zattrs",attrs)
    model=inspect_store(root)
    assert _field_model(root,model,{"field":"A/1/0"},{}) is model
    assert _field_model(root,model,{"field":"B/2/9"},{})["channels"][0]["label"]=="Independent channel"

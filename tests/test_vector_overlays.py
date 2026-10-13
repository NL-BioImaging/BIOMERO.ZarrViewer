import pytest
from PIL import Image

from biomero_zarr_viewer.errors import InvalidROI, ROILimitExceeded
from biomero_zarr_viewer.vector_overlays import draw_vectors, validate_vectors
from biomero_zarr_viewer.roi import _validate_panel


def test_vectors_render_on_matching_time_and_z_only():
    items = validate_vectors({"version": 1, "items": [
        {"kind": "point", "x": 12.25, "y": 8.5, "t": 2, "z": 0, "color": "#00E5FF"},
        {"kind": "line", "x": 10, "y": 8, "x2": 12, "y2": 8, "t": 2, "z": 0,
         "color": "#FFB300", "trail": True},
    ]})
    before = Image.new("RGB", (32, 32))
    draw_vectors(before, items, (0, 0, 32, 32), 1, 0)
    assert before.getbbox() is None
    matching = Image.new("RGB", (32, 32))
    draw_vectors(matching, items, (0, 0, 32, 32), 2, 0)
    assert matching.getbbox() is not None
    wrong_z = Image.new("RGB", (32, 32))
    draw_vectors(wrong_z, items, (0, 0, 32, 32), 2, 1)
    assert wrong_z.getbbox() is None


def test_vector_limits_and_coordinates():
    point = {"kind": "point", "x": 1, "y": 2, "t": 0, "z": 0, "color": "#ffffff"}
    with pytest.raises(ROILimitExceeded):
        validate_vectors({"version": 1, "items": [point] * 257})
    with pytest.raises(InvalidROI):
        validate_vectors({"version": 1, "items": [{**point, "x": float("nan")}]})


def test_offscreen_line_is_clipped_before_drawing():
    items = validate_vectors({"version": 1, "items": [
        {"kind": "line", "x": 0, "y": 16, "x2": 1_000_000_000, "y2": 16,
         "t": 0, "z": 0, "color": "#ffffff"}
    ]})
    image = Image.new("RGB", (32, 32))
    draw_vectors(image, items, (0, 0, 32, 32), 0, 0)
    assert image.getpixel((31, 16)) == (255, 255, 255)


def test_render_recipe_panel_accepts_bounded_vectors():
    panel = _validate_panel({"initial_path": ".", "channels": [{"index": 0}]}, {
        "field": ".", "roi": [0, 0, 32, 32], "sourceChannels": [1], "t": 0, "z": 0,
        "vectors": {"version": 1, "items": [
            {"kind": "point", "x": 12.25, "y": 8.5, "t": 0, "z": 0, "color": "#00E5FF"}
        ]},
    })
    assert panel["vectors"][0]["x"] == 12.25

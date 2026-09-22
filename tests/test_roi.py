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

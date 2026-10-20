"""Exercise the installed provider's encoder, including an all-black tile."""
import inspect
import tempfile
from pathlib import Path
from types import SimpleNamespace

import django
import numpy as np
import zarr
from django.conf import settings
from django.http import HttpRequest

settings.configure(SECRET_KEY="provider-build-check", INSTALLED_APPS=[
    "django.contrib.auth", "django.contrib.contenttypes",
])
django.setup()

from omero_web_zarr import views


class Image:
    def getSizeT(self): return 1
    def getSizeC(self): return 1
    def getSizeZ(self): return 1
    def getSizeY(self): return 4
    def getSizeX(self): return 4
    def requiresPixelsPyramid(self): return False
    def getPrimaryPixels(self):
        return SimpleNamespace(
            getPixelsType=lambda: SimpleNamespace(getValue=lambda: "uint8"),
            getTile=lambda *args: pixels,
        )


image = Image()
connection = SimpleNamespace(getObject=lambda *args: image)
for value in (0, 17):
    pixels = np.full((4, 4), value, dtype=np.uint8)
    response = inspect.unwrap(views.image_chunk)(
        HttpRequest(), iid=1, level="0", chunk="0/0", conn=connection,
    )
    assert response.status_code == 200
    metadata = inspect.unwrap(views.image_zarray)(
        HttpRequest(), iid=1, level="0", conn=connection,
    )
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        (root / ".zarray").write_bytes(metadata.content)
        (root / "0").mkdir()
        (root / "0" / "0").write_bytes(response.content)
        actual = zarr.open_array(root, mode="r")[:]
        assert np.array_equal(actual, pixels), (value, actual)
print("Installed provider: black and nonzero chunks decode correctly")


class TiledImage(Image):
    _re = SimpleNamespace(
        getTileSize=lambda: (256, 256),
        getResolutionDescriptions=lambda: [SimpleNamespace(sizeX=1290, sizeY=1040)],
    )
    def getSizeY(self): return 1040
    def getSizeX(self): return 1290
    def requiresPixelsPyramid(self): return True
    def getZoomLevelScaling(self): return {0: 1}
    def getPrimaryPixels(self):
        return SimpleNamespace(
            getPixelsType=lambda: SimpleNamespace(getValue=lambda: "uint8"),
            getTile=lambda z,c,t,tile: pixels[tile[1]:tile[1]+tile[3],tile[0]:tile[0]+tile[2]],
        )


image = TiledImage()
pixels = (np.arange(1040*1290).reshape(1040,1290) % 251).astype(np.uint8)
assert views.get_chunk_shape(image) == [1024, 1024]
with tempfile.TemporaryDirectory() as directory:
    root = Path(directory)
    response = inspect.unwrap(views.image_zarray)(HttpRequest(), iid=1, level="0", conn=connection)
    (root / ".zarray").write_bytes(response.content)
    for y,x in [(0,0),(1,1)]:
        response = inspect.unwrap(views.image_chunk)(HttpRequest(), iid=1, level="0", chunk=f"{y}/{x}", conn=connection)
        (root / str(y)).mkdir(exist_ok=True)
        (root / str(y) / str(x)).write_bytes(response.content)
    actual = zarr.open_array(root, mode="r")
    assert np.array_equal(actual[:1024,:1024],pixels[:1024,:1024])
    assert np.array_equal(actual[1024:,1024:],pixels[1024:,1024:])
print("Installed provider: tiled overview and padded edge chunks decode correctly")

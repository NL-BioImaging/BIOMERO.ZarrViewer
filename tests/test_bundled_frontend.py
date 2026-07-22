import re
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STATIC = ROOT / "src/biomero_zarr_viewer/static/biomero_zarr_viewer"


def test_production_frontend_is_bundled_and_complete():
    entry = (STATIC / "app.js").read_text(encoding="utf-8")
    assert "Frontend bundle not built" not in entry
    assert (STATIC / "app.css").stat().st_size > 1000
    imports = re.findall(r'import "\./([^"]+)"', entry)
    assert imports
    assert all((STATIC / name).is_file() for name in imports)


def test_open_with_script_is_bundled():
    script = (STATIC / "openwith-v2.js").read_text(encoding="utf-8")
    assert "setOpenWithEnabledHandler" in script
    assert "setOpenWithUrlProvider" in script
    assert '"plate"' in script


def assert_wheel_frontend(wheel):
    with zipfile.ZipFile(wheel) as archive:
        names = set(archive.namelist())
        entry_name = "biomero_zarr_viewer/static/biomero_zarr_viewer/app.js"
        assert entry_name in names
        entry = archive.read(entry_name).decode("utf-8")
        for imported in re.findall(r'import "\./([^"]+)"', entry):
            assert f"biomero_zarr_viewer/static/biomero_zarr_viewer/{imported}" in names

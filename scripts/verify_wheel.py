"""Verify that a release wheel contains one complete frontend build."""

import argparse
import re
import zipfile
from pathlib import Path, PurePosixPath


STATIC = PurePosixPath("biomero_zarr_viewer/static/biomero_zarr_viewer")
REQUIRED = {
    str(STATIC / "app.js"),
    str(STATIC / "app.css"),
    str(STATIC / "openwith-v2.js"),
    "biomero_zarr_viewer/templates/biomero_zarr_viewer/viewer.html",
}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("wheel", type=Path)
    args = parser.parse_args()
    with zipfile.ZipFile(args.wheel) as archive:
        names = set(archive.namelist())
        missing = sorted(REQUIRED - names)
        if missing:
            raise RuntimeError(f"Wheel is missing packaged assets: {missing}")

        entry = archive.read(str(STATIC / "app.js")).decode("utf-8")
        imports = re.findall(r'import\s+["\']\./([^"\']+)["\']', entry)
        for imported in imports:
            packaged = str(STATIC / imported)
            if packaged not in names:
                raise RuntimeError(f"Frontend entry references missing asset: {imported}")

        main_chunks = sorted(
            name for name in names if name.startswith(str(STATIC / "main-")) and name.endswith(".js")
        )
        if len(main_chunks) != 1:
            raise RuntimeError(f"Wheel must contain exactly one main frontend chunk: {main_chunks}")

    print(f"Verified packaged frontend in {args.wheel}")


if __name__ == "__main__":
    main()

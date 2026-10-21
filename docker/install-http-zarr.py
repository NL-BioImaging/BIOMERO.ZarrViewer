"""Install the opt-in provider from one checksum-verified fork snapshot."""

import hashlib
from pathlib import Path
import shutil
import subprocess
import sys
import urllib.request

COMMIT = "3afc184a9c3dcab090bd4a92effcf5e45ae4c864"
SHA256 = "e2d36c36376c44e11312325efa6865d8b58571b9f6cea67c8559abcd0288fd96"
URL = f"https://codeload.github.com/NL-BioImaging/omero-web-zarr/tar.gz/{COMMIT}"


def main():
    if len(sys.argv) != 2 or sys.argv[1] not in ("true", "false"):
        raise SystemExit("ENABLE_HTTP_ZARR must be true or false")
    if sys.argv[1] == "false":
        print("Optional omero-web-zarr provider disabled; no download or registration")
        return
    archive = Path("/tmp/omero-web-zarr-source.tar.gz")
    with urllib.request.urlopen(URL, timeout=60) as response:
        archive.write_bytes(response.read())
    if hashlib.sha256(archive.read_bytes()).hexdigest() != SHA256:
        raise SystemExit("The pinned omero-web-zarr archive checksum does not match")
    subprocess.run([
        sys.executable, "-m", "pip", "install", "--no-cache-dir", "--no-deps",
        "--no-build-isolation", str(archive),
    ], check=True)
    target = Path("/opt/omero/web/config/91-omero-web-zarr.omero")
    shutil.copyfile("/tmp/91-omero-web-zarr.omero", target)
    shutil.chown(target, user="omero-web", group="omero-web")
    target.chmod(0o644)
    print(f"Installed omero-web-zarr {COMMIT} with versioned in-memory encoding and grouped Z reads")


if __name__ == "__main__":
    main()

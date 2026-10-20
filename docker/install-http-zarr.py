"""Install the opt-in provider from one checksum-verified upstream snapshot."""

import hashlib
from pathlib import Path
import shutil
import subprocess
import sys
import urllib.request

COMMIT = "4e1e685dff22136abfd2626f6fd6eaf985aba368"
SHA256 = "433f1fc3844327f2ef23db837d375ea9b350f6fd417cbcf9fce708ad74dcbd30"
URL = f"https://codeload.github.com/ome/omero-web-zarr/tar.gz/{COMMIT}"


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
    print(f"Installed and enabled omero-web-zarr from upstream commit {COMMIT}")


if __name__ == "__main__":
    main()

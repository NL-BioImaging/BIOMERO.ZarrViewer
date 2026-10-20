"""Install the opt-in provider from one checksum-verified upstream snapshot."""

import hashlib
import importlib.util
from pathlib import Path
import shutil
import subprocess
import sys
import urllib.request

COMMIT = "4e1e685dff22136abfd2626f6fd6eaf985aba368"
SHA256 = "433f1fc3844327f2ef23db837d375ea9b350f6fd417cbcf9fce708ad74dcbd30"
URL = f"https://codeload.github.com/ome/omero-web-zarr/tar.gz/{COMMIT}"


def preserve_empty_chunks():
    # Zarr 3 omits fill-only chunks by default. The provider immediately reads
    # the encoded file back, so black tiles otherwise raise FileNotFoundError.
    package = importlib.util.find_spec("omero_web_zarr")
    source = Path(package.origin).parent / "views.py"
    text = source.read_text()
    original = "zarr_format=2,\n                                     chunks=chunks"
    replacement = "zarr_format=2,\n                                     config={'write_empty_chunks': True},\n                                     chunks=chunks"
    if text.count(original) != 1:
        raise SystemExit("The pinned provider's chunk encoder differs from the expected source")
    source.write_text(text.replace(original, replacement))


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
    preserve_empty_chunks()
    target = Path("/opt/omero/web/config/91-omero-web-zarr.omero")
    shutil.copyfile("/tmp/91-omero-web-zarr.omero", target)
    shutil.chown(target, user="omero-web", group="omero-web")
    target.chmod(0o644)
    print(f"Installed and enabled omero-web-zarr from upstream commit {COMMIT}, with empty-chunk compatibility fix")


if __name__ == "__main__":
    main()

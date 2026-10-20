# Ordinary OMERO images through omero-web-zarr

The optional `omero-web-zarr` app exposes ordinary OMERO-managed pixels as a
virtual OME-Zarr 0.4 hierarchy. Enable it when the viewer should also open
TIFFs and other conventional OMERO images without first exporting a Zarr store.
Physical OME-Zarr 0.4/0.5 and BIOMERO registrations keep their normal paths.

## Enable the optional provider

Install a compatible `ome/omero-web-zarr` version in the OMERO.web environment,
register the app, and explicitly enable the viewer integration:

```text
omero config append -- omero.web.apps '"omero_web_zarr"'
omero config set -- omero.web.zarr_viewer.omero_web_zarr_enabled true
```

The integration is disabled by default. Both the feature flag and the installed,
registered Django app are required. Missing `omero-web-zarr`, an unregistered
app, or a false/missing flag leaves physical stores and BIOMERO functional and
does not import the optional provider. The dependency is deliberately not added
to the viewer's required Python packages.

The upstream PyPI 0.1.1 release predates Zarr-Python 3 support. The standalone
Docker test uses upstream commit
`4e1e685dff22136abfd2626f6fd6eaf985aba368`, whose implementation explicitly writes
Zarr v2 with Zarr-Python 3. Pin and test the provider rather than assuming the
old PyPI wheel works with a current OMERO.web environment.

## Reproduce the standalone Docker installation

[`docker/Dockerfile.standalone`](https://github.com/NL-BioImaging/BIOMERO.ZarrViewer/blob/0.8.1-beta-standalone/docker/Dockerfile.standalone)
starts from the official OMERO.web 5.33.2 image pinned by digest. It installs
a supplied viewer wheel with the tested runtime additions pinned in
`docker/standalone-constraints.txt`. It needs neither a pre-existing local image
nor a manually downloaded provider archive.
These pins target Linux/amd64 containers with Python 3.12.

From the repository root, first build and validate a wheel using the
[development instructions](development.md). The following PowerShell commands
select that wheel and build the physical-store image; the optional provider is
absent by default:

```powershell
$wheel = Get-ChildItem ./dist/biomero_zarr_viewer-*.whl |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $wheel) { throw 'Build a viewer wheel in dist/ first' }

docker build --file docker/Dockerfile.standalone `
    --build-context viewer-wheel=./dist `
    --build-arg "VIEWER_WHEEL=$($wheel.Name)" `
    --tag zarrviewer-web:physical docker
```

To explicitly install and enable the optional provider, build the same recipe
with this additional build argument:

```powershell
docker build --file docker/Dockerfile.standalone `
    --build-context viewer-wheel=./dist `
    --build-arg "VIEWER_WHEEL=$($wheel.Name)" `
    --build-arg ENABLE_HTTP_ZARR=true `
    --tag zarrviewer-web:http-zarr docker
```

Docker BuildKit/buildx named contexts are required. Only `docker/` and the wheel
directory are sent to the builder, avoiding local image datasets in the
repository. Use a directory containing the exact desired wheel when multiple
releases are present, and record its SHA-256 alongside the source revision.

The opt-in build downloads upstream commit
`4e1e685dff22136abfd2626f6fd6eaf985aba368` directly from GitHub and checks archive
SHA-256 `433f1fc3844327f2ef23db837d375ea9b350f6fd417cbcf9fce708ad74dcbd30`
before installation. A changed archive fails the build. Only that build copies
`docker/91-omero-web-zarr.omero` into the startup configuration and enables the
feature. The default build neither downloads nor registers `omero-web-zarr`;
the existing deployment Dockerfile and required viewer dependencies are unchanged.
Provider packaging uses the build tools in the pinned base image rather than
downloading a fresh, unpinned build environment.

The installer applies a compatibility fix to that pinned provider:
its temporary Zarr chunk encoder explicitly sets `write_empty_chunks=True`.
Zarr-Python 3 otherwise omits entirely black chunks, which makes the provider's
immediate file read fail with `FileNotFoundError`. The installer checks the
expected source fragment before changing it and fails if it differs. No pixel
values or metadata are changed. This patch lives in the viewer's Docker
installer; it has not been published as an upstream omero-web-zarr commit.

For pyramidal images the installer also raises the minimum HTTP chunk width
and height to 1024 pixels. This reduces authenticated OMERO pixel-reader calls
when viewing a large tilescan. Edge chunks retain the provider's zero padding;
the viewer still checks its 32 MiB chunk limit. The browser allows at most six
concurrent virtual-store requests. These settings leave physical Zarr stores
unchanged.

The viewer also handles native pyramids that skip binary resolution steps,
such as Aperio levels at 1x, 4x and 16x downsampling. It selects a native level
for the current zoom and scales its tiled rendering by the actual X/Y shape
ratios, including the navigator. This preserves image bounds and physical
calibration without exporting or resampling the source image.

Provider calls also close rendering engines created by their temporary Image
wrappers, including failed reads. This prevents repeated virtual tile requests
from retaining pixel readers in the OMERO session until it expires.

Use the resulting image for your OMERO.web service with `OMEROHOST` pointing to
your OMERO.server. Physical stores still need the shared read-only `/data` mount
and the [authenticated Nginx configuration](installation.md). The recipe builds
only a web image; it does not start services, attach existing data volumes or
reconfigure another OMERO stack.

## Data and authentication

The viewer serves the provider's Zarr representation through its own signed,
authenticated data endpoints. Only an already readable Image can select this
fallback. The browser stays on the same origin and no arbitrary remote URL,
credential forwarding, or public proxy is accepted. The source type is part of
the signed read context; every virtual read checks the Image and current source
again. Existing physical and BIOMERO registrations take precedence, including
invalid-manifest errors and missing physical stores.

Provider views run with the current authenticated OMERO connection, using the
provider's HTTP response implementation in-process. This avoids an HTTP request
back into the same Gunicorn service and potential worker exhaustion. Opening
capabilities fetches JSON only. Chunks are generated on demand, with their keys,
dimensions, pyramid level and decoded size checked before generation. A virtual
chunk is limited to 32 MiB. There is no persistent shared pixel cache.

The adapter derives physical scales from OMERO calibration and actual array
shapes because upstream relative pyramid scales alone do not express absolute
physical spacing. Missing calibration remains uncalibrated; no physical value
is invented.

The virtual source supports image viewing, client-side projections and Viv 3D,
and server-side ROI/PNG/SVG rendering through an on-demand read-only Zarr store.
The filesystem-only Neuroglancer and plate-preview/volume cache endpoints are
not advertised for virtual sources. Their behavior for physical stores is
unchanged. This integration does not expose OMERO ROIs as NGFF label arrays.

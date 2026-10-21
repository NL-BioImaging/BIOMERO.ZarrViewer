# Ordinary OMERO images through omero-web-zarr

The optional `omero-web-zarr` app exposes ordinary OMERO-managed pixels as a
virtual OME-Zarr 0.4 hierarchy. Enable it when the viewer should also open
TIFFs and other conventional OMERO images without first exporting a Zarr store.
Physical OME-Zarr 0.4/0.5 and BIOMERO registrations keep their normal paths.

## Optional virtual OME-Zarr 0.5 (without sharding)

The provider also exposes `/zarr/v0.5/image/<ID>.zarr/zarr.json`, array
`<level>/zarr.json` documents and `<level>/c/<chunk-coordinates>` keys.
The existing 0.3/0.4 routes are retained. Version 0.5 uses Zarr v3, an
`attributes.ome` namespace, dimension names and a bytes/little-endian + Zstd
level-1 codec chain. It does not use sharding. Both formats share the same
pixel reader, native resolution levels and chunk shapes.

ZarrViewer 0.8.1b4 or later still defaults to virtual **0.4**. With the optional
provider installed/enabled and Zarr-Python 3, opt into virtual **0.5** with:

```text
omero config set -- omero.web.zarr_viewer.http_ngff_version 0.5
```

Restart OMERO.web after changing the setting. Use `0.4` to restore the default.
The setting changes only ordinary virtual HTTP images, not physical OME-Zarr
stores, BIOMERO registrations or their priority. A provider without 0.5 support
produces a clear error for virtual 0.5 rather than silently changing its format;
physical stores and deployments without the optional provider still work.

Metadata caches and signed source identities distinguish the two formats.
The browser shares unsharded 0.5 chunks using the same bounded cache and request
queue as 0.4. The server-side Python reader supports both for ROI rendering and
metadata inspection. A format change alone does not imply faster loading:
compare the same pixels/chunks/compression on the same host and distinguish
pixel-transfer timing from complete browser rendering.

## Enable the optional provider

Install the performance fork [`NL-BioImaging/omero-web-zarr`](https://github.com/NL-BioImaging/omero-web-zarr)
or a compatible upstream version in the OMERO.web environment,
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
Docker recipe uses the NL-BioImaging performance fork, based on upstream commit
`4e1e685dff22136abfd2626f6fd6eaf985aba368`, and explicitly writes Zarr v2 chunks
compatible with Zarr-Python 3. Pin and test the provider rather than assuming
the old PyPI wheel works with a current OMERO.web environment.

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

The opt-in build downloads NL-BioImaging fork commit
`3afc184a9c3dcab090bd4a92effcf5e45ae4c864` directly from GitHub and checks archive
SHA-256 `e2d36c36376c44e11312325efa6865d8b58571b9f6cea67c8559abcd0288fd96`
before installation. A changed archive fails the build. Only that build copies
`docker/91-omero-web-zarr.omero` into the startup configuration and enables the
feature. The default build neither downloads nor registers `omero-web-zarr`;
the existing deployment Dockerfile and required viewer dependencies are unchanged.
Provider packaging uses the build tools in the pinned base image rather than
downloading a fresh, unpinned build environment.

The installer installs the checksum-verified fork source directly, including
its performance improvements. Its upstream provenance and exact changes are described in
[`docker/provider-README.md`](https://github.com/NL-BioImaging/BIOMERO.ZarrViewer/blob/0.8.1-beta-standalone/docker/provider-README.md).
The provider source and its own regression workflow live in the separate
[fork repository](https://github.com/NL-BioImaging/omero-web-zarr).
This is not a newly published upstream or PyPI release.

The variant encodes lossless Zarr chunks in memory, including all-zero chunks.
It uses one explicitly closed native pixel reader per chunk, with tiles up to
1024 pixels and groups of up to eight Z planes (a 2 MiB target). The viewer still
enforces its 32 MiB chunk limit. Physical Zarr chunk layouts are unchanged.

Virtual metadata JSON is cached for at most 60 seconds, scoped to the OMERO
session, image/pixels IDs, dimensions, group and provider layout. Every incoming
data request still checks image access and the signed source. No server pixel
cache or connection is retained. The browser shares encoded virtual chunks
within one image binding, with a 32 MiB budget and 60-second lifetime; changes
of binding clear that cache. Physical stores retain their existing read path.

HTTP images initially use OMERO's channel ranges and render before native
statistics finish. Statistics continue in the background. MIP, mean and minimum
projections show progress and share their bounded 64 MiB projection cache
between the main view and navigator. The existing initial contrast sampling
for physical BIOMERO/OME-Zarr sources remains unchanged.

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

The virtual source supports image viewing, client-side projections, Viv 3D,
Neuroglancer 3D (the default), and server-side ROI/PNG/SVG rendering through an
on-demand read-only Zarr store. Neuroglancer supports both HTTP OME-Zarr 0.4
and 0.5 without a full-volume export: authenticated requests decode blocks aligned
with the virtual source chunks into its precomputed volume transport. Decoded
responses are limited to 8 MiB, including any conversion to float32; oversized
source blocks are subdivided. Physical sources and labels retain their existing
streaming layout. Image access
and the signed source layout are checked on every request. As for physical
sources, enable the volume cache setting to advertise Neuroglancer; virtual
intensity blocks themselves are streamed without writing a display cache.
The plate-preview/volume cache endpoints remain filesystem-only. Physical
OME-Zarr and BIOMERO label rendering retain their existing paths. This
integration does not expose OMERO ROIs as NGFF label arrays.

### Neuroglancer startup and source-aligned blocks

Viewer 0.8.1b8 aligns virtual intensity requests with the provider's spatial
chunk shape. The previous fixed 64³ grid repeatedly decoded the same wide TIFF
chunks. For the calibrated 370 × 370 × 36, three-channel confocal sample,
Neuroglancer now requests 370 × 370 × 8 blocks (with a shorter final Z block):
15 browser requests instead of 108. Neither pixels, resolution quality,
calibration nor the provider implementation change. The source layout is part
of the viewer context identity, and older contexts retain the 64³ fallback.

This uses the ordinary, unsharded
[Neuroglancer precomputed chunk representation](https://github.com/google/neuroglancer/blob/master/src/datasource/precomputed/volume.md#chunked-representation-of-volume-data).
Responses remain authenticated and private. No full-volume export or shared
pixel cache is introduced. The 8 MiB decoded-response limit bounds larger
layouts; source chunks retain the existing input-size limits.

Local Windows/Chrome measurements on 21 October 2026 used three fresh browser
contexts per case, a 1440 × 1000 viewport, warm server filesystem caches, and
the same image and container limits before/after. Time runs from viewer
navigation after login until the application reports **3D image and labels
ready**, including requests and rendering. The baseline is viewer 0.8.1b7
(`0241a8c`); the optimized version is 0.8.1b8.

| Stack / virtual format | Median before | Median after | Requests before → after |
| --- | ---: | ---: | ---: |
| Standalone / 0.5 | 20.77 s | 3.00 s | 108 → 15 |
| BIOMERO / 0.4 | 30.84 s | 4.43 s | 108 → 15 |

These are local desktop measurements, not a cross-format comparison: the
standalone and BIOMERO stacks have different service/container settings.
An additional comparison on the **same standalone stack**, changing only the
HTTP format (three trials of 0.4 followed by three of 0.5), gave medians of
3.10 s for 0.4 and 2.89 s for 0.5; both used 15 requests. The ranges overlap
(2.90–3.39 s and 2.86–3.12 s). This small desktop sample does not justify a
default change: 0.4 remains the compatible default, while 0.5 stays opt-in and
requires the newer provider and Zarr-Python 3. The substantial startup gain is
available to both formats. [Individual measurements](assets/neuroglancer-startup-20261021.json)
include the trial values and validation summary.

All three complete decoded channel volumes were separately compared with the
original OMERO pixels, including edge blocks; calibration was unchanged.
Physical 0.4/0.5, a physical 3D image and a BIOMERO shallow result with three
label layers were also checked. Unit tests verify that a non-cubic HTTP grid
reads each provider chunk once, retains T/C selections and preserves edge
pixels, as well as bounding converted response sizes.

To repeat the browser timing, install the frontend dependencies and Chrome,
set `OMERO_PASSWORD` (and optionally `OMERO_USER`, default `root`) in the
environment, then run from the repository root:

```powershell
node scripts/benchmark_neuroglancer.mjs http://localhost:4080 20352 3 timing.json
```

Use an image ID from your own instance. The script creates a fresh browser
context for each trial, asserts Neuroglancer is selected and has finished
loading, and fails on JavaScript or Neuroglancer request errors. Its JSON
report contains timing/request counts, never credentials or session tokens.

## Standalone comparison of virtual 0.4 and 0.5

Local Docker measurements on 21 October 2026 used viewer 0.8.1b4 and
provider `0.1.2.dev0+nlbi.2`, with the same OMERO.server, web image, chunk
shapes, lossless Zstd level 1 and three concurrent HTTP readers. Each image
had one warmup and five measured trials per format, with a warm source
filesystem cache. The 0.4 block ran before 0.5; this is not a randomized
performance study. No BIOMERO components were installed in that stack.

| Pixel download case | Requests | 0.4 median | 0.5 median |
|---|---:|---:|---:|
| SVS overview (all coarse-level pixels) | 27 | 1.518 s | 1.511 s |
| SVS native resolution (six sampled tiles) | 6 | 0.337 s | 0.305 s |
| Confocal stack pixels for the MIP | 15 | 0.803 s | 0.762 s |

These timings exclude capability/metadata setup, browser painting and MIP
calculation. The MIP row measures downloading all 36 Z slices in three
channels (15 grouped chunks), not the complete UI operation. Small timing
differences should not be interpreted as a guaranteed format speedup.

The SVS was CMU-1.svs (46000 x 32914 RGB, 0.499 micrometre pixels),
with native pyramid levels at 1x/4x/16x. Its complete coarsest level
and six native-resolution tiles had identical decoded pixel hashes.
The confocal TIFF was 370 x 370 x 36 Z in three channels, calibrated at
0.1979036070900946 micrometres XY and 0.5 micrometres Z. Both formats
produced MIP SHA-256
`f2f51aa8c556325e70619c558dd90055272a4d40976853a50076aee9b66c86e7`.
The compressed pixel byte counts, request counts and calibration also matched.

[Raw trials and timings](assets/http-ngff-comparison-20261021.json) record
the implementation revisions, hashes, chunk shapes and all warmup/measured
runs. Physical 0.4/0.5 registrations were separately checked with the
entire small test image: both still matched the original pixel hash under
either HTTP setting. The existing BIOMERO stack was not updated.

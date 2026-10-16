# Configuration and security

## Security model

1. OMERO.web supplies an authenticated OMERO connection and active group.
2. The backend resolves the selected readable Image, Plate, or Well entry to
   one store. Wells resolve through a readable WellSample Image.
3. Canonical path checks reject traversal, ambiguous roots, and symlink
   escapes outside the configured mount.
4. The capability endpoint reads only bounded JSON metadata and returns a
   short-lived signed context bound to the OMERO user, group, Image, store,
   and read operation.
5. The frontend attaches that context as `X-OMERO-Zarr-Context`. An expired
   context is refreshed and retried once.
6. Django validates each key and returns `X-Accel-Redirect`; Nginx reads the
   file body.

The URL contains viewer state and an OMERO object ID, but no signed storage
context or filesystem path. Opening the URL still requires a valid OMERO
session and permission to read the selected object.

Optional limits:

```bash
omero config set omero.web.zarr_viewer.context_ttl_seconds 900
omero config set omero.web.zarr_viewer.max_metadata_bytes 4194304
omero config set omero.web.zarr_viewer.max_hierarchy_entries 20000
omero config set omero.web.zarr_viewer.roi_max_width 2048
omero config set omero.web.zarr_viewer.roi_max_height 2048
omero config set omero.web.zarr_viewer.roi_max_channels 4
omero config set omero.web.zarr_viewer.roi_max_output_bytes 33554432
omero config set omero.web.zarr_viewer.render_max_panels 25
omero config set omero.web.zarr_viewer.render_max_overlays 8
omero config set omero.web.zarr_viewer.render_max_aggregate_pixels 25000000
```

## Shared volume and plate-preview cache

Set these environment variables on the OMERO.web service and mount a persistent,
writable directory at the cache path:

```yaml
environment:
  BIOMERO_ZARR_CACHE_DIR: /var/cache/biomero-zarr
  BIOMERO_ZARR_CACHE_MAX_BYTES: "50000000000" # 50 GB of cached data
```

The default limit is 20,000,000,000 bytes (20 GB) when the environment variable is
absent. Set the desired deployment limit explicitly, such as the 50 GB example
above. Zero disables the cached endpoints;
existing cached files are retained. SQLite keeps a small additional index.
Least-recently-used completed entries are evicted to make room. Concurrent jobs
reserve their eventual size, duplicate requests share the same job, and writes
are published atomically. Cache access requires an authenticated OMERO session
and its signed user/group/image context. Cache entries are scoped to that
context and fingerprint the source metadata and chunk file sizes/modification
times. Reload the viewer after changing a source store in place.

Volumes are packed once per source, level, channel and time point, then reused
for MIP/mean/min projections and 3D. The viewer displays preparation/download
progress and retains up to 256 MiB of decoded volume data in browser memory.
The server's per-volume safety limit is also 256 MiB; a large disk cache does
not override GPU or per-volume memory limits. Larger 2D projections continue
to use the bounded tile-based path. 3D starts at the finest safe level below a
64 MiB initial-load budget; higher safe levels remain selectable. The selected
NGFF level is used directly without additional implicit Z subsampling.

Plate/Well previews are rendered in batches (up to 16 small fields per request)
and cached as display PNGs. Source resolution still follows zoom and only
visible fields request detail. Cache keys include channel colors/ranges, T/Z,
source identity and source fingerprints. Small navigator images are retained
separately so visiting high-resolution wells does not inflate the minimap's
memory usage. Preview requests support up to eight visible channels.

A new plate overview defaults to the middle field (field 4 for nine fields).
The `plateField` URL parameter preserves a chosen field index. Plate and Well
views load individual field previews at a resolution appropriate to the zoom;
no whole-plate mosaic or additional plate pyramid is generated.

## Large plates and request limits

Shallow result manifests (`.biomero-shallow.json`) accept up to **100 MiB**.
An invalid or oversized manifest produces an immediate `invalid_shallow_manifest`
error instead of repeating the same lookup for every field in a Plate or Well.
The separate 4 MiB limit for individual NGFF metadata documents is unchanged.
Large composite plates also require sufficient HTTP request-header limits:
their signed context contains the declared label routes. For a plate with
2,844 fields and 14,220 labels, the context is approximately 119 KB. Configure
Nginx with `large_client_header_buffers 4 128k;` and Gunicorn with
`--limit-request-field_size 131072` (for example through `GUNICORN_CMD_ARGS`).
These limits must be set at every reverse proxy in the deployment; routing and
user, group, image, and token-expiry checks still apply.


## Neuroglancer volumes and segmentation surfaces

Neuroglancer requests use the current OMERO session and a user/group/image-bound
read context. No source credentials or pixel data are sent to an external viewer.
Surfaces are generated on demand from the selected label pyramid level and
stored in the existing quota-managed display cache; source arrays are read-only.
Label surfaces require calibrated XYZ axes, non-negative integer object IDs,
at most 32 million voxels and 2048 objects per label layer, and bounded surface
complexity. Select a coarser quality if a limit is reached. Signed integer labels
and 64-bit IDs are supported without converting IDs through floating point.

The 3D view requires WebGL 2 and loads the selected multiscale volume
into browser and GPU memory, so it is intentionally bounded rather than an
out-of-core renderer. Changing the time point, quality level, selected HCS
field, or visible channel set cancels and reloads the volume. Well and Plate
overview modes remain 2D.

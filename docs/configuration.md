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

For MIP/mean/min projections and the Viv 3D renderer, volumes are packed once
per source, level, channel and time point and reused. Neuroglancer streams source
chunks instead and does not require a packed volume. The viewer displays preparation/download
progress and retains up to 200 MiB of decoded volume data in browser memory.
Volume, Slice and Orthogonal use the same 200 MiB level limit across visible
intensity channels in both engines; each section reuses the selected volume.
The server's per-volume safety limit is also 200 MiB; a large disk cache does
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

Source selection and derived-cache validation are scoped to the selected channel
and timepoint. Validation skips unrelated temporal/channel chunk subtrees in Zarr v2
and v3, including sharded arrays. A stored chunk/shard spanning several times
must still be decoded as a unit, but only the requested timepoint is packed or
projected. Changing time cancels the previous browser preparation request.

Intensity ray sampling is derived from each selected volume's physical diagonal
and smallest voxel spacing, targeting two samples per voxel (256–8192 samples
per ray). This avoids the gaps in thin neurites produced by Neuroglancer's
64-sample default. Intensity shaders use trilinear interpolation. Segmentation
meshes and their object IDs are unaffected; no source pixels or calibration
metadata are altered. Very large or extremely anisotropic volumes can reach
the sampling ceiling; a coarser quality level reduces their rendering cost.

Neuroglancer requests use the current OMERO session and a user/group/image-bound
read context. No source credentials or pixel data are sent to an external viewer.
Surfaces are generated in background jobs from the selected label pyramid level
and stored in the quota-managed display cache; source arrays are read-only.
The first intensity chunks can render while labels are indexed and surfaces are
prepared. A cached, chunk-aligned label index records object bounding boxes;
meshing reads the selected object's crop rather than scanning the whole volume
again for every object. Ready meshes become visible progressively.

The existing two-thread cache executor runs these jobs per Gunicorn process.
`BIOMERO_ZARR_MAX_PENDING_JOBS` bounds the shared number of queued/building cache
jobs (default 8, clamped to 1–64) for these derived jobs. Duplicate requests
coalesce across processes. Deferred jobs are retried by the preparation poll;
failed jobs are retained until eviction or a changed source/quality produces a
new key. Oversized surfaces are reported without blocking intensity rendering.
Keep one cache directory per container: owner recovery uses process IDs and
process birth times within the container's PID namespace.

Compatible Zarr v2 intensity arrays use native compressed chunk streaming through
Nginx and decode in Neuroglancer's browser worker. This supports C-order ZYX
spatial axes, singleton chunks in other dimensions, no filters, and raw/Blosc/
gzip/zlib compression, with a maximum decoded native chunk size of 8 MiB.
Virtual 3D metadata selects one channel/timepoint without rewriting source data.
Zarr v3, float64 intensities and other supported layouts use bounded, on-demand Python chunk decoding
and the existing precomputed protocol. Neither path creates a full-volume file.
Source decoded chunks are limited to 64 MiB; rechunk or select another pyramid
level if needed. Authorization, group changes, signed-context renewal, trusted
label routes and mount containment remain enforced for each data request.

Only explicit highlighted selections of at most three small objects use browser
mesh previews. Each padded object crop is limited to 262,144 voxels and the
generated mesh to 8 MiB. Marching tetrahedra runs in Neuroglancer's chunk worker,
preserves object IDs/calibration and retains results only for that loaded source.
These interactive previews may differ slightly from server marching-cubes
surfaces; they do not change segmentation pixels or measurements. Larger objects
and ordinary whole-layer viewing use the server background mesh cache.
Label surfaces require calibrated XYZ axes, non-negative integer object IDs,
at most 32 million voxels and 2048 objects per label layer, and bounded surface
complexity. Select a coarser quality if a limit is reached. Signed integer labels
and 64-bit IDs are supported without converting IDs through floating point.

The 3D view requires WebGL 2 and loads the selected multiscale volume
into browser and GPU memory, so it is intentionally bounded rather than an
out-of-core renderer. Changing the time point, quality level, selected HCS
field, or visible channel set cancels and reloads the volume. Well and Plate
overview modes remain 2D.

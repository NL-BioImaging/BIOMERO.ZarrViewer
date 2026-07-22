# BIOMERO OME-Zarr Viewer

BIOMERO OME-Zarr Viewer is a read-only OMERO.web application for directly
viewing BIOMERO in-place OME-Zarr images. It uses Django for OMERO permission
checks and signed access contexts, Nginx for chunk delivery, and a focused
React/Viv/Zarrita interface for multichannel images, integer segmentation
labels, deep links, and HCS plate navigation.

The viewer uses a single right-hand control panel. Image view options are
grouped into Channels and Labels tabs; each channel has a dual-ended display
range, sampled histogram, and Auto/Fit/Hist controls. Plate stores additionally
provide Field, Well, and Plate navigation views while preserving compatible
display settings between fields.

Supported stores:

- OME-Zarr 0.4 on Zarr v2;
- OME-Zarr 0.5 on Zarr v3;
- multiscale images and HCS plates opened from a readable OMERO Image;
- multiple metadata-declared integer label images.

The application does not convert ordinary OMERO pixels to Zarr. It does not
load measurements, OMERO.tables, CSV data, expressions, embeddings, or edit
annotations.

## Architecture and security

1. `Open With` supplies only an OMERO Image ID.
2. Django loads that Image through the current OMERO connection and resolves
   its Fileset/OriginalFiles to a `.zarr` ancestor. For BIOMERO imports that do
   not retain that Fileset link, it reads the structured `biomero.import`
   provenance annotation from the readable Image/Dataset/Plate ancestry.
3. The recorded path is translated from the configured source root into the
   configured read-only mount. Canonical containment is checked after symlink
   resolution.
4. The capability endpoint reads only bounded JSON metadata and returns a
   normalized viewer model plus a short-lived, signed read context bound to
   OMERO user, active group, image, operation, and store root.
5. Zarrita attaches the context as `X-OMERO-Zarr-Context` to each request. On
   expiry it refreshes the capability once and retries once.
6. Django validates the context and requested key, then returns
   `X-Accel-Redirect`. Nginx reads the file; Python never reads chunk bodies.

The Nginx storage location is `internal`, the volume should be mounted
read-only, and neither capabilities nor errors expose filesystem paths. Signed
contexts supplement the active OMERO.web session; they are not a replacement
for OMERO authentication.

## Installation

Build the frontend and wheel:

```bash
cd frontend
npm ci
npm test
cd ..
python scripts/build_frontend.py --skip-install
python -m build --wheel
python scripts/verify_wheel.py dist/biomero_zarr_viewer-*.whl
pip install dist/biomero_zarr_viewer-*.whl
```

Copy `docker/90-biomero-zarr-viewer.omero` into the OMERO.web startup
configuration directory, or apply the equivalent values manually:

```bash
omero config append omero.web.apps '"biomero_zarr_viewer"'
omero config append omero.web.open_with \
  '["biomero_zarr_viewer", "biomero_zarr_viewer_index", {"supported_objects":["image","plate"], "label":"OME-Zarr Viewer", "target":"_blank", "script_url":"biomero_zarr_viewer/openwith-v2.js"}]'
```

Collect static files and restart OMERO.web. The wheel includes the compiled
frontend; Node.js is not required on the production server.

On the Windows development host, a running Docker Compose service named
`omeroweb` can be managed with:

```powershell
.\scripts\manage-docker-plugin.ps1 status
.\scripts\manage-docker-plugin.ps1 install
.\scripts\manage-docker-plugin.ps1 update -SkipFrontend
.\scripts\manage-docker-plugin.ps1 remove
```

Container replacement removes an interactively installed wheel. Incorporate
the wheel and `.omero` file into a derived image for persistent deployment.
`docker/Dockerfile.omeroweb` provides that image layer; pass the exact wheel
path as `VIEWER_WHEEL` and the deployment's OMERO.web image as
`OMERO_WEB_IMAGE`.

## Storage and Nginx configuration

Configure the path recorded in OMERO separately from the path visible inside
OMERO.web/Nginx. For example, an in-place file recorded as
`/archive/alice/image.zarr/.zattrs` can be served from a read-only mount at
`/data/alice/image.zarr/.zattrs`:

```bash
omero config set omero.web.zarr_viewer.source_root /archive
omero config set omero.web.zarr_viewer.mount_root /data
omero config set omero.web.zarr_viewer.internal_prefix /_biomero_zarr_internal/
```

Include `docker/nginx-biomero-zarr.conf` inside the Nginx server block that
serves OMERO.web. Its `alias` must equal the configured mount root, and the
internal location prefix must equal `internal_prefix`. If Nginx and OMERO.web
are separate services, mount the same source read-only into both containers.
For a local Compose deployment where Nginx owns the complete configuration,
use `docker/nginx-local-proxy.conf`: remove the host `ports` mapping from
`omeroweb`, expose port 4080 only to the Compose network, and add an Nginx
service that publishes `4080:4080`, mounts this file at
`/etc/nginx/nginx.conf:ro`, and mounts the Zarr source at `/data:ro`.
Opening the app through Gunicorn directly can load capabilities but cannot
deliver Zarr metadata or chunks: `X-Accel-Redirect` is intentionally handled
only by Nginx, and Django never streams file bodies as a fallback.

The local proxy has two useful smoke checks: an authenticated viewer request
must produce successful `/data/images/...` responses, while a direct request
to `/_biomero_zarr_internal/...` must return 404.

Additional limits:

```bash
omero config set omero.web.zarr_viewer.context_ttl_seconds 900
omero config set omero.web.zarr_viewer.max_metadata_bytes 4194304
omero config set omero.web.zarr_viewer.max_hierarchy_entries 20000
```

The Open With script checks the capability endpoint asynchronously. This is
necessary because BIOMERO-imported OMERO Images often use an NGFF field or
image name without retaining the `.ome.zarr` suffix. Backend Fileset,
provenance, path, permission, and metadata validation remains authoritative.

## API

All routes are relative to the OMERO.web app mount
(`/biomero_zarr_viewer/` in a standard installation).

### Viewer

```text
GET /?image=<omero-image-id>
```

### Capability

```text
GET /api/images/<id>/capabilities/
```

A successful response contains schema version 1, image identity, signed store
context, NGFF/Zarr versions, axes, channels, labels, initial image path, and an
optional normalized plate model. Unsupported or malformed stores use stable
JSON error codes and HTTP 422. Unreadable images return 404.

### Data

```text
GET|HEAD /data/images/<id>/<zarr-key>
X-OMERO-Zarr-Context: <signed context>
```

Successful responses contain `X-Accel-Redirect`, length, type, and private
cache headers with an empty Django body.

## Viewer behavior

- multiscale pan and zoom with additive multichannel rendering;
- channel visibility, color, contrast, Z, and T controls, with bounded
  percentile-based automatic contrast from the coarsest multiscale level;
- independently visible/reordered label layers with opacity, nearest-neighbor
  sampling, fill/outline modes, and transparent label zero;
- deterministic GPU colors produced from integer IDs, with optional fixed
  layer colors and selected-object highlighting;
- exact hover/click label lookup through Zarrita without an ID-sized color
  table;
- HCS well grid and field selection for plate-backed stores;
- direct Open With support for either an OMERO Image or Plate;
- versioned links containing viewport, planes, channels, labels, and field.

## Development and tests

```bash
python -m pip install -e ".[test]"
python -m pytest

cd frontend
npm ci
npm test
npm run typecheck
npm run build
```

The Python tests create isolated 0.4/v2 and 0.5/v3 image, label, and sparse
plate stores. They cover metadata normalization, Fileset resolution, token
binding, traversal, symlink containment where supported, and body-free
X-Accel responses. Frontend tests cover deep-link sanitization, label ordering,
deterministic colors, plate-relative label paths, and one-time context refresh.

Before a release, execute the live matrix in
`docs/compatibility-spike.md` against the target OMERO deployment and use an
authenticated session cookie for the smoke test:

```powershell
.\scripts\smoke-test.ps1 -BaseUrl https://omero.example.org -ImageId 123 -Cookie "sessionid=..."
```

## Relationship to omero-web-zarr

[`ome/omero-web-zarr`](https://github.com/ome/omero-web-zarr) exposes ordinary
OMERO-managed pixels as a virtual OME-Zarr v0.3/v0.4 hierarchy. Its chunk view
reads pixels through OMERO, serializes each requested chunk in Python, and
returns the bytes from Django. That is a useful compatibility endpoint for
clients that need a Zarr-shaped API over conventional OMERO images.

This viewer solves a different problem: BIOMERO already owns a physical
OME-Zarr v0.4/v2 or v0.5/v3 store, including labels and plate metadata. It
authorizes that store through OMERO and lets Nginx serve its existing bytes.
Using `omero-web-zarr` here would discard the in-place-store advantage, omit
v0.5/v3, labels, and HCS navigation, and violate the requirement that Python
never reads chunk bodies. It is therefore not a production dependency. It
could later be offered as a separate fallback for ordinary OMERO pixel images,
which are explicitly outside this viewer's current scope.

## License

GNU Affero General Public License v3.0 or later. See `LICENSE`.

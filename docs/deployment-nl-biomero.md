# Deploy with `NL-BIOMERO`

[`NL-BioImaging/NL-BIOMERO`](https://github.com/NL-BioImaging/NL-BIOMERO)
has two relevant Compose paths:

- the default Windows/development stack exposes OMERO.web directly on port
  4080 and does not start Nginx;
- `deployment_scenarios/docker-compose-for-ubuntu-with-SSL.yml` includes an
  `nginx:alpine` service for a production-style HTTPS deployment.

The current viewer data backend requires Nginx to process
`X-Accel-Redirect`. Django authorizes every metadata or chunk request but
deliberately returns an empty body; Nginx reads the approved file from the
in-place store. This is also required for a single-user development install.
Development does not require TLS or the Ubuntu SSL scenario: use the small
HTTP-only overlay below.

## 1. Build the viewer OMERO.web image

Build and verify the wheel from `BIOMERO.ZarrViewer`:

```powershell
python -m pip install build
python scripts/build_frontend.py
python -m build --wheel
python scripts/verify_wheel.py dist/biomero_zarr_viewer-*.whl
```

Start the base NL-BIOMERO OMERO.web service once, then layer the wheel onto its
current image:

```powershell
.\scripts\build-docker-image.ps1 `
  -Container nl-biomero-omeroweb-1 `
  -Tag local/nl-biomero-omeroweb-zarr:0.5.0
```

Omit `-Container` when exactly one Compose service named `omeroweb` is
running. The script preserves the other plugins baked into the selected base
image and refuses a base image that would discard container-only plugin
configuration.

If the selected NL-BIOMERO branch already installs the released viewer through
its `BIOMERO_ZARR_VIEWER_VERSION` build argument, set that value in
NL-BIOMERO's `.env`, rebuild `omeroweb`, and use the resulting image instead of
building a second derived image.

The resulting image includes the Python package, compiled frontend, Open With
registration, `/data` viewer defaults, and the plugins already present in its
base image.

## 2. Windows development: add the HTTP-only proxy

The supplied
[`deploy/nl-biomero/docker-compose-windows-dev.yml`](../deploy/nl-biomero/docker-compose-windows-dev.yml)
adds one lightweight `nginx:alpine` container. It serves HTTP on port 4081,
proxies ordinary requests to `omeroweb:4080`, and mounts the same in-place
store read-only at `/data`.

These commands assume sibling checkouts named `NL-BIOMERO` and
`OMERO.ZarrViewer`:

```text
<parent>/
  NL-BIOMERO/
  OMERO.ZarrViewer/
```

From `NL-BIOMERO` in PowerShell:

```powershell
$env:BIOMERO_ZARR_VIEWER_WEB_IMAGE = "local/nl-biomero-omeroweb-zarr:0.5.0"

docker compose `
  --file docker-compose.yml `
  --file ..\OMERO.ZarrViewer\deploy\nl-biomero\docker-compose-windows-dev.yml `
  up -d --no-build --force-recreate omeroweb zarrviewer-nginx
```

If the repositories are elsewhere, set
`BIOMERO_ZARR_VIEWER_REPO` to the ZarrViewer checkout before running Compose.
Set `BIOMERO_ZARR_VIEWER_PROXY_PORT` to change the host port from 4081.

When running a Compose file from the `deployment_scenarios` directory, set the
in-place storage path explicitly. This avoids resolving a relative value from
`.env` below the scenario directory instead of the NL-BIOMERO checkout:

```powershell
$env:INPLACE_STORAGE_HOST_PATH = (Resolve-Path ..\web\L-Drive).Path
```

Port 4081 lets the proxy run alongside an existing frontend or a directly
published OMERO.web port. To make the new proxy the only frontend on the usual
development port 4080, first stop and remove the container currently publishing
that port, then set:

```powershell
$env:BIOMERO_ZARR_VIEWER_PROXY_PORT = "4080"
```

For example, the `docker-compose-from-dockerhub.yml` scenario may have an old
`nginx` service on port 4080. Remove only that frontend with:

```powershell
docker compose rm --stop --force nginx
```

Retain OMERO Server, databases, workers, and importer.
The scenario's `omeroweb` service has no host port, so the lightweight proxy can
then bind port 4080. In a Compose variant that publishes OMERO.web directly on
4080, keep the proxy on 4081 unless that direct port mapping is removed with a
local override.

Open OMERO.web through <http://localhost:4081>. Port 4080 remains a direct
OMERO.web endpoint for diagnostics, but it cannot deliver viewer metadata or
chunks because it bypasses Nginx.

If the lightweight proxy replaces the previous frontend on port 4080, open
<http://localhost:4080> instead; there is no separate direct OMERO.web endpoint
in that layout.

Do not expose `/data` with a normal public Nginx location. The supplied proxy
configuration marks `/_biomero_zarr_internal/` as `internal`, so Django must
authorize the request before Nginx can read a file.

## 3. Ubuntu SSL: extend the existing proxy

For
`deployment_scenarios/docker-compose-for-ubuntu-with-SSL.yml`, do not add the
Windows development overlay or a second Nginx service. Select the derived
OMERO.web image:

```yaml
services:
  omeroweb:
    image: "local/nl-biomero-omeroweb-zarr:0.5.0"
```

Give the existing Nginx service read-only access to the same in-place store:

```yaml
services:
  nginx:
    volumes:
      - "../nginx/nginx.conf:/etc/nginx/nginx.conf:ro"
      - "/etc/letsencrypt/:/etc/letsencrypt:ro"
      - "../web/L-Drive:/data:ro"
```

Insert
[`deploy/nl-biomero/nginx-location.conf`](../deploy/nl-biomero/nginx-location.conf)
inside the HTTPS OMERO.web `server` block in `nginx/nginx.conf`, alongside the
existing `location /` that proxies to `omeroweb:4080`.

If the Nginx mount is not `/data`, update only the snippet's `alias`. The path
inside Nginx does not need to equal the path inside OMERO.web; both must expose
the same relative store tree.

Start the SSL scenario from NL-BIOMERO:

```bash
docker compose \
  --env-file .env \
  --file deployment_scenarios/docker-compose-for-ubuntu-with-SSL.yml \
  up -d
```

## 4. Storage path configuration

NL-BIOMERO normally mounts its in-place store at `/data` in OMERO.web. Those
defaults match the viewer's `source_root` and `mount_root` configuration.

If BIOMERO records another source prefix, configure the recorded and mounted
roots separately:

```bash
omero config set omero.web.zarr_viewer.source_root <recorded-prefix>
omero config set omero.web.zarr_viewer.mount_root /data
```

Nginx's `alias` must expose the same relative tree and needs read-only access.

Canonical Plate annotations and shallow-result manifests use managed storage
roots such as `group-0-data`. Keep the same read-only group mapping available
to OMERO.web:

```yaml
environment:
  OMERO_BIOMERO_GROUP_MAPPINGS_FILE: /opt/omero/web/OMERO.web/var/group-mappings.json
volumes:
  - ./web/group-mappings.json:/opt/omero/web/OMERO.web/var/group-mappings.json:ro
```

The viewer also accepts `group_mappings` from `OMERO_BIOMERO_CONFIG_FILE`.
NL-BIOMERO already supplies both files. An installation that only views
complete, directly imported OME-Zarr stores does not need this additional
mapping.

## 5. Verify either deployment

1. Sign in through the Nginx endpoint: port 4081 for Windows development or
   the HTTPS endpoint for the SSL scenario.
2. Select a BIOMERO-imported OME-Zarr Image or Plate.
3. Open **Open With → OME-Zarr Viewer**.
4. Confirm `/biomero_zarr_viewer/data/images/...` requests return 200 or 206
   with a non-empty response body.
5. Confirm a direct request below `/_biomero_zarr_internal/` returns 404.

For the Windows proxy configuration test:

```powershell
docker compose `
  --file docker-compose.yml `
  --file ..\OMERO.ZarrViewer\deploy\nl-biomero\docker-compose-windows-dev.yml `
  exec zarrviewer-nginx nginx -t
```

For the SSL scenario:

```bash
docker compose \
  --env-file .env \
  --file deployment_scenarios/docker-compose-for-ubuntu-with-SSL.yml \
  exec nginx nginx -t
```

If the viewer opens but chunks report **Failed to fetch**, first check that
OMERO.web and Nginx mount the same underlying directory and that the relative
path below their configured roots is identical.

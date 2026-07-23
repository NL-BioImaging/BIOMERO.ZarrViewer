# Deploy with `NL-BIOMERO`

[`NL-BioImaging/NL-BIOMERO`](https://github.com/NL-BioImaging/NL-BIOMERO)
provides an SSL deployment scenario with an existing `nginx:alpine` service.
The viewer extends that service; do not add a second Nginx container.

These instructions target:

```text
deployment_scenarios/docker-compose-for-ubuntu-with-SSL.yml
```

The default development Compose file exposes OMERO.web directly on port 4080
and does not run Nginx. Use the SSL scenario for the current
`X-Accel-Redirect` backend.

## 1. Build the viewer wheel and OMERO.web image

From `BIOMERO.ZarrViewer`:

```bash
python -m pip install build
python scripts/build_frontend.py
python -m build --wheel
python scripts/verify_wheel.py dist/<wheel-file>.whl

docker build \
  --build-arg OMERO_WEB_IMAGE=<current-omeroweb-image> \
  --build-arg VIEWER_WHEEL=dist/<wheel-file>.whl \
  --file docker/Dockerfile.omeroweb \
  --tag local/nl-biomero-omeroweb-zarr:<viewer-version> \
  .
```

For a new deployment, `<current-omeroweb-image>` is the matching
`cellularimagingcf/omeroweb` version. For an existing deployment, use its
current derived image so other baked-in plugins are preserved. The included
`scripts/build-docker-image.ps1` automates this selection for a running local
Compose stack and refuses a base image that would drop container-only plugin
configuration.

The resulting image includes the Python package, compiled frontend, Open With
registration, `/data` viewer defaults, and any plugins already present in its
base image.

## 2. Select the derived OMERO.web image

In
`deployment_scenarios/docker-compose-for-ubuntu-with-SSL.yml`, change the
`omeroweb` image:

```yaml
services:
  omeroweb:
    image: "local/nl-biomero-omeroweb-zarr:<viewer-version>"
```

The existing NL-BIOMERO service already mounts `../web/L-Drive` at `/data`.
That is the default `source_root` and `mount_root` used by the viewer.

If BIOMERO records another prefix, override the value in the OMERO.web
configuration:

```bash
omero config set omero.web.zarr_viewer.source_root <recorded-prefix>
```

## 3. Give the existing Nginx read-only access

Add the same in-place store to the existing `nginx` service:

```yaml
services:
  nginx:
    volumes:
      - "../nginx/nginx.conf:/etc/nginx/nginx.conf:ro"
      - "/etc/letsencrypt/:/etc/letsencrypt:ro"
      - "../web/L-Drive:/data:ro"
```

OMERO.web may retain its existing read-write mount for BIOMERO functions.
Nginx needs only the additional read-only mount.

## 4. Extend the existing Nginx configuration

Insert
[`deploy/nl-biomero/nginx-location.conf`](../deploy/nl-biomero/nginx-location.conf)
inside the HTTPS OMERO.web `server` block in `nginx/nginx.conf`, alongside the
existing `location /` that proxies to `omeroweb:4080`.

If the Nginx mount is not `/data`, update only the snippet's `alias`. It does
not need to equal the path inside OMERO.web; both paths must expose the same
relative store tree.

The location is `internal`, so a browser cannot access `/data` directly.
Django first validates the OMERO session, active group, Image, signed context,
and requested Zarr key.

## 5. Start and verify the SSL deployment

From the NL-BIOMERO repository:

```bash
docker compose \
  --env-file .env \
  --file deployment_scenarios/docker-compose-for-ubuntu-with-SSL.yml \
  up -d
```

Then:

1. Sign in through the Nginx HTTPS endpoint.
2. Select a BIOMERO-imported OME-Zarr Image or Plate.
3. Open **Open With → OME-Zarr Viewer**.
4. Confirm `/biomero_zarr_viewer/data/images/...` requests return 200 or 206.
5. Confirm a direct request below `/_biomero_zarr_internal/` returns 404.

If the viewer opens but chunks report **Failed to fetch**, check that
`../web/L-Drive` is the same underlying directory for both services and run:

```bash
docker compose \
  --env-file .env \
  --file deployment_scenarios/docker-compose-for-ubuntu-with-SSL.yml \
  exec nginx nginx -t
```

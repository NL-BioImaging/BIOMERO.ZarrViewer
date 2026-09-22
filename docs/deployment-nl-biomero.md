# Deploy with NL-BIOMERO

[NL-BIOMERO](https://github.com/NL-BioImaging/NL-BIOMERO) is the supported
deployment path for BIOMERO OME-Zarr Viewer. It installs the viewer in the
combined OMERO.web image and provides Nginx configurations for both the local
HTTP stack and the Ubuntu HTTPS scenario.

The supplied demo enables the viewer. Existing deployments keep it disabled
unless an administrator explicitly opts in, so upgrading does not require a
storage or proxy change until the viewer is wanted.

## How the integration is arranged

The viewer requires a single browser-facing Nginx endpoint:

1. Django checks the OMERO session, active group, selected object, and resolved
   physical store.
2. Django returns an authenticated `X-Accel-Redirect` for an approved metadata
   or chunk key.
3. Nginx serves that file from its read-only copy of the same storage mount.

OMERO.web's Gunicorn service remains internal. Opening OMERO.web directly on
its container port bypasses the component that processes the internal redirect
and results in empty or failed data requests.

## Local HTTP deployment

The root `docker-compose.yml` and `docker-compose-dev.yml` files include a
`zarrviewer-nginx` service. It is the only browser-facing OMERO.web endpoint and
publishes port 4080 by default.

For the supplied demo configuration:

```powershell
docker compose up -d --build
```

Open <http://localhost:4080> and sign in there. Dashboard links, Open With, and
viewer data requests all use the same origin.

For an existing deployment, preserve its environment and credentials, then opt
in with:

```ini
BIOMERO_ZARR_VIEWER_ENABLED=TRUE
BIOMERO_WEB_HOST_PORT=4080
```

Rebuild and recreate the web-facing services:

```powershell
docker compose build omeroweb
docker compose up -d --no-deps omeroweb zarrviewer-nginx
docker compose exec zarrviewer-nginx nginx -t
```

Set `BIOMERO_ZARR_VIEWER_ENABLED=FALSE` and recreate `omeroweb` to unregister
the viewer. Nginx remains the normal OMERO.web frontend when the viewer is
disabled.

## Ubuntu HTTPS deployment

The
`deployment_scenarios/docker-compose-for-ubuntu-with-SSL.yml` scenario uses its
existing `nginx` service. The integration:

- forwards `BIOMERO_ZARR_VIEWER_ENABLED` and the optional recorded source root
  to OMERO.web;
- mounts the same in-place store used by OMERO.web read-only at `/data` in
  Nginx;
- adds an `internal` `/_biomero_zarr_internal/` location;
- sends `/biomero_zarr_viewer/` requests to OMERO.web without a shared proxy
  cache; and
- leaves the existing HTTPS endpoint as the only browser-facing OMERO.web URL.

Configure the hostname and certificates as described by the
[NL-BIOMERO Linux deployment guide](https://nl-bioimaging.github.io/NL-BIOMERO/latest/sysadmin/linux-deployment.html),
then enable the viewer in the deployment environment:

```ini
BIOMERO_ZARR_VIEWER_ENABLED=TRUE
```

Start or recreate the scenario using its normal Compose command:

```bash
docker compose \
  --env-file .env \
  --file deployment_scenarios/docker-compose-for-ubuntu-with-SSL.yml \
  up -d
```

Validate the deployed proxy:

```bash
docker compose \
  --env-file .env \
  --file deployment_scenarios/docker-compose-for-ubuntu-with-SSL.yml \
  exec nginx nginx -t
```

Sites with a customized Nginx file should carry forward the internal storage
location and uncached viewer route from NL-BIOMERO while preserving their own
hostname, certificate paths, and other routes. Do not add a second proxy.

## Storage roots

OMERO.web and Nginx must see the same physical store with the same relative
directory tree. The integrated configurations mount the local store at `/data`
inside Nginx. OMERO.web uses `IMPORT_MOUNT_PATH` as its viewer mount root.

If the path recorded in OMERO has another prefix, set the source root
explicitly:

```ini
IMPORT_MOUNT_PATH=/data
BIOMERO_ZARR_VIEWER_SOURCE_ROOT=/archive
```

With those values, a registration for
`/archive/alice/example.ome.zarr` resolves to
`/data/alice/example.ome.zarr` inside both containers. The viewer never writes
to the store.

Canonical Plate annotations and shallow-result manifests can use managed
storage locators. NL-BIOMERO supplies the BIOMERO configuration and group
mapping files to OMERO.web so these locators resolve to the same trusted mount.

## Security requirements

- Keep `/_biomero_zarr_internal/` marked `internal`; never expose `/data` as a
  public directory.
- Mount storage read-only in Nginx.
- Do not use a shared proxy cache for `/biomero_zarr_viewer/`; every request
  must reach OMERO authorization.
- Use one Nginx origin for login, ordinary OMERO.web pages, Open With, and
  viewer data requests.
- Preserve the source-root and mount-root relationship when moving a store.

## Verify the deployment

1. Sign in through the Nginx URL.
2. Select a registered OME-Zarr Image, Plate, or Well.
3. Choose **Open With → OME-Zarr Viewer**.
4. Confirm the expected channels, fields, and segmentation labels appear.
5. For a shallow result, confirm that canonical intensity data and the
   split-out result labels render together.
6. In browser network tools, confirm requests below
   `/biomero_zarr_viewer/data/images/` return 200 or 206 with non-empty bodies.
7. Confirm a direct request below `/_biomero_zarr_internal/` returns 404.
8. Confirm a signed-out browser cannot retrieve capabilities or store data.

If the viewer opens but reports **Failed to fetch**, check that the browser is
using Nginx, compare the store's relative path in both containers, and inspect:

```bash
docker compose logs --tail=100 omeroweb zarrviewer-nginx
```

For the HTTPS scenario, inspect the existing `nginx` service instead of
`zarrviewer-nginx`.

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

## Optional pinned HTTP-Zarr provider in an existing BIOMERO stack

Use [`docker/Dockerfile.biomero`](https://github.com/NL-BioImaging/BIOMERO.ZarrViewer/blob/0.8.1-beta-standalone/docker/Dockerfile.biomero)
to extend your **combined BIOMERO OMERO.web image**, including ZarrViewer
0.8.1b3 or later. This preserves its installed BIOMERO, Analysis, WorkflowSkills,
viewer wheel, startup scripts and proxy settings. It does not replace that
image with standalone OMERO.web, update dependencies or alter source data.
The recipe targets the existing `/opt/omero/web/venv3` environment and
`omero-web` runtime user; the tested combined image uses Python 3.12,
OMERO.web 5.33.2, Zarr-Python 3.4.1, NumPy, Numcodecs and Requests.

The shared installer downloads
[`NL-BioImaging/omero-web-zarr`](https://github.com/NL-BioImaging/omero-web-zarr)
at commit `3afc184a9c3dcab090bd4a92effcf5e45ae4c864`, verifies archive SHA-256
`e2d36c36376c44e11312325efa6865d8b58571b9f6cea67c8559abcd0288fd96`,
then installs it with `--no-deps --no-build-isolation`. The build fails if
the checksum or existing dependency requirements do not match. No package is
downloaded from an unpinned provider release. See [provider changes](http-zarr.md).

### Build from the exact existing web image

Run these PowerShell commands from the ZarrViewer repository root. Change the
container name if necessary. Preserve the base image and record its image ID;
on another machine, load an archived copy of that image or supply an immutable
registry reference such as `registry/combined-web@sha256:...`. The provider pin
alone does not reproduce your combined base image and its other plugins.

```powershell
$container = 'nl-biomero-omeroweb-1'
$web = docker inspect $container | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect existing BIOMERO web' }
$baseId = $web.Image
$base = 'nl-biomero-omeroweb:http-zarr-base'
$target = 'nl-biomero-omeroweb:viewer0.8.1b3-http-zarr-nlbi1'
docker tag $baseId $base
if ($LASTEXITCODE -ne 0) { throw 'Cannot preserve base image' }
$baseId | Set-Content ./biomero-http-zarr-base-image.txt

docker build --file docker/Dockerfile.biomero `
    --build-arg "BIOMERO_WEB_IMAGE=$base" `
    --build-arg ENABLE_HTTP_ZARR=true `
    --tag $target docker
if ($LASTEXITCODE -ne 0) { throw 'Provider image build failed' }
```

`ENABLE_HTTP_ZARR` defaults to `false`: the recipe then leaves any provider
inherited from the base untouched, without downloading or registering one.
It does **not** uninstall an existing provider or disable an inherited flag.
With `true`, it installs/upgrades the pinned fork and adds
`91-omero-web-zarr.omero`, which registers the app and enables its viewer flag.
The existing viewer configuration, source/mount roots and Gunicorn arguments
are inherited, not overwritten. Physical OME-Zarr and BIOMERO registrations
keep priority over the optional virtual HTTP source.

### Add the image to the existing Compose command

Keep every existing Compose file, environment file, project name and profile.
Append an override for **only** `omeroweb`; do not start a second stack.
This example discovers the active Compose file list, but you must set
`$envFile` to the same deployment environment file used by your existing start
command. The example profiles match the integrated Analysis/importer setup;
retain your site's profiles if they differ.

```powershell
$envFile = 'C:\deploy\biomero\stack.env' # Set to your existing environment file.
$stackDir = $web.Config.Labels.'com.docker.compose.project.working_dir'
$project = $web.Config.Labels.'com.docker.compose.project'
$files = $web.Config.Labels.'com.docker.compose.project.config_files'.Split(',')
$compose = @('compose', '--project-directory', $stackDir,
    '--env-file', $envFile, '-p', $project,
    '--profile', 'analysis', '--profile', 'IMPORTER_ENABLED')
foreach ($file in $files) { $compose += @('-f', $file) }

# Absolute build context: relative Compose paths otherwise use the first file.
$context = (Resolve-Path ./docker).Path
$override = Join-Path $stackDir 'compose.http-zarr.local.json'
$overlay = @{ services = @{ omeroweb = @{
    image = $target
    build = @{ context = $context; dockerfile = 'Dockerfile.biomero'; args = @{
        BIOMERO_WEB_IMAGE = $base; ENABLE_HTTP_ZARR = 'true'
    }}
}}}
$overlay | ConvertTo-Json -Depth 8 | Set-Content $override -Encoding UTF8
$compose += @('-f', $override)
docker @compose config --quiet
if ($LASTEXITCODE -ne 0) { throw 'Invalid Compose configuration' }
docker @compose up -d --no-deps --no-build --pull never omeroweb
if ($LASTEXITCODE -ne 0) { throw 'Web recreation failed' }
docker @compose exec -T zarrviewer-nginx nginx -t
if ($LASTEXITCODE -ne 0) { throw 'Invalid Nginx configuration' }
docker @compose exec -T zarrviewer-nginx nginx -s reload
```

Wait for OMERO.web to finish starting before signing in. Reloading the existing
Nginx frontend refreshes its web-container address; for HTTPS use your existing
`nginx` service instead of `zarrviewer-nginx`. No new ports, mounts, database,
server, workers or Slurm services are introduced. Add the same final override
to the persistent start/rebuild command so subsequent Compose runs use the
new image. Keep the preserved base image and prior Compose configuration for
rollback; avoid rebuilding with a mutable base tag that has since moved.

### Validate the combined stack

Confirm the installed versions and dependency consistency:

```powershell
docker @compose exec -T omeroweb /opt/omero/web/venv3/bin/python -m pip show biomero-zarr-viewer omero-web-zarr
docker @compose exec -T omeroweb /opt/omero/web/venv3/bin/python -m pip check
```

The provider version is `0.1.2.dev0+nlbi.2`. It keeps virtual 0.4 as the viewer
default; optional [virtual 0.5](http-zarr.md#optional-virtual-ome-zarr-05-without-sharding)
requires viewer 0.8.1b4+ and explicit format selection. Sign in through Nginx and test an
ordinary SVS at overview/native resolution, a confocal MIP including its
progress display, and existing physical OME-Zarr images/HCS plates with their
segmentation layers. Verify Analysis, DataQueryWorker and WorkflowSkills
through their normal authenticated routes. The physical images must still
report `store.transport=filesystem`; ordinary TIFF/SVS images use `http`.
The [deployment checks below](#verify-the-deployment) still apply.

The earlier virtual-0.4 installation was validated in the local combined stack with
OMERO.biomero 1.7.0b9, Analysis 1.0.1, WorkflowSkills 0.4.0 and viewer 0.8.1b3.
SVS pixels and the complete confocal MIP matched their source data; three
existing physical image registrations also matched sampled original pixels,
including a shallow plate with three segmentation layers. Only OMERO.web was
recreated; the server, workers, data services and separate standalone stack
were unchanged. The optional-0.5 comparison is performed in the separate
standalone stack, without updating the running BIOMERO stack. These are representative regression checks, not a scan of
every image in the deployment.

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

## Cache and large datasets

See [configuration and security](configuration.md) for persistent volume/mesh
cache setup, memory and label-surface limits, and the Nginx/Gunicorn request
header limits needed by large shallow plates. Use the combined plugin image
when updating an existing deployment; see [installation](installation.md).

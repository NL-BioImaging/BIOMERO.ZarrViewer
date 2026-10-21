# Installation

## Stable package and deployment options

Install 0.8.1 into the Python environment used by OMERO.web:

```bash
python -m pip install --upgrade biomero-zarr-viewer==0.8.1
```

The wheel includes the compiled browser assets. Standalone OMERO deployments
can use the [reproducible Docker recipe](http-zarr.md#reproduce-the-standalone-docker-installation),
with an optional pinned omero-web-zarr provider for ordinary OMERO images.
BIOMERO, Slurm and OMERO.Analysis are not required.

For existing BIOMERO installations, use the integrated
[`NL-BIOMERO` deployment guide](deployment-nl-biomero.md). Its local HTTP and
Ubuntu HTTPS configurations install and register the viewer when explicitly
enabled, preserve the other web plugins and provide the shared storage route.

Maintainers of another OMERO deployment can follow the
[`omero-deployment-kit` guide](deployment-omero-deployment-kit.md).
Physical store metadata and native chunks require Nginx to process authenticated
`X-Accel-Redirect` responses. The bounded pixel/preview/3D APIs return computed
bytes through their authenticated routes. Deployment recipes provide the shared
mount, proxy and
[`docker/90-biomero-zarr-viewer.omero`](https://github.com/NL-BioImaging/BIOMERO.ZarrViewer/blob/v0.8.1/docker/90-biomero-zarr-viewer.omero)
configuration.

The complete documentation is published at
[nl-bioimaging.github.io/BIOMERO.ZarrViewer](https://nl-bioimaging.github.io/BIOMERO.ZarrViewer/).

The wheel also serves its bundled `use-omero-zarr-viewer` Analysis skill from
authenticated `/biomero_zarr_viewer/api/analysis-skills/` endpoints. This
keeps ZarrViewer operations independent from BIOMERO.WorkflowSkills; Analysis
discovers the provider only when ZarrViewer is installed and enabled.

Temporal data has compact playback controls and a browser-local **Export movie**
action. MP4 export defaults to **5 FPS**, with generic intensity, label, point,
and explicitly mapped track overlays. See [movie playback and export](movies.md)
for limits, recipes, and Chrome acceptance.

### Prerequisites

- OMERO.web 5.6 or newer, running on Python 3.10–3.12;
- a standard ExternalInfo/OMERO CLI Zarr registration, BIOMERO registration, or equivalent OMERO-to-store link for physical stores;
- the optional HTTP-Zarr provider when opening conventional OMERO images;
- the OME-Zarr storage visible to OMERO.web and read-only to Nginx;
- one of the supported Nginx-fronted deployment paths above.

Use Python 3.12 with Zarr-Python 3 for OME-Zarr 0.5/Zarr v3 data, including
server-side previews, exports and 3D preparation. Python 3.10 resolves to the
older Zarr-Python 2 reader and supports those operations on Zarr v2 stores.

Physical metadata/native-chunk routes require Nginx to process `X-Accel-Redirect`.
Connecting directly to Gunicorn cannot deliver those physical files. The optional
HTTP provider and bounded pixel APIs return their response bodies through Django;
see [HTTP-Zarr setup](http-zarr.md) and [large-volume loading](large-volumes.md).

### Build the wheel

Use a pinned release wheel, or build one from this repository:

```bash
python -m pip install build
python scripts/build_frontend.py
python -m build --wheel
python scripts/verify_wheel.py dist/<wheel-file>.whl
```

Building requires Node.js 22 and Python 3.10–3.12. The resulting wheel already
contains the compiled frontend, so Node.js is not required in the production
OMERO.web container.

### Temporary installation in a running local stack

For development or a quick installation into an already running Compose
service named `omeroweb`, use:

```powershell
.\scripts\manage-docker-plugin.ps1 install
.\scripts\manage-docker-plugin.ps1 status
```

Use `-Container <name>` when the container is not part of a service named
`omeroweb`. Updates and removal are available as:

```powershell
.\scripts\manage-docker-plugin.ps1 update
.\scripts\manage-docker-plugin.ps1 remove
```

This installation is lost when the container is replaced. Use a derived image
or the deployment-kit integration for a persistent deployment. The local
stack must still be opened through an Nginx endpoint.

To build a persistent image without removing other installed OMERO.web
plugins, use:

```powershell
.\scripts\build-docker-image.ps1
```

The script uses the currently deployed OMERO.web image as its base by default,
so plugins already baked into that image are retained. It refuses to continue
when it detects plugin configuration files that exist only in the running
container and would therefore disappear after recreation. This protects
other co-installed OMERO.web extensions.

Never update this viewer by rebuilding directly from the vendor OMERO.web
image when the deployment already uses a combined plugin image. Layer the
updated viewer onto the current combined image instead.

### Storage path model

`source_root` is the path prefix recorded by the importer in OMERO.
`mount_root` is the corresponding path inside OMERO.web. The Nginx `alias` is
the same underlying storage as seen from Nginx's own host or container
namespace.

For example, if OMERO records
`/archive/alice/example.ome.zarr`, OMERO.web sees it as
`/data/alice/example.ome.zarr`, and host Nginx sees it as
`/srv/biomero/alice/example.ome.zarr`, configure:

```bash
omero config set omero.web.zarr_viewer.source_root /archive
omero config set omero.web.zarr_viewer.mount_root /data
omero config set omero.web.zarr_viewer.internal_prefix /_biomero_zarr_internal/
```

When the recorded and mounted paths are both under `/data`, the defaults in
[`docker/90-biomero-zarr-viewer.omero`](https://github.com/NL-BioImaging/BIOMERO.ZarrViewer/blob/v0.8.1/docker/90-biomero-zarr-viewer.omero)
are already correct.

The roots may differ, but the relative suffix
`alice/example.ome.zarr` must be identical. Nginx only needs read access.

### Verify the installation

1. Sign in to OMERO.web.
2. Select a BIOMERO-imported OME-Zarr Image, Plate, or Well.
3. Open **Open With → OME-Zarr Viewer**.
4. Confirm that image requests below
   `/biomero_zarr_viewer/data/images/...` return HTTP 200 or 206.
5. Confirm that directly requesting
   `/_biomero_zarr_internal/...` returns 404. This proves that the storage
   location cannot be accessed without Django authorization.

For a local Docker installation:

```powershell
.\scripts\manage-docker-plugin.ps1 status
```

If the menu entry is disabled, first confirm that the selected OMERO object is
readable and linked to one unambiguous `.zarr` store. If the viewer opens but
reports **Failed to fetch**, check the Nginx route, the shared read-only mount,
and the relative path below the OMERO.web and Nginx roots.

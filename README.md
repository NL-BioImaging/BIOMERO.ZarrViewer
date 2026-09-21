# BIOMERO OME-Zarr Viewer

BIOMERO OME-Zarr Viewer is a read-only
[OMERO.web](https://omero.readthedocs.io/en/stable/developers/Web.html)
extension for opening physical OME-Zarr stores that are registered in OMERO.
It supports multichannel images, integer segmentation labels, Z stacks, and
HCS plates.

The viewer does not import data or convert ordinary OMERO images to OME-Zarr.
Use BIOMERO, or another compatible importer, to create and register the
OME-Zarr data first.

## Install into OMERO.web

The viewer requires an Nginx endpoint to process authenticated
`X-Accel-Redirect` responses:

- [`omero-deployment-kit` instructions](docs/deployment-omero-deployment-kit.md):
  extend the host Nginx installed by its Ansible role;
- [`NL-BIOMERO` instructions](docs/deployment-nl-biomero.md): add the supplied
  lightweight HTTP-only proxy for Windows development, or extend the existing
  Nginx container in the production SSL scenario.

Both deployment paths install the same wheel and
[`docker/90-biomero-zarr-viewer.omero`](docker/90-biomero-zarr-viewer.omero)
configuration. They differ only in how Nginx is provided and sees the in-place
storage.

The wheel also serves its bundled `use-omero-zarr-viewer` Analysis skill from
authenticated `/biomero_zarr_viewer/api/analysis-skills/` endpoints. This
keeps ZarrViewer operations independent from BIOMERO.WorkflowSkills; Analysis
discovers the provider only when ZarrViewer is installed and enabled.

### Prerequisites

- OMERO.web 5.6 or newer, running on Python 3.10–3.12;
- a BIOMERO in-place OME-Zarr import, or an equivalent OMERO-to-store link;
- the OME-Zarr storage visible to OMERO.web and read-only to Nginx;
- one of the supported Nginx-fronted deployment paths above.

The current data backend requires Nginx to process `X-Accel-Redirect`.
Connecting directly to Gunicorn can load capabilities but cannot deliver
metadata or chunks because Django deliberately does not stream file bodies.

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
[`docker/90-biomero-zarr-viewer.omero`](docker/90-biomero-zarr-viewer.omero)
are already correct.

The roots may differ, but the relative suffix
`alice/example.ome.zarr` must be identical. Nginx only needs read access.

### Verify the installation

1. Sign in to OMERO.web.
2. Select a BIOMERO-imported OME-Zarr Image or Plate.
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

## Is BIOMERO required?

BIOMERO is not installed as a Python dependency of this viewer. It normally
runs earlier in the workflow as the importer that creates or preserves the
OME-Zarr store and registers where that store belongs in OMERO.

| Component | Responsibility |
| --- | --- |
| BIOMERO or another importer | Create/import the physical OME-Zarr and associate it with OMERO |
| OMERO | Users, groups, permissions, Images, Plates, and provenance |
| BIOMERO OME-Zarr Viewer | Validate access, interpret NGFF metadata, and render the data |
| Nginx | Serve only the files authorized by the viewer |

The viewer can locate a store in either of these ways:

1. the readable OMERO Image has a Fileset/OriginalFile path inside a `.zarr`
   directory; or
2. the Image or its readable Dataset/Plate/Screen ancestry has a structured
   `biomero.import` map annotation containing `UUID`, `Filepath`,
   `DestinationType`, and `Files`.
3. a readable Plate has a BIOMERO schema-2 `biomero.zarr.plate-source`
   annotation that identifies its canonical managed OME-Zarr store.

The BIOMERO importer produces the second form for in-place imports, including
plate imports whose individual OMERO Images are named with NGFF field paths
such as `A/1/0`.

### Canonical and shallow BIOMERO stores

The viewer reconstructs BIOMERO RFC-8 shallow results as one logical store.
Intensity pixels and plate metadata come from the canonical source recorded in
`.biomero-shallow.json`; label subtrees retained in the shallow result remain
at their result paths. This permits labels such as
`A/1/0/labels/labels_nuclei` to be displayed over canonical `A/1/0` pixels
without copying the intensity pyramid.

Managed locators such as `group-3-data` are resolved only through the trusted
BIOMERO group mapping. Set `OMERO_BIOMERO_GROUP_MAPPINGS_FILE` to the JSON
mapping used by the importer, or set `OMERO_BIOMERO_CONFIG_FILE` to a BIOMERO
configuration containing `group_mappings`. Both the canonical store and every
declared label route must resolve below `mount_root`; unsafe, missing, invalid,
or ambiguous routes are rejected. Existing complete OME-Zarr stores continue
to use the Fileset and `biomero.import` resolution paths unchanged.

Another importer can therefore be used, but it must provide one of those
links. Its recorded store path must be below `source_root`, and the matching
store must exist below `mount_root`.

### OME-Zarr metadata requirements

BIOMERO provenance tells the viewer where the store is; the actual image,
channel, label, and plate descriptions come from standard OME-NGFF metadata
inside the store.

Supported data:

- OME-Zarr 0.4 with Zarr v2;
- OME-Zarr 0.5 with Zarr v3;
- multiscale images with declared axes and datasets;
- HCS plates with plate, well, acquisition, and field metadata;
- labels declared through the NGFF label group and stored as integer arrays.

Channel names, colors, and display windows are read from NGFF `omero`
metadata when present. Missing or incomplete values receive safe viewer
defaults. The viewer does not repair malformed metadata or generate an
OME-Zarr store from conventional OMERO pixels.

## Viewer features

- one image canvas with pan, mouse-wheel zoom, minimap, scale bar, and
  fullscreen mode;
- channel visibility, color, dual-ended display range, sampled histogram, and
  Auto/Fit/Hist controls;
- middle Z slice by default, T and Z navigation, and MIP, mean, or minimum
  intensity projection across Z;
- a field-level 2D/3D toggle for Z stacks, with orbiting volume ray casting at
  one selected time point and one selected HCS field;
- bounded 3D loading that uses only visible intensity channels, defaults to the
  coarsest safe multiscale level, and rejects levels above a 256 MiB raw-payload
  budget or the browser's WebGL 3D-texture limit;
- multiple independently visible and reordered label layers with 30% default
  opacity, nearest-neighbor sampling, and fill or outline display;
- deterministic GPU label colors without a JavaScript color table
  proportional to the number of label IDs;
- Field, Well, and Plate views with plate-grid navigation and field selection;
- versioned URL state for viewport, planes, projection, 3D camera and quality,
  channels, labels, and the selected field.
- measurement-oriented focused links that fit a half-open pixel ROI, select
  one-based source channels, and outline one label value by stable label path
  or appended label channel;
- authenticated native-resolution ROI PNG export and batch galleries using
  the same focus state.

The viewer remains read-only. It does not provide annotation editing,
OMERO.tables, CSV measurements, expression data, or embedding panels.

### Focused links

Version-2 focused links add an `overlays` JSON array while still reading the
existing `v=1` parameters:

```text
?image=42&v=2
&field=A/1/0
&roi=120,80,260,230
&sourceChannels=1,2
&labelPath=A/1/0/labels/labels_cells
&labelValue=17
&t=0&z=0
&storeUuid=3935615d-a18d-41d8-af04-e63cfec3a46c
```

`roi` is `x0,y0,x1,y1` in native level-0 pixels with inclusive minima and
exclusive maxima. `sourceChannels` and `labelChannel` are one-based;
`t` and `z` are zero-based. Use `labelPath` for a native label image or
`labelChannel` for a segmentation stored in the main image, never both.
When supplied, `storeUuid` must match the output store identity.
Overlay entries support multiple label values, `outline`, `fill`, or
`outline-fill`, opacity, color, and a 1–8 px outline width. The default
focused-object outline is 2 screen pixels.

### 3D limitations

The 3D view renders intensity channels only; segmentation labels remain
available in 2D. It requires WebGL 2 and loads the selected multiscale volume
into browser and GPU memory, so it is intentionally bounded rather than an
out-of-core renderer. Changing the time point, quality level, selected HCS
field, or visible channel set cancels and reloads the volume. Well and Plate
overview modes remain 2D.

## Security model

1. OMERO.web supplies an authenticated OMERO connection and active group.
2. The backend resolves the selected readable Image or Plate to one store.
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

## Development

Install and run the backend tests:

```bash
python -m pip install -e ".[test]"
python -m pytest
```

Run the frontend checks:

```bash
cd frontend
npm ci
npm test
npm run typecheck
npm run build
```

Build and validate a release wheel:

```bash
python scripts/build_frontend.py --skip-install
python -m build --wheel
python scripts/verify_wheel.py dist/<wheel-file>.whl
```

Before a release, run the live compatibility matrix in
[`docs/compatibility-spike.md`](docs/compatibility-spike.md). An authenticated
deployment can be checked with:

```powershell
.\scripts\smoke-test.ps1 `
  -BaseUrl https://omero.example.org `
  -ImageId 123 `
  -Cookie "sessionid=..."
```

## API

All routes are below the standard `/biomero_zarr_viewer/` application mount.

```text
GET /?image=<omero-image-id>
GET /?plate=<omero-plate-id>

GET /api/images/<id>/capabilities/
GET /api/plates/<id>/capabilities/
GET /api/images/<id>/roi.png?field=...&roi=x0,y0,x1,y1
POST /api/images/<id>/render.png

GET|HEAD /data/images/<id>/<zarr-key>
X-OMERO-Zarr-Context: <signed-context>
```

Unreadable OMERO objects return 404. Unsupported or malformed stores return a
stable JSON error code. Successful data responses have an empty Django body
and contain an `X-Accel-Redirect` for Nginx.

The ROI endpoint uses the focused-link parameters documented above and returns
an 8-bit RGB PNG at native crop resolution. It composes intensity channels
with NGFF display colors/windows and optionally outlines the selected label
value. Authentication and active-group resolution are identical to the
capability endpoint; arbitrary filesystem paths are never accepted.

The POST renderer accepts up to 25 panels. Each panel supports four intensity
channels, eight overlays, multiple values from one label array, titles,
captions, legends, and a scale bar. Repeated planes are cached within one
request so one gallery is faster than equivalent independent render calls.

## AI consumer contract

The catalog-compatible skill is published at
`_agents/skills/use-omero-zarr-viewer`. A future AnalysisChat adapter should
provides two typed authenticated capabilities:

1. open ZarrViewer with validated focused-view inputs;
2. render a bounded ROI or gallery PNG and save or attach the returned bytes.

The adapter supplies the active OMERO Image/Plate ID and group. CI Segmentation
schema-v3 databases supply the portable store UUID, field, label, object value,
coordinates, and originating channels. The skill never invents an OMERO ID or
hard-codes a consumer route.

## Relationship to `ome/omero-web-zarr`

[`ome/omero-web-zarr`](https://github.com/ome/omero-web-zarr) presents
conventional OMERO-managed pixels through a virtual OME-Zarr hierarchy. It
reads pixels through OMERO and serializes requested chunks in Python.

This project serves an existing physical OME-Zarr store, including NGFF 0.5,
labels, and HCS metadata. OMERO authorizes access, but Nginx serves the stored
bytes directly. `ome/omero-web-zarr` is therefore complementary rather than a
dependency of this viewer.

## Source provenance

See [`docs/open-source-provenance.md`](docs/open-source-provenance.md) for the
runtime dependencies, reference-only projects, license distinctions, and
functionality implemented specifically for BIOMERO OME-Zarr Viewer. Copyright
information is recorded in
[`NOTICE`](NOTICE); bundled browser dependency licenses are recorded in
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

## License

Copyright (C) 2026 NL-BioImaging contributors.

GNU Affero General Public License v3.0 or later. See [`LICENSE`](LICENSE).
Users of the network application can obtain the corresponding source from the
[`NL-BioImaging/BIOMERO.ZarrViewer`](https://github.com/NL-BioImaging/BIOMERO.ZarrViewer)
repository.

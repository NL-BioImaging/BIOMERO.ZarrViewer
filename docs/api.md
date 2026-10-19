# API and integrations

## API

All routes are below the standard `/biomero_zarr_viewer/` application mount.

```text
GET /?image=<omero-image-id>
GET /?plate=<omero-plate-id>
GET /?well=<omero-well-id>

GET /api/images/<id>/eligibility/
GET /api/plates/<id>/eligibility/
GET /api/wells/<id>/eligibility/
GET /api/images/<id>/capabilities/
GET /api/plates/<id>/capabilities/
GET /api/images/<id>/roi.png?field=...&roi=x0,y0,x1,y1
POST /api/images/<id>/render.png
POST /api/images/<id>/render.svg
GET /api/analysis-skills/
GET /api/analysis-skills/<skill-name>/

GET|HEAD /data/images/<id>/<zarr-key>
X-OMERO-Zarr-Context: <signed-context>
```

The Open With integration calls the eligibility routes first. They validate
the OMERO Fileset or official `biomero.import` /
`biomero.zarr.plate-source` registration metadata without reading the Zarr
store. This keeps menu feedback quick while preserving a truthful first gate.
The capability routes perform full path, shallow-manifest, and NGFF metadata
validation when the viewer opens.

Opening an OMERO Well resolves its first readable WellSample Image, retains
that field as the selected NGFF path, and starts in Well overview mode so all
fields from the selected well are visible. Image and Plate entry points retain
their existing behavior.

Unreadable OMERO objects return 404 from full capabilities. Unsupported or
malformed stores return a stable JSON error code. Successful data responses
have an empty Django body and contain an `X-Accel-Redirect` for Nginx.

The ROI endpoint uses the focused-link parameters documented below and returns
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
provide two typed authenticated capabilities:

1. open ZarrViewer with validated focused-view inputs;
2. render a bounded ROI or gallery PNG and save or attach the returned bytes.

The adapter supplies the active OMERO Image/Plate ID and group. CI Segmentation
schema-v3 databases supply the portable store UUID, field, label, object value,
coordinates, and originating channels. The skill never invents an OMERO ID or
hard-codes a consumer route.

For shallow segmentation results, the UUID comes from the result store's own
`cisegmentation.output_store_uuid` root metadata. Image pixels still come from
the canonical source, and label pixels follow the manifest's declared routes.
Capabilities and PNG/SVG exports use the same result identity. A missing result
UUID remains unknown; it never inherits the original image store's UUID.
Replaced result identities also invalidate the exported binding digest.
Render caches distinguish physical stores as well as array paths, so separate
cell and aggregate label groups named `0` retain their own pixels and outlines.

## Focused links

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
`outline-fill`, opacity, color, and a 1–20 px outline width. The default
focused-object outline is 2 screen pixels.

## Cached volumes, previews and Neuroglancer

The capability response advertises the authenticated volume, preview and
Neuroglancer URLs. Use these URLs rather than constructing filesystem paths.

- `/api/images/<id>/volume/` prepares or serves a bounded intensity volume.
- `/api/images/<id>/previews/` prepares batched Plate/Well previews.
- `/api/images/<id>/neuroglancer/` prepares same-origin precomputed intensity
  sources and segmentation meshes for the selected field, time and quality.
- `/api/images/<id>/neuroglancer/<context-id>/<data-key>` serves the authorized
  precomputed metadata, chunks and mesh fragments.

All require the OMERO session and signed read context; source authorization is
revalidated. Cache limits and surface-generation bounds are described in
[configuration](configuration.md). Source arrays remain read-only.

The renderer URL state defaults to Neuroglancer. `viewer3d=classic` selects Viv;
the legacy parameter value is retained so previously shared links still work.
`ngCamera` stores the Neuroglancer camera. Brightness and gain are
display state, independent of segmentation opacity and color.

The removed `background3d` URL parameter is ignored; old links still open with the fixed image background. In-viewer 3D movie recipes include `viewCapture` with renderer, layout, quality and camera provenance. The `zarr-movie-v1` integration renderer remains a native 2D raster compositor; it does not replay screen-space `viewCapture` recipes.

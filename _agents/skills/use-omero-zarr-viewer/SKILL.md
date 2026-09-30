---
name: use-omero-zarr-viewer
description: Open an active OMERO OME-Zarr Image or Plate, or export requested bounded PNG or SVG review plots with label outlines, tracks, spots, and time projections.
metadata:
  version: "5"
  biomero-purpose: "application-operation"
  biomero-consumers: "omero-analysis"
  biomero-auto-activate: "false"
  biomero-required-resources: "references/REFERENCE.md"
  biomero-required-capabilities: "zarr-render-v2,zarr-gallery-v1"
---

# Use OMERO ZarrViewer

Operate ZarrViewer only through authenticated capabilities supplied by the
consumer. The skill provides navigation knowledge, not OMERO access.

## Required contract

The consumer must automatically load `references/REFERENCE.md` when this skill
activates. It defines coordinate conventions, database mappings, validation,
gallery rendering, and failure behavior.

## Procedure

1. Confirm the user asked to open a view or requested a PNG or SVG review plot.
   Do not insert an inline image preview into Analysis or add scientific vectors
   to viewer links.
2. Inspect the active OMERO group and selected Image or Plate. Never invent or
   infer an OMERO object ID from a portable database.
3. If a CI Segmentation database is involved, open it read-only, inspect its
   schema, and query `object_navigation` for the requested object.
4. Compare the database `output_store_uuid` with the UUID reported by the
   viewer capability. Stop on a mismatch. For an older database without a UUID,
   explain that identity cannot be verified automatically.
5. Use `output_resource_path`, timepoint, label storage fields, label value,
   and half-open pixel bounds from the navigation row. For point-only objects
   without bounds, create a small bounded crop around the centroid and clamp it
   to the image dimensions.
6. Use `label_sources` when the user wants the inference-origin intensity
   channel. Database channel indices and viewer `sourceChannels` are one-based.
7. Cite the successful analysis evidence ID when asking the host to render a
   plot. Preserve the active OMERO group and pass
   only validated fields from the reference.
8. Prefer one gallery request over separate per-object PNG requests.
9. Save or attach a plot only when the user requested an export. Report the
   selected field, object, channels, Z/T plane or time range, bounds, and label outline.
10. When optional CISegmentation extension rows are present, use bounded
    read-only queries for a selected track, spot, colocalisation result, or
    spatial neighbour. Confirm the viewer advertises `zarr-review-export-v1`
    before adding points or lines to an export recipe. Keep raster labels as
    the authoritative segmentation masks. For a time projection, use a bounded
    `timeProjection` range and choose `max` or `mean`; show a label outline only
    when its label value belongs to the displayed end frame.

## Safety

- Treat all navigation and rendering as read-only.
- Never use arbitrary filesystem paths, browser-internal routes, or guessed
  host tool names.
- Never bypass OMERO permissions or switch groups implicitly.
- Respect renderer bounds and channel limits; reduce the requested crop or
  channels instead of bypassing limits.
- Do not claim a plot exists until the host capability returns
  success.

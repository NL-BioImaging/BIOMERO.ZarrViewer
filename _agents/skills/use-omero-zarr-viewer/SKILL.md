---
name: use-omero-zarr-viewer
description: Open measured CI Segmentation objects in OMERO ZarrViewer and render bounded ROI PNGs through authenticated host capabilities. Use when a user asks to show a specific HCS field, focus a measured cell or other label object, select its originating image channels, highlight its label value, or save a PNG crop from an active OMERO OME-Zarr Image or Plate.
metadata:
  version: "1"
  biomero-purpose: "application-operation"
  biomero-consumers: "omero-analysis-chat"
  biomero-auto-activate: "false"
---

# Use OMERO ZarrViewer

Operate ZarrViewer only through authenticated capabilities supplied by the
consumer. The skill provides navigation knowledge, not OMERO access.

## Load the contract

Read `references/REFERENCE.md` before constructing a focused view or ROI
request. It defines coordinate conventions, database mappings, validation,
and failure behavior.

## Procedure

1. Confirm the user asked to open a view or create an ROI PNG.
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
7. Ask the host to open the focused viewer or render the PNG. Preserve the
   active OMERO group and pass only validated fields from the reference.
8. Save or attach a PNG only when the user requested an export. Report the
   selected field, object, channels, Z/T plane, bounds, and label overlay.

## Safety

- Treat all navigation and rendering as read-only.
- Never use arbitrary filesystem paths, browser-internal routes, or guessed
  host tool names.
- Never bypass OMERO permissions or switch groups implicitly.
- Respect renderer bounds and channel limits; reduce the requested crop or
  channels instead of bypassing limits.
- Do not claim a PNG or viewer state exists until the host capability returns
  success.

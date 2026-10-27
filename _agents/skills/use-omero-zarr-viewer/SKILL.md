---
name: use-omero-zarr-viewer
description: Open an active OMERO OME-Zarr Image or Plate, or render bounded PNG, SVG, or MP4 outputs with caller-supplied vectors, raster label outlines, and temporal projections.
metadata:
  version: "9"
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

1. Confirm the user asked to open a view or requested a PNG, SVG, or MP4 review output.
   Do not insert an inline image preview into Analysis or add scientific vectors
   to viewer links.
2. Inspect the active OMERO group and selected Image or Plate. Never invent or
   infer an OMERO object ID from a portable database.
3. Use the user-selected workspace Image input by its ordinary OMERO ID.
   Image and track/measurement inputs are independent; no shared UUID, workflow
   name or source/result relationship is required. Use
   `source: {kind: "image-input"}` for notebook PNG, SVG and MP4 requests.
   The host chooses the unique input or asks the user when several are selected.
   An optional actual `imageId` must belong to the selected workspace inputs.
   Establish field, crop, channels and T/Z from approved metadata; preserve the
   active group. Validate coordinate transforms and technical bounds against
   the selected image. Do not claim this proves biological correspondence.
   Legacy recipes may explicitly use `storeUuid` instead and retain UUID checks.
4. For a requested export, construct a bounded render recipe. Use raster label
   paths/values for outlines; use `vectors` for caller-supplied points or lines.
   The viewer does not require a particular measurement or tracking schema.
5. Confirm `zarr-review-export-v1` before adding vectors or a temporal
   projection. Choose `max` or `mean` over at most 32 frames, ending at the
   panel's `t`. Do not put vectors in interactive viewer links.
6. In an Analysis notebook, return `omero_analysis_render_recipe` and optional
   `omero_analysis_render_format` (`png`, `svg`, or `mp4`) in `result`. Analysis verifies
   store access and sends the authenticated render request; notebook Python does
   not contact ZarrViewer directly. See the reference for an example.
7. If data comes from CISegmentation, read its database with bounded queries;
   `object_navigation` and tracking tables can supply coordinates. Keep masks
   authoritative and use end-frame label values on temporal projections.
8. Prefer one gallery request over separate per-object PNG requests. Save or
   attach a plot only when requested, and report its field, channels, Z/T or
   time range, crop, and overlays.

## Safety

- Treat all navigation and rendering as read-only.
- Never use arbitrary filesystem paths, browser-internal routes, or guessed
  host tool names.
- Never bypass OMERO permissions or switch groups implicitly.
- Respect renderer bounds and channel limits; reduce the requested crop or
  channels instead of bypassing limits.
- Do not claim a plot exists until the host capability returns
  success.

## Temporal movies

For MP4, require `zarr-movie-v1`, add `sequence={version:1,start,end,fps:5}`
and return the existing recipe with `omero_analysis_render_format="mp4"`.
ZarrViewer renders native-pixel tiles in the browser and encodes in a worker;
no new server encoder or workflow service is needed. Defaults are 5 FPS,
2000 frames, 2048 x 2048 pixels, and 256 MiB or the smaller upload limit.
Keep acquisition timing distinct. `tracks` uses explicit caller-supplied rows
and id/x/y/t/z column mappings; missing observations remain gaps.

# Viewer guide

## Open supported data

Sign in through the NL-BIOMERO Nginx endpoint, select an eligible Image, Plate,
or Well, and choose **Open With → OME-Zarr Viewer**. The entry becomes available
from the registration metadata stored in OMERO. Full filesystem and NGFF
validation happens when the viewer opens.

Supported data includes:

- OME-Zarr images with multiscale intensity data;
- OME-Zarr HCS plates, wells, acquisitions, and fields;
- integer segmentation labels declared through NGFF label metadata;
- BIOMERO shallow results whose intensity pixels remain in a canonical store;
- Z, T, and multichannel image dimensions.

## Image controls

Each intensity channel has visibility, color, display-range, histogram, and
automatic fitting controls. The viewer starts at the middle Z plane and
supports slice, maximum, mean, and minimum projections. A bounded 3D intensity
view is available for compatible Z stacks and WebGL 2 browsers.

The navigator, physical scale bar, fullscreen control, and URL state help users
inspect and share the same view. URL state can retain the selected field,
planes, viewport, channels, labels, and focused object without exposing a
filesystem path or signed storage context.

## Labels

Label layers can be shown independently, reordered, and rendered as a fill or
outline. Each layer can keep its built-in multicolor instance palette or use
cyan, magenta, yellow, red, green, or blue. Monochrome choices are useful when
comparing two segmentation methods over the same intensity image.

Hovering the image reports the instance ID from every visible label layer under
the pointer, including overlapping labels. Outline width can be adjusted up to
20 screen pixels.

Well and Plate overview thumbnails display intensity data. Open a Field to
inspect its label overlays and controls.

## Canonical and shallow stores

For a complete OME-Zarr store, all metadata and chunks resolve below that
store. For a BIOMERO shallow result, the viewer validates the shallow manifest,
reads intensity pixels and plate metadata from the canonical source, and routes
retained label paths to the shallow result. This keeps split labels aligned with
their original pixels without copying the intensity pyramid.

Managed locators are resolved through the trusted BIOMERO group mapping. Both
canonical and shallow paths must remain below the configured read-only mount.
Missing, ambiguous, or unsafe routes are rejected.

## Current limits

- The viewer is read-only and does not edit labels or OMERO annotations.
- Three-dimensional rendering displays intensity channels; labels remain in
  the two-dimensional field view.
- Well and Plate overviews use intensity thumbnails; label inspection begins
  after opening a Field.
- Volume loading is bounded by browser and GPU limits and is not an out-of-core
  renderer.
- An outline segment can be absent where an instance boundary falls exactly on
  a label tile seam because a tile shader cannot sample its neighboring tile.

## Troubleshooting

If **Open With** remains disabled, confirm that the selected object is readable
and carries one unambiguous BIOMERO registration. If the viewer opens but shows
**Failed to fetch**, confirm that the browser uses the Nginx endpoint and that
OMERO.web and Nginx mount the same store with the same relative directory tree.

Administrators can continue with the
[NL-BIOMERO deployment and verification guide](deployment-nl-biomero.md).

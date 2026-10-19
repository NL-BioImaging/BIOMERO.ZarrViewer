# BIOMERO OME-Zarr Viewer

<img src="https://raw.githubusercontent.com/NL-BioImaging/BIOMERO.ZarrViewer/main/docs/assets/biomero-logo.svg" alt="BIOMERO" height="28">

Explore OME-Zarr images and segmentation results directly from OMERO.web.
BIOMERO ZarrViewer is a read-only viewer for multichannel images, Z stacks,
time series and high-content screening plates.

## Open your data

In OMERO.web, select a registered OME-Zarr **Image**, **Plate** or **Well**, then
choose **Open With → OME-Zarr Viewer**. Your existing OMERO permissions apply.
The viewer needs an existing OME-Zarr store; it does not convert ordinary OMERO images.

## Explore the image

- **2D:** pan, zoom, navigate Z and time, and compare maximum, mean or minimum projections.
- **Channels:** toggle individual channels or the whole group, choose colors,
  adjust contrast, and inspect intensity histograms.
- **Labels:** compare segmentation layers with colors, opacity, fills and
  outlines; inspect object IDs in 2D.
- **3D:** use **Neuroglancer** (default) for images with label surfaces, or
  **Viv** for intensity volumes. Select resolution quality, display blending,
  and intensity brightness while keeping physical XYZ proportions. Volume, Slice
  and Orthogonal layouts are available in both engines.
- **Navigation:** explore fields, wells and plates; use the 2D navigator,
  calibrated scale bars, Fit, native-pixel 1:1 zoom, fullscreen and the 3D reset control.
  Image cursors show zoom, pan, rotation or slice/depth movement as controls change.
- **Share and export:** copy the viewer URL, save focused ROI images, or export
  2D sequences or rendered 3D views as MP4 movies in a supported browser.

Click **Help** in the top toolbar for the searchable viewer guide. The help
window can be moved and resized while you inspect the image.

## Documentation

| For | Guide |
| --- | --- |
| Viewer users | [Viewer guide](https://github.com/NL-BioImaging/BIOMERO.ZarrViewer/blob/main/docs/viewer-guide.md) · [Movies](https://github.com/NL-BioImaging/BIOMERO.ZarrViewer/blob/main/docs/movies.md) |
| Administrators | [Installation](https://github.com/NL-BioImaging/BIOMERO.ZarrViewer/blob/main/docs/installation.md) · [Configuration and cache](https://github.com/NL-BioImaging/BIOMERO.ZarrViewer/blob/main/docs/configuration.md) |
| Deployment | [NL-BIOMERO](https://github.com/NL-BioImaging/BIOMERO.ZarrViewer/blob/main/docs/deployment-nl-biomero.md) · [OMERO deployment kit](https://github.com/NL-BioImaging/BIOMERO.ZarrViewer/blob/main/docs/deployment-omero-deployment-kit.md) |
| Data providers | [Supported data and OMERO registration](https://github.com/NL-BioImaging/BIOMERO.ZarrViewer/blob/main/docs/data-and-registration.md) |
| Developers | [Development](https://github.com/NL-BioImaging/BIOMERO.ZarrViewer/blob/main/docs/development.md) · [API and integrations](https://github.com/NL-BioImaging/BIOMERO.ZarrViewer/blob/main/docs/api.md) · [Compatibility checks](https://github.com/NL-BioImaging/BIOMERO.ZarrViewer/blob/main/docs/compatibility-spike.md) |

Part of [BIOMERO](https://nl-bioimaging.github.io/NL-BIOMERO/).
The [published documentation](https://nl-bioimaging.github.io/BIOMERO.ZarrViewer/)
and guide links track the main branch. For the current candidate, use the
in-app Help or the guides in this branch.

## License and source

Copyright (C) 2026 NL-BioImaging contributors. Licensed under
[AGPL-3.0-or-later](https://github.com/NL-BioImaging/BIOMERO.ZarrViewer/blob/main/LICENSE). See [NOTICE](https://github.com/NL-BioImaging/BIOMERO.ZarrViewer/blob/main/NOTICE),
[third-party notices](https://github.com/NL-BioImaging/BIOMERO.ZarrViewer/blob/main/THIRD_PARTY_NOTICES.md) and
[source provenance](https://github.com/NL-BioImaging/BIOMERO.ZarrViewer/blob/main/docs/open-source-provenance.md).

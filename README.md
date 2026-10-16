# <img src="docs/assets/biomero-logo.svg" alt="BIOMERO" height="28" style="height:28px; width:auto; vertical-align:middle;"
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
  background and intensity brightness while keeping physical XYZ proportions.
- **Navigation:** explore fields, wells and plates; use the 2D navigator,
  calibrated scale bars, fullscreen and the 3D reset control.
- **Share and export:** copy the viewer URL, save focused ROI images, or export
  2D time sequences as MP4 movies in a supported browser.

Click **Help** beside Fullscreen for the searchable viewer guide. The help
window can be moved and resized while you inspect the image.

## Documentation

| For | Guide |
| --- | --- |
| Viewer users | [Viewer guide](docs/viewer-guide.md) · [Movies](docs/movies.md) |
| Administrators | [Installation](docs/installation.md) · [Configuration and cache](docs/configuration.md) |
| Deployment | [NL-BIOMERO](docs/deployment-nl-biomero.md) · [OMERO deployment kit](docs/deployment-omero-deployment-kit.md) |
| Data providers | [Supported data and OMERO registration](docs/data-and-registration.md) |
| Developers | [Development](docs/development.md) · [API and integrations](docs/api.md) · [Compatibility checks](docs/compatibility-spike.md) |

Part of [BIOMERO](https://nl-bioimaging.github.io/NL-BIOMERO/).
The [published documentation](https://nl-bioimaging.github.io/BIOMERO.ZarrViewer/)
tracks the main branch; the guides above describe this checkout.

## License and source

Copyright (C) 2026 NL-BioImaging contributors. Licensed under
[AGPL-3.0-or-later](LICENSE). See [NOTICE](NOTICE),
[third-party notices](THIRD_PARTY_NOTICES.md) and
[source provenance](docs/open-source-provenance.md).

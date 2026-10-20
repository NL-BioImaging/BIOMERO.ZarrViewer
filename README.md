# BIOMERO OME-Zarr Viewer

<img src="https://raw.githubusercontent.com/NL-BioImaging/BIOMERO.ZarrViewer/main/docs/assets/biomero-logo.svg" alt="BIOMERO" height="28">

Explore OME-Zarr images and segmentation results directly from OMERO.web.
BIOMERO ZarrViewer is a read-only viewer for multichannel images, Z stacks,
time series and high-content screening plates. It works with standalone OMERO
and with BIOMERO deployments.

## Open your data

In OMERO.web, select a registered OME-Zarr **Image**, **Plate** or **Well**, then
choose **Open With → OME-Zarr Viewer**. Your existing OMERO permissions apply.
Physical OME-Zarr 0.4/0.5 stores can be registered with standard
`omero zarr import` / `ExternalInfo`, without extra BIOMERO annotations.
With the optional `omero-web-zarr` integration enabled, ordinary OMERO images
such as TIFFs can also be opened as virtual OME-Zarr 0.4, without a full export.

## Installation options

### Standalone OMERO

BIOMERO, Slurm and OMERO.Analysis are not required. The
[standalone Docker recipe](https://github.com/NL-BioImaging/BIOMERO.ZarrViewer/blob/0.8.1-beta-standalone/docker/Dockerfile.standalone)
uses an official OMERO.web image pinned by digest and tested runtime constraints.
The default build installs the viewer for physical OME-Zarr 0.4/0.5, with the
shared data mount and authenticated Nginx route described in the
[build and installation instructions](https://github.com/NL-BioImaging/BIOMERO.ZarrViewer/blob/0.8.1-beta-standalone/docs/http-zarr.md#reproduce-the-standalone-docker-installation).
See [OMERO source registration](https://github.com/NL-BioImaging/BIOMERO.ZarrViewer/blob/0.8.1-beta-standalone/docs/data-and-registration.md#standard-omero-cli-zarr-imports)
for linking the physical store to its OMERO Image.

### Optional omero-web-zarr

Build with `ENABLE_HTTP_ZARR=true` to also install and enable the optional
provider from the [NL-BioImaging performance fork](https://github.com/NL-BioImaging/omero-web-zarr).
The recipe pins a fork commit and verifies its archive checksum.
Ordinary OMERO images are then served on demand as virtual OME-Zarr 0.4,
using the existing OMERO permissions. Virtual sources use Viv for 3D viewing.
See the [HTTP Zarr guide](https://github.com/NL-BioImaging/BIOMERO.ZarrViewer/blob/0.8.1-beta-standalone/docs/http-zarr.md).

The provider is disabled by default and is not a required viewer dependency.
Physical OME-Zarr and BIOMERO continue working when it is absent.

### Existing BIOMERO deployments

Existing imports, HCS plates and shallow segmentation results remain supported.
Their physical-store registrations keep precedence over the optional HTTP
provider. Follow the
[NL-BIOMERO deployment guide](https://github.com/NL-BioImaging/BIOMERO.ZarrViewer/blob/main/docs/deployment-nl-biomero.md)
for integrated installation.

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

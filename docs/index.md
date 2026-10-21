# BIOMERO OME-Zarr Viewer

Explore OME-Zarr images, segmentation labels, Z stacks, time series and plates
from OMERO.web. The viewer works with **standalone OMERO and BIOMERO**.
Use Neuroglancer for streamed 3D images and physical label surfaces, or Viv for
intensity volumes; both support Volume, Slice, Orthogonal and clipping views.

**Stable release: [0.8.1](release-0.8.1.md)**, based on the validated 0.8.1b14 candidate.
See [installation](installation.md) for the package and Docker deployment options.

## Start viewing

Select a registered OME-Zarr Image, Plate or Well and choose **Open With ? OME-Zarr Viewer**.
Standard ExternalInfo/OMERO CLI Zarr registrations do not require a BIOMERO annotation.
With the optional [HTTP-Zarr provider](http-zarr.md), ordinary OMERO TIFF/SVS images
can also be opened without exporting a complete physical Zarr store first.

Read the [viewer guide](viewer-guide.md), also available from the viewer's Help
button, for channels, labels, Fit and 1:1 zoom, navigation, 3D controls and sharing.
See [movie playback and export](movies.md) for temporal data and
[large volumes and memory](large-volumes.md) for streaming, memory budgets,
sharded 2D tile reads and bounded high-resolution loading.

## Administration

- [Installation](installation.md) and [configuration](configuration.md)
- [Standalone Docker and optional HTTP-Zarr](http-zarr.md)
- [NL-BIOMERO deployment](deployment-nl-biomero.md)
- [OMERO deployment kit](deployment-omero-deployment-kit.md)
- [Supported data and OMERO registration](data-and-registration.md)

The viewer remains read-only and uses OMERO permissions. Physical OME-Zarr
0.4/0.5 stores must be registered and mounted for authenticated access. The
optional HTTP provider serves conventional OMERO pixels on demand; it is not
required for physical OME-Zarr or BIOMERO sources. The viewer does not import
images or edit segmentations.

## Development

- [Release 0.8.1](release-0.8.1.md)
- [Build and test](development.md)
- [API and integrations](api.md)
- [Compatibility checks](compatibility-spike.md)
- [Open-source provenance](open-source-provenance.md)

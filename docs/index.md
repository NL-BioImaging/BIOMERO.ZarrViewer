# BIOMERO OME-Zarr Viewer

Explore OME-Zarr images, segmentation labels, Z stacks, time series and plates
from OMERO.web. View images in 2D, combine image volumes and label surfaces in
Neuroglancer 3D, or choose Viv for intensity-only 3D rendering.

## Start viewing

Select an OME-Zarr Image, Plate or Well and choose **Open With → OME-Zarr Viewer**.
Read the [viewer guide](viewer-guide.md), also available from the viewer's Help
button, for channels, labels, navigation, 3D controls and sharing.
See [movie playback and export](movies.md) for temporal data.

## Administration

- [Installation](installation.md) and [configuration](configuration.md)
- [NL-BIOMERO deployment](deployment-nl-biomero.md)
- [OMERO deployment kit](deployment-omero-deployment-kit.md)
- [Supported data and OMERO registration](data-and-registration.md)

The viewer is read-only and uses OMERO permissions. It requires an existing
registered OME-Zarr store; it does not import images or edit segmentations.

## Development

- [Build and test](development.md)
- [API and integrations](api.md)
- [Compatibility checks](compatibility-spike.md)
- [Open-source provenance](open-source-provenance.md)

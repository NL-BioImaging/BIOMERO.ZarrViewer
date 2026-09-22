# BIOMERO OME-Zarr Viewer

![BIOMERO leaf-circuit icon](assets/biomero-logo.svg){ width="72" }

BIOMERO OME-Zarr Viewer is the read-only OME-Zarr viewer for the
[BIOMERO ecosystem](https://github.com/NL-BioImaging). It opens physical
OME-Zarr images and HCS plates registered in OMERO, with multichannel display,
Z/T navigation, label overlays, and Field, Well, and Plate navigation.

!!! important "Part of NL-BIOMERO"

    Use [NL-BIOMERO](https://nl-bioimaging.github.io/NL-BIOMERO/) for the
    complete deployment. It supplies OMERO, the viewer package, feature
    registration, shared storage, and the authenticated Nginx route required
    to deliver Zarr metadata and chunks. Installing the viewer package alone
    does not create a standalone application.

## Start here

- **Users:** read the [viewer guide](viewer-guide.md) for supported objects,
  label controls, shallow-Zarr behavior, and current limitations.
- **NL-BIOMERO administrators:** use the
  [integrated deployment guide](deployment-nl-biomero.md).
- **Custom OMERO administrators:** use the
  [OMERO deployment-kit guide](deployment-omero-deployment-kit.md) as the
  reference integration.
- **Maintainers:** review the
  [compatibility matrix](compatibility-spike.md) and
  [open-source provenance](open-source-provenance.md).

## What the viewer does

The viewer resolves an OMERO Image, Plate, or Well to one authorized physical
OME-Zarr store. For a BIOMERO shallow result, it combines canonical intensity
pixels with the retained label paths from the shallow store. The browser sees
one logical dataset, while OMERO permissions and short-lived signed contexts
authorize every metadata and chunk request.

The viewer does not import data, convert conventional OMERO pixels to Zarr, or
edit segmentations. BIOMERO or another compatible importer must create and
register the physical store first.

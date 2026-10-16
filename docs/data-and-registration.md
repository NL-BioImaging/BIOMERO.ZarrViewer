# Data and OMERO registration

## Is BIOMERO required?

BIOMERO is not installed as a Python dependency of this viewer. It normally
runs earlier in the workflow as the importer that creates or preserves the
OME-Zarr store and registers where that store belongs in OMERO.

| Component | Responsibility |
| --- | --- |
| BIOMERO or another importer | Create/import the physical OME-Zarr and associate it with OMERO |
| OMERO | Users, groups, permissions, Images, Plates, and provenance |
| BIOMERO OME-Zarr Viewer | Validate access, interpret NGFF metadata, and render the data |
| Nginx | Serve only the files authorized by the viewer |

The viewer can locate a store in either of these ways:

1. the readable OMERO Image has a Fileset/OriginalFile path inside a `.zarr`
   directory; or
2. the Image or its readable Dataset/Plate/Screen ancestry has a structured
   `biomero.import` map annotation containing `UUID`, `Filepath`,
   `DestinationType`, and `Files`.
3. a readable Plate has a BIOMERO schema-2 `biomero.zarr.plate-source`
   annotation that identifies its canonical managed OME-Zarr store.

The BIOMERO importer produces the second form for in-place imports, including
plate imports whose individual OMERO Images are named with NGFF field paths
such as `A/1/0`.

For preprocessed imports, `Imported_from` in the same structured `biomero.import`
annotation identifies the imported OME-Zarr while `Filepath` may still point at
an original `experiment.db`. The same access and storage-root checks apply.
Opening a Plate starts in Plate overview at the first populated well in physical
row/column order; Image and explicit field links retain their selected field.

### Canonical and shallow BIOMERO stores

The viewer reconstructs BIOMERO RFC-8 shallow results as one logical store.
Intensity pixels and plate metadata come from the canonical source recorded in
`.biomero-shallow.json`; label subtrees retained in the shallow result remain
at their result paths. This permits labels such as
`A/1/0/labels/labels_nuclei` to be displayed over canonical `A/1/0` pixels
without copying the intensity pyramid.

Managed locators such as `group-3-data` are resolved only through the trusted
BIOMERO group mapping. Set `OMERO_BIOMERO_GROUP_MAPPINGS_FILE` to the JSON
mapping used by the importer, or set `OMERO_BIOMERO_CONFIG_FILE` to a BIOMERO
configuration containing `group_mappings`. Both the canonical store and every
declared label route must resolve below `mount_root`; unsafe, missing, invalid,
or ambiguous routes are rejected. Existing complete OME-Zarr stores continue
to use the Fileset and `biomero.import` resolution paths unchanged.

Another importer can therefore be used, but it must provide one of those
links. Its recorded store path must be below `source_root`, and the matching
store must exist below `mount_root`.

### OME-Zarr metadata requirements

BIOMERO provenance tells the viewer where the store is; the actual image,
channel, label, and plate descriptions come from standard OME-NGFF metadata
inside the store.

Supported data:

- OME-Zarr 0.4 with Zarr v2;
- OME-Zarr 0.5 with Zarr v3;
- multiscale images with declared axes and datasets;
- HCS plates with plate, well, acquisition, and field metadata;
- labels declared through the NGFF label group and stored as integer arrays.

Channel names, colors, and display windows are read from NGFF `omero`
metadata when present. Missing or incomplete values receive safe viewer
defaults. The viewer does not repair malformed metadata or generate an
OME-Zarr store from conventional OMERO pixels.

## Relationship to `ome/omero-web-zarr`

[`ome/omero-web-zarr`](https://github.com/ome/omero-web-zarr) presents
conventional OMERO-managed pixels through a virtual OME-Zarr hierarchy. It
reads pixels through OMERO and serializes requested chunks in Python.

This project serves an existing physical OME-Zarr store, including NGFF 0.5,
labels, and HCS metadata. OMERO authorizes access, but Nginx serves the stored
bytes directly. `ome/omero-web-zarr` is therefore complementary rather than a
dependency of this viewer.

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

The viewer can locate a store through these registrations:

1. the readable OMERO Image has a Fileset/OriginalFile path inside a `.zarr`
   directory; or
2. the Image or its readable Dataset/Plate/Screen ancestry has a structured
   `biomero.import` map annotation containing `UUID`, `Filepath`,
   `DestinationType`, and `Files`.
3. a readable Plate has a BIOMERO schema-2 `biomero.zarr.plate-source`
   annotation that identifies its canonical managed OME-Zarr store.
4. the readable Image has a standard OMERO Zarr Pixel Buffer `ExternalInfo`
   registration pointing to a local multiscale group, as described below.

With the optional [omero-web-zarr integration](http-zarr.md) explicitly enabled,
ordinary readable OMERO Images can also use a virtual HTTP OME-Zarr 0.4 source.
That fallback needs no source annotation and does not change the precedence
of these physical registrations. The optional dependency may be absent.

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

### Standard OMERO CLI Zarr imports

Images imported with `omero zarr import /data/sample.ome.zarr` need no
BIOMERO annotation. The viewer also accepts the standard OMERO Zarr Pixel
Buffer `Image.details.externalInfo` registration:

- `entityType`: `com.glencoesoftware.ngff:multiscales`;
- `entityId`: `3` or `4`;
- `lsid`: the absolute server path of the multiscale image group.

The group may be the store root or a nested image such as
`/data/plate.ome.zarr/B/2/0`; a `.zarr` filename extension is not required.
The source/mount root mapping applies to the complete group path. Signed
reads are restricted to that group, not its parent store or sibling images.
Image, Plate and Well Open With eligibility recognizes this registration
without inspecting files on disk. Plate and Well links resolve through a
readable field image; ExternalInfo alone does not describe a plate overview.

Only local filesystem paths below `source_root` are supported. HTTP, S3 and
`file:` URLs are not fetched by this viewer. A local registration must be
visible to OMERO.web and read-only to Nginx below `mount_root`; missing stores,
path traversal and symlinks escaping that mount are rejected. An unloaded
ExternalInfo is fetched through its readable Image in the active OMERO group.

Existing Fileset, `biomero.import`, canonical and shallow BIOMERO registrations
keep their existing precedence and behavior. ExternalInfo is a fallback when
none of those registrations selects a store, so it does not bypass shallow
label routing or an invalid BIOMERO manifest.

Another importer can therefore be used, but it must provide one of those
links. Its recorded store path must be below `source_root`, and the matching
store must exist below `mount_root`.

### OME-Zarr metadata requirements

OMERO registration tells the viewer where the store is; the actual image,
channel, label, and plate descriptions come from standard OME-NGFF metadata
inside the store.

Supported data:

- OME-Zarr 0.4 with Zarr v2;
- OME-Zarr 0.5 with Zarr v3;
- multiscale images with declared axes and datasets;
- HCS plates with plate, well, acquisition, and field metadata;
- labels declared through the NGFF label group and stored as integer arrays.

Server-side reading of Zarr v3 arrays requires Zarr-Python 3. Use Python 3.12
for that deployment; Python 3.10 uses the Zarr-Python 2 backend. See
[installation](installation.md).

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

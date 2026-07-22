# OMERO-Vitessce compatibility spike

The production viewer does not depend on Vitessce. The spike is retained as a
deployment validation checklist because it requires the target OMERO session,
mounted BIOMERO stores, and representative institutional data.

## Static findings

- Viv 0.22 exposes modern `loadOmeZarr`/`loadOmeZarrFromStore` loaders and uses
  Zarrita-compatible readable stores.
- Vitessce's bitmask implementation confirms nearest-neighbour integer mask
  rendering on top of Viv layers, but its explicit per-object color textures
  grow with label cardinality.
- This viewer instead uses a Viv shader extension with an integer hash, so
  normal rendering has constant client memory relative to the number of IDs.
- The viewer accepts OME-Zarr 0.4/Zarr v2 and OME-Zarr 0.5/Zarr v3 through
  distinct backend metadata adapters and shared normalized frontend state.

## Local OMERO.web integration check

On 2026-07-22 the wheel was installed into the local NL-BIOMERO OMERO.web
container and Nginx was placed in front of Gunicorn. The authenticated host
route loaded the production React bundle and the packaged Open With entry was
verified against Image 539. BIOMERO had removed the `.ome.zarr` suffix from
the OMERO Image name and recorded the source in a `biomero.import` annotation;
the provenance fallback resolved it as OME-Zarr 0.4/Zarr v2 and the
asynchronous menu check enabled the entry. Nginx served image and label chunks
successfully through authenticated `/data/images/539/...` requests, and a
direct request to the internal storage location returned 404. A Viv 0.22
shader incompatibility exposed by the first successful chunk load was fixed by
using screen-space derivatives for label outlines instead of referencing Viv's
private channel sampler declaration.

## Required live matrix before release

Run each row first in OMERO-Vitessce as a reference and then in this viewer:

| Store | Image | Labels | Plate navigation | Result |
|---|---|---|---|---|
| 0.4 / Zarr v2 | multiscale C/Z/T | multiple integer labels | n/a | pending deployment |
| 0.4 / Zarr v2 | HCS field | field labels | sparse wells/FOVs | pending deployment |
| 0.5 / Zarr v3 | multiscale C/Z/T | multiple integer labels | n/a | pending deployment |
| 0.5 / Zarr v3 | HCS field | field labels | sparse wells/FOVs | pending deployment |

For each row verify authenticated metadata/chunk requests, default channel
rendering, zero-background transparency, hover/click IDs, outline mode, deep
links, and session-context refresh. Record fixture identifiers and screenshots
in the deployment's validation report; do not commit patient or unpublished
data to this repository.

# Release 0.8.1

Stable release based on the validated 0.8.1b14 candidate (`3394786`).

## Changes since 0.8.0

- Standalone OMERO supports standard ExternalInfo/OMERO CLI Zarr registrations
  without a BIOMERO annotation. BIOMERO and HCS/shallow registrations remain supported.
- Optional authenticated omero-web-zarr support opens ordinary TIFF/SVS images in
  Viv and Neuroglancer. Physical OME-Zarr 0.4/0.5 remains supported without that provider.
  Virtual sources default to 0.4, with optional unsharded 0.5.
- Reproducible standalone and BIOMERO Docker recipes pin the optional NL-BioImaging
  provider fork by commit and archive checksum.
- Faster large-image and confocal loading, shared MIP/projection caches and progress,
  native non-binary pyramid handling, and bounded transfer concurrency.
- Large physical stores with small chunks use exact server-side 2D plane tiles.
  Large v3 Neuroglancer sources use larger decoded blocks and validate requested
  paths without a store-wide preparation walk. Sharded range reads avoid reproduced
  Chrome disk-cache failures and retain cancellation/retry isolation.
- Neuroglancer retains caches across 2D/3D switches; Viv retains multiple volume
  channels within a bounded CPU cache. Stream progress appears at the bottom.
- Both engines support clipping planes, right-drag panning and linked Volume,
  Slice and Orthogonal navigation. Clipping rows are compact and show plane numbers.
- Browser memory controls support estimated or manually selected GPU VRAM and
  persistent 100/200/500 MiB or 75% budgets. Above-budget Neuroglancer quality levels
  require explicit selection and display a warning. These are not free-VRAM measurements.
- Initial HTTP auto contrast, stable contrast during playback, cancellable movie
  export and an icon-only export button.
- Updated Viv/Deck.gl and Vite; browser-unused vulnerable CLI dependencies removed.

## Validation and limits

Candidate CI passed on Python 3.10/3.12, frontend tests/build/audit, strict docs,
Chrome movie/section/clipping acceptance and distribution checks. Local candidate
checks passed 256 frontend tests and 261 backend tests (three expected format skips),
plus Zarr-Python 2 compatibility checks and both Docker stacks.

The local astrocyte viewport test received its detail tiles in about seven seconds;
Neuroglancer level 2 was probed for six seconds and showed partial content. A complete
high-resolution volume was deliberately not loaded. These timings are observations
on one workstation, not performance guarantees. See [large volumes](large-volumes.md).

The GitHub release workflow derives version 0.8.1 from `v0.8.1`, rebuilds and verifies
both distributions, then publishes the package through the existing PyPI Trusted Publisher.

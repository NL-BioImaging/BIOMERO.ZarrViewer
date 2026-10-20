# OMERO.web Zarr performance variant

The provider source is maintained in the separate
[`NL-BioImaging/omero-web-zarr`](https://github.com/NL-BioImaging/omero-web-zarr)
fork, derived from upstream commit `4e1e685dff22136abfd2626f6fd6eaf985aba368`.
It retains the upstream AGPL-3.0 copyright and license notice.

The installer pins fork commit `91d7f97abaeab5abe9b64e0db4343b7a7e12ca59`
and verifies archive SHA-256
`2c34a5e1c48bd1fd816340aee98dc807db4ab765ee8bbbc9866cf523fcdaea21`.
It installs that source directly; no replacement views file is kept here.
Other upstream modules and routes are retained.
Installation remains opt-in through `ENABLE_HTTP_ZARR=true`.

The changes are:

* Generate Zarr v2 array metadata directly and encode lossless Zstd level-1
  chunks with Numcodecs, avoiding temporary Zarr directories and file reads.
  Entirely black chunks are encoded explicitly.
* Use a single RawPixelsStore per chunk, explicitly selecting its native
  pyramid resolution and closing it on success or failure. Network-order pixel
  bytes are converted to the advertised dtype before encoding.
* Group up to eight Z planes in a chunk, targeting 2 MiB, and bound XY chunks
  to 1024 pixels. Edge chunks are zero padded. T and C chunks stay at one.
* Allow trusted in-process callers to supply their already checked Image,
  array metadata and native resolution. Ordinary authenticated HTTP routes
  still look up their own image and metadata.
* Close rendering engines created during metadata requests. The viewer also
  retains its cleanup wrapper for compatibility with the unmodified provider.

`CHUNK_METADATA_API=1` advertises the internal fast path. `OPTIMIZED_LAYOUT`
versions the virtual chunk layout and is included in signed viewer contexts.
Change that identifier when changing how chunk coordinates address pixels.

`check-http-zarr.py` exercises the actual installed functions with black data,
uint16 values, grouped T/C/Z dimensions, partial edge chunks and multiple native
pyramid levels. It compares decoded chunks with all original pixels and checks
that readers are closed. CI runs it inside the built optional-provider image.

The viewer supplies absolute physical calibration from OMERO, retains its
normal image permission checks, and uses the provider only when installed,
registered and explicitly enabled. Physical OME-Zarr 0.4/0.5 and BIOMERO
registrations retain priority and use their existing filesystem reader.

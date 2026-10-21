# Viv, WSI and direct OME-Zarr performance

Viewer 0.8.1b9 coalesces decoded intensity chunks in a private 64 MiB LRU cache
with a 60-second lifetime. Array, chunk coordinates, current source binding and
authenticated read context distinguish entries. Cancellation and failed loads
cannot poison a subsequent read. Cache identities use a revision counter so
large signed BIOMERO route contexts are not serialized for every tile.

Both direct OME-Zarr 0.4/0.5 and virtual HTTP sources use this decoded cache.
Physical stores keep their existing Nginx data transport and quota-managed
server volume service. NGFF labels retain their original reading path.

Small virtual Z stacks (up to 64 MiB across their channels at one timepoint)
load each source chunk once in a bulk Z read. MIP and Viv 3D reuse the result
instead of repeatedly decoding the same multi-plane chunks. Larger stacks
retain bounded streaming. Min/max projections keep a native pixel-type
accumulator; means retain Float64 accumulation to avoid integer overflow.
For uint8 this reduces temporary accumulator memory by eight times without
changing the output values or input buffers.

## Large virtual 2D images

Large ordinary 2D images with at most four channels advertise an optional
authenticated `native_samples_url`. The server reuses one OMERO pixel reader
to collect the **same native-resolution sample values** as the original
frontend sampler: at most 16 distributed tiles and 262,144 samples per channel,
with the same spatial coordinates, stride, ordering and finite-value filter.
It avoids encoding, transferring and decoding full tiles solely for statistics.
The frontend retains Viv's existing percentile, histogram and contrast logic.
The service never caches or exports a full WSI and always closes its reader.

The GET request carries the ordinary signed read-context header and supplies
`channels`, `t`, and `tile_size` (at most 1024). Access and the selected provider
layout are rechecked for each request. Its private, non-cacheable binary response
contains a little-endian uint32 JSON-header length, UTF-8 JSON describing dtype
and channel sample counts, followed by concatenated little-endian samples.
The payload is bounded by four channels × 262,144 samples × eight bytes.
Physical stores, small images, Z stacks and older configurations without this
capability retain the existing sampler.

## Clipping and navigation validation

The collapsed **Clipping planes** panel is available only in Volume layout.
Its X/Y/Z bounds, per-axis resets and shared links work in both engines.
Viv uses its native clipping-plane API. Neuroglancer uses shader controls for
intensities and a pinned shader-builder adapter for mesh fragments, preserving
its existing mesh loading, lighting, picking and geometry caches. Moving a
clipping slider changes uniforms without reloading pixels or source meshes.
Slice/Orthogonal layouts ignore clipping; returning to Volume restores it.

Two small synthetic calibrated datasets with label objects and a nonzero
origin were added only to the standalone lab, in physical 0.4 and 0.5 formats.
Both engines were checked with these and the ordinary confocal TIFF. The checks
cover clipping, resets, hidden controls in Slice layout, preserved bounds when
switching engines, and right-button panning. Neuroglancer mesh screenshots
confirm that excluded objects disappear along with the intensity volume.

Both engines now use right-drag for panning. Viv's volume center is allowed to
move with the controlled camera instead of being fixed to its initial target.
Its flat views also accept right-drag, and the cursor follows the actual binding.

## Local measurements

Three fresh Chrome browser contexts per case, 1440 × 1000 viewport, on the same
Windows Docker Desktop host. Login is excluded. HTTP measurements wait for Ready,
completed projection and 650 ms with no outstanding data requests. Direct-store
measurements use Playwright's 500 ms network-idle wait in both versions. OS and
server caches were not cleared. Headless Chrome uses SwiftShader: these measure
loading and initial computation, not hardware GPU frame rate or cold-disk speed.

The optional provider remains pinned to
`3afc184a9c3dcab090bd4a92effcf5e45ae4c864`; BIOMERO uses virtual NGFF 0.4 and
standalone uses virtual NGFF 0.5. Only the web viewer was updated, from b8 to b9.
The other BIOMERO services and original image files were retained.

| Case | b8 median | b9 median | Initial pixel-chunk requests, b8 → b9 |
| --- | ---: | ---: | ---: |
| BIOMERO confocal TIFF MIP | 4.285 s | 3.932 s | 15 → 15 |
| Standalone confocal TIFF MIP | 2.739 s | 2.546 s | 15 → 15 |
| BIOMERO SVS initial view | 10.751 s | 5.847 s | 75 → 27 |
| Standalone SVS initial view | 6.985 s | 4.181 s | 75 → 27 |
| Physical NGFF 0.4 MIP, standalone | 1.428 s | 1.442 s | 40 → 20 |
| Physical NGFF 0.5 MIP, standalone | 1.604 s | 1.625 s | 40 → 20 |
| Physical NGFF 0.4 large slice, BIOMERO | 2.383 s | 2.200 s | 46 → 29 |

SVS adds one bounded native-sample request in b9 in place of the 48 full tiles
previously fetched only for statistics. The three AUTO lower limits remain
32, 13 and 40, with upper limits 255. The direct routes now perform fewer reads,
but the small physical MIP fixture has no measured latency improvement; its
roughly 1% difference is too small to interpret from three trials.

The confocal MIP gains another 7–8% over the already optimized b8 path, with
the same 15 transported chunks. Native 1:1 SVS timings and every individual
trial are included in the [sanitized raw measurements](assets/viv-wsi-performance-20261021.json).
These results do not establish that all storage layouts or compression codecs
are optimal.

## Regression coverage

The frontend suite passes 239 tests. The backend suite passes 237 tests with
Zarr-Python 3 (two skips), and 202 with Zarr-Python 2 (37 format-related skips).
Real Zarr 2 and 3 decoder fixtures compare full volumes, planes and projections,
including multi-channel/time selections, cancellation, retries and edge chunks.
Native-sample tests compare exact sample values, order and bounds with the old
tile sampler and verify authentication and reader cleanup.

Live checks compare all 36 confocal Z planes in all three channels with original
OMERO pixels in both stacks, retaining physical calibration. Physical 0.4/0.5
source blocks and the BIOMERO shallow image's 2D ROI and three label layers also
pass. The shallow image has no calibrated Z; its existing 3D calibration guard
remains in force. Browser checks cover both 3D engines, each clipping axis,
resets, engine switching, Slice visibility and right-drag in 3D and Viv 2D.
Empty clipping ranges leave an empty volume in both engines; the HTML scale bar
is excluded from that screenshot pixel check.

The 200 MiB raw-volume limit is unchanged. Faster reads alone do not establish
that larger allocations are safe, and WebGL does not expose reliable free VRAM.

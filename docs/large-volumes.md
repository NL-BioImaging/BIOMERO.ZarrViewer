# Large volumes and browser caches

Neuroglancer and Viv have different volume-loading models. Their memory figures
are estimates or engine cache accounting, never a measurement of free VRAM.

## Engine guidance

[Neuroglancer's API](https://neuroglancer-docs.web.app/json/api/index.html)
provides separate `gpuMemoryLimit`, `systemMemoryLimit`, `concurrentDownloads`
and adaptive `prefetch` controls. It loads chunks and can display a volume whose
full uncompressed size exceeds its resident cache. A ready **view** does not mean
that the complete dataset has downloaded. The viewer reports queued/downloading
chunks and allocated GPU chunk bytes separately while further detail loads.

[Viv's volume loader](https://github.com/hms-dbmi/viv/blob/main/packages/layers/src/volume-layer/utils.js)
assembles a contiguous volume per channel. Its
[3D layer](https://github.com/hms-dbmi/viv/blob/main/packages/layers/src/xr-3d-layer/xr-3d-layer.js)
converts data to Float32 textures. For uint16, the full texture estimate is twice
the uncompressed source size, before other GPU allocations. Whole-volume texture
dimension limits still apply to Viv.

**Quality** therefore shows full typed data size for streamed Neuroglancer sources
and estimated full GPU texture size for Viv. Neuroglancer permits manually
selecting an above-budget level, with an explicit slow-loading/crash warning;
automatic selection stays within budget. A higher level number is coarser.

Chrome's per-tab GPU column is not a reliable total for a volume: Chrome also uses
a shared GPU process. Windows Task Manager includes allocations beyond this
viewer. Neither number is directly comparable to the full-level estimate. See
[Chromium's GPU architecture](https://www.chromium.org/developers/design-documents/gpu-accelerated-compositing-in-chrome/).

## Cache lifetime and loading feedback

Switching between 2D and Neuroglancer retains the existing scene and its CPU/GPU
chunk caches. New downloads and prefetching pause while that scene is hidden.
Returning restores the current navigation; changing source/field or switching to
Viv disposes the scene. Retention uses memory, and cache eviction can still require
new downloads. A page reload discards these in-memory caches.

Viv's packed-volume cache follows the selected budget, capped at 1 GiB of CPU
memory. This is independent of GPU texture storage and preserves all three
channels of the astrocyte level-4 volume (about 478 MiB total). The existing
200 MiB per-channel server preparation guard remains in force. Larger levels
continue through the regular loader. A single volume overlay shows preparation,
download and texture-upload stages; an error replaces the progress overlay.

## Sharded Zarr and 2D tiles

Partial range reads bypass Chrome's HTTP disk cache and use a private 32 MiB,
60-second byte cache keyed by URL **and Range**. This avoids reproduced
`ERR_CACHE_OPERATION_NOT_SUPPORTED` failures after reload/panning. Metadata stays
fresh, errors are not cached, and a source/context change clears range entries.

Storage requests are bounded through body consumption, not just response headers.
Transient fetch/body failures have bounded retries; cancellation is not an error
to retry. Shared small shard-index reads use the image lifetime rather than the
first tile's abort signal, so cancelling one tile cannot poison other tile reads.

Large physical images with small logical chunks use 256px screen tiles without
changing stored chunks, pixel values or calibration. Native-size statistics tiles
remain separate to avoid increasing automatic-contrast I/O. Missing chunks retain
the Zarr fill-value semantics; genuine transfer/decode errors are not replaced
with zeros.

## Local investigation fixture

IDR0048 image 9846151, the OME-Zarr 0.5 astrocyte sample, has three uint16 channels,
1402 Z planes and XY-only downsampling. Logical chunks are 32 cubed inside
32 x 512 x 512 shards. Its level 2 contains about 7.48 GiB of raw channel data;
Viv's full Float32 textures would require about 14.97 GiB. This dataset advertises
pixel coordinates, not a verified micrometer calibration. It advertises no NGFF
segmentation labels.

The persistent-Chrome reproduction previously recorded 52 non-cancellation fetch
failures while reloading/panning. The corrected range path recorded zero in the
same profile. Tests use bounded 2D and coarse 3D probes; they do not wait for full
high-resolution volume loading. Public data and machine-specific probes are not
included in automated repository tests. Synthetic tests cover exact v2/v3 edge
pixels, cancellation, range identity, cache reuse, engine memory models and real
WebGL section/clipping rendering.

# Local volume and mesh loading benchmark — 2026-10-17

Baseline: `68cfc2249a0fe855cbc5b55750010e782eb0d110` on `0.8.0-beta1`. The after measurements use this streaming change.

## Method

Authenticated HTTP requests pass through the local Nginx and OMERO.web services. Docker Desktop exposes 36 logical CPUs and 62.66 GiB memory; the web container has five synchronous Gunicorn workers and no explicit CPU/memory cap. Stores reside on the existing Windows bind mount. Other deployment services remain running. These are local observations, not production capacity estimates.

Each selection has three empty-derived-cache runs, each followed by a cached run. Only entries scoped to the benchmark user/group/image are cleared. The OS filesystem cache is **not** flushed. All table values are medians in seconds. One intensity channel (channel 0, time 0) is selected. Public mesh tests select original IDs 1, 2 and 3.

“First data” includes preparation and receipt of the same decoded, central block of up to 64³ voxels via the precomputed adapter. This keeps payloads comparable before/after. Native compressed browser streaming is verified separately; these figures do not measure GPU frame rate or complete browser loading/rendering time. “Meshes complete” includes preparation, label indexing, completion and download of those three surfaces.

The four TIFF conversions contain **no generated labels**. Source TIFFs were not modified. The image-only OME-Zarr conversions preserve original pixels, channel count, voxel spacing and XY pyramids. Representative first/middle/last planes were compared exactly to the TIFFs.

The fifth fixture is the original [IDR0062 image 6001240](https://livingobjects.ebi.ac.uk/idr/zarr/v0.4/idr0062A/6001240.zarr/), listed in the [IDR OME-NGFF catalogue](https://idr.github.io/ome-ngff-samples/) under CC BY 4.0. Its 1,475 objects (46,162,906 stored bytes), including the published label group with IDs 1–61, were downloaded unchanged. Image shape: CZYX = 2×236×275×271. All five stores were registered through BIOMERO.importer in dedicated Dataset 801, group 114. The local importer reported a root/group annotation warning; missing importer provenance was attached to these test images using their actual order UUID/path so the viewer could resolve them.

## First decoded data

| Selection | Cold before | Cold after | Cached before | Cached after |
|---|---:|---:|---:|---:|
| DNAcrop, level 0 | 3.349 | 2.063 | 1.111 | 0.320 |
| DividingCellcrop, level 0 | 1.793 | 0.245 | 0.530 | 0.251 |
| DNA, level 3 | 3.715 | 0.288 | 1.316 | 0.292 |
| DNA, level 2 | 3.752 | 0.344 | 1.297 | 0.333 |
| Dendrites, level 2 | 2.084 | 0.282 | 1.133 | 0.282 |
| Dendrites, level 1 | 3.031 | 0.332 | 1.073 | 0.336 |
| IDR6001240, level 0 | 11.910 | 0.993 | 4.248 | 0.891 |
| IDR6001240, level 1 | 11.037 | 0.657 | 3.915 | 0.601 |

## Public segmentation surfaces

| Selection | Cold meshes complete before | After | Cached complete before | After | Derived bytes before | After |
|---|---:|---:|---:|---:|---:|---:|
| Level 0, IDs 1–3 | 12.101 | 3.233 | 4.332 | 0.973 | 53,583,360 | 822,231 |
| Level 1, IDs 1–3 | 11.203 | 1.813 | 3.989 | 0.674 | 13,449,000 | 356,995 |

The intensity-only selections created zero derived volume bytes after this change. Public mesh cache totals now contain object indexes and surfaces, without packed intensity/label volumes. The server-generated mesh byte sizes match the baseline for each selected public object at both levels. The fallback adapter’s individual decoded-block requests can be slower than reads from a prepared memmap; native compatible arrays avoid that adapter during normal browser intensity rendering.

## Reproduction

Run `scripts/benchmark_loading.py` using the OMERO.web Python environment with the same Django configuration and cache directory as the service. Supply the password through an existing environment variable, not a command-line argument. Adjust the image/group IDs in `benchmark-cases-2026-10-17.json` for another installation. The `--cold` option resets only derived entries for the explicitly selected authenticated scopes and refuses to clear active jobs.

```sh
python scripts/benchmark_loading.py --base-url http://zarrviewer-nginx:4080 \
  --group-id 114 --cases docs/benchmark-cases-2026-10-17.json \
  --runs 3 --cold --output /writable/benchmark.json
```

Raw observations are in `benchmark-results-2026-10-17.json`. Original scientific TIFF/Zarr data are not included in the repository.

## Validation

Backend tests cover exact channel/time selection, Zarr v2/v3, permuted axes, native compressed-file mapping, path/session/group checks, uint64 IDs, cropped mesh calibration, background job coalescing/queue limits/error reuse and bounded browser inputs. Frontend tests cover native ZYX→XYZ physical transforms and browser preview geometry/budgets. Browser checks and final suite counts are recorded with the change.

Final automated validation: 140 backend tests passed on Windows (five platform/format skips), 55 focused backend tests passed in the Linux Docker runtime (two format skips), and 121 frontend tests passed. Type checking, production builds, skill/asset validation and the benchmark CLI smoke run passed. Native compressed bytes matched the stored source files for all five fixtures; unauthenticated requests, changed groups and direct internal Nginx requests were rejected.

Chrome verification passed for the dividing-cell 3D stack, the public IDR image with its published surfaces, and an isolated small-object mesh generated in the browser worker. No labels were generated from the supplied TIFFs in the retained test stores.

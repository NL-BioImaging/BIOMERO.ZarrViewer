# Public-data validation, 18–19 October 2026

The collection below was prepared locally as OME-NGFF 0.4 / Zarr v2 and imported using the BIOMERO import queue into project 201, dataset 803 (system group). Seven stores occupy approximately 4.06 GiB. Image annotations contain source, publication, license, calibration evidence and selection details. Original public pixels and label IDs are preserved; no segmentation was generated from the user's TIFFs.

## Viewer changes

- Fresh label opacity is 15% for single-Z images and 55% for multi-Z images, including their 2D slices. Valid saved/manual opacity overrides remain intact.
- Viv's 2D renderer filters invisible channels and composites batches of at most ten channels. This fixes blank rendering for the 27-channel image, including a lone channel with index 26.
- Neuroglancer timepoints share a per-tab read context. A 40-frame export no longer exhausts the 32-view limit, and other tabs retain independent contexts. Superseded frames have bounded grace for in-flight requests.
- Uniformly uncalibrated intensity volumes can render in voxel/pixel coordinates in both 3D engines. Scale bars explicitly say pixels. Mixed/partial units and uncalibrated segmentation meshes remain rejected rather than implying physical calibration.
- Time-series MP4 export now supports the rendered Volume, Slice and Orthogonal views in both engines. Frames load sequentially; controls are held during export; cancellation restores the prior timepoint. These exports are screen-space captures, bounded to 2048 pixels per dimension, not native-resolution scientific stacks. Viv exports intensities; Neuroglancer also captures available labels. Recipes record engine, camera, quality, settings and independent playback FPS.
- ROI PNG export now parses JSON channel/overlay settings correctly; a missing Python import previously caused HTTP 500.

## Validation

- Frontend: 188 tests across 40 files passed; TypeScript and both production builds passed.
- Backend: 166 tests passed, five expected Windows/native-format skips. The PNG regression checks actual channel color, contrast, 15% overlay compositing and malformed JSON for both Zarr fixture formats.
- Browser/Docker: fresh 2D/3D opacity, source annotations/metadata for all seven images, native large-image zoom, high-index and all 27 channels, neural outgrowth, both 3D engines and orthogonal pixel scale bars checked.
- Data: 99 representative native compressed chunks across pyramid and label arrays rehashed against the publisher. Every level-0 converted TIFF pixel compared with its original. Original time-dependent label IDs checked at first/last frames. Detailed evidence is retained locally in `data-validation.json` and `sources/`.
- Movies: six exports decoded completely, with expected frame count, FPS, even encoded size, nonempty frames and temporal change. All four orthogonal panels checked for nonempty content. The 40-frame Neuroglancer movie crosses the former 32-context failure point.
- PNG: authenticated export returned HTTP 200, image/png, 761,054 bytes, 1388×1040, in 3.247 s. Saved as `exports/public-neurite-labels-15percent.png`; Chrome's download control was retried.
- Dependency audit: no high/critical findings; 13 moderate transitive findings remain in unchanged Viv/build tooling dependencies.

## Movies saved in publicdata/exports

| Export | Frames | Mode |
|---|---:|---|
| melanoma-2d-12frames.mp4 | 12 | 2D time-lapse |
| condensin-2d-mip-labels-6frames.mp4 | 6 | 2D projection, original labels |
| condensin-neuroglancer-orthogonal-5frames.mp4 | 5 | Four-panel, original labels |
| condensin-viv-orthogonal-5frames.mp4 | 5 | Four-panel intensities |
| condensin-neuroglancer-volume-40frames.mp4 | 40 | 3D volume, complete source time series |
| zebrafish-neuroglancer-volume-3frames.mp4 | 3 | 3D light-sheet volume |

All movies use 5 playback frames/s; this does not change source acquisition timing. Poster PNGs and export recipes accompany them.

## Loading measurements

Cold means an empty *derived* cache for this selection; OS filesystem caches were not flushed. Timings measure authenticated preparation plus first native chunk, not complete browser paint. Label-ready includes asynchronous server mesh preparation. Both intensity sources use native Zarr streaming without full-volume preparation for contrast.

| Selection | First data cold / cached | Labels ready cold / cached |
|---|---:|---:|
| Condensin T0, original labels | 1.161 / 1.022 s | 3.023 / 1.022 s |
| Condensin T39, original labels | 1.723 / 1.126 s | 3.793 / 1.126 s |
| Zebrafish T0, level 0 | 0.355 / 0.397 s | — |
| Zebrafish T78, level 1 | 0.564 / 0.320 s | — |

Zebrafish produced zero derived intensity-cache bytes. Metadata summaries for all seven images took 0.657–1.973 s and included their linked source/calibration annotations. Machine-readable timings accompany this report.

## Calibration limits

The multiplex tonsil image and downsampled zebrafish preview have no verified physical pixel pitch; both remain in pixel units. Melanoma's acquisition interval could not be verified, so time remains frame index. Zebrafish uses the IDR description's 120 s interval; the publication's 150 s protocol discrepancy is explicitly retained in the provenance. No instrument-default sizes or missing timing were guessed.

## Collection and source evidence

### Public microscopy validation collection

Open in OMERO: http://localhost:4080/webclient/?show=dataset-803

All prepared images are OME-NGFF 0.4 / Zarr v2. Native pixels and original label IDs are preserved. Publisher metadata, selection records and transfer hashes are in `sources/`. Spatial calibration is explicitly unknown where it could not be established.

| Dataset | OMERO image | Axes / dimensions | Calibration | Source / publication |
|---|---:|---|---|---|
| 3D time-lapse with original labels | [14012](http://localhost:4080/biomero_zarr_viewer/?image=14012) | tczyx: 40 x 3 x 31 x 256 x 256 | XYZ: 0.2516, 0.2516, 0.75 micrometers; 90 seconds/frame. | [Data](https://idr.openmicroscopy.org/webclient/?show=image-5514375) · [Paper](https://doi.org/10.1083/jcb.201801048) |
| Large 2D tile scan | [14013](http://localhost:4080/biomero_zarr_viewer/?image=14013) | tczyx: 1 x 3 x 1 x 16433 x 21115 | XY: 0.253 micrometers/pixel. | [Data](https://idr.openmicroscopy.org/webclient/?show=image-9798462) · [Paper](https://doi.org/10.1371/journal.pcbi.1007385) |
| 2D phase-contrast time-lapse | [14014](http://localhost:4080/biomero_zarr_viewer/?image=14014) | tyx: 60 x 2160 x 2560 | XY: 0.325 micrometers/pixel. Acquisition interval not verified; temporal axis remains frame index. | [Data](https://idr.openmicroscopy.org/webclient/?show=image-12922361) · [Paper](https://doi.org/10.1016/j.cels.2021.05.003) |
| Fluorescent neural outgrowth with original masks | [14011](http://localhost:4080/biomero_zarr_viewer/?image=14011) | tczyx: 1 x 1 x 1 x 1040 x 1388 | XY: 2.58 micrometers/pixel. | [Data](https://doi.org/10.6084/m9.figshare.6752873) · [Paper](https://doi.org/10.1038/sdata.2018.183) |
| Phase-contrast neural outgrowth | [14015](http://localhost:4080/biomero_zarr_viewer/?image=14015) | tczyx: 1 x 3 x 1 x 1920 x 2560 | XY: 1/2.21 = 0.4524886878 micrometers/pixel. | [Data](https://doi.org/10.17617/3.UIBMJX) · [Paper](https://doi.org/10.1016/j.jneumeth.2024.110273) |
| 27-channel multiplex tissue image | [14016](http://localhost:4080/biomero_zarr_viewer/?image=14016) | tczyx: 1 x 27 x 1 x 2500 x 2500 | Spatial calibration unverified; pixel units only. | [Data](https://idr.openmicroscopy.org/webclient/?show=image-5025553) · [Paper](https://doi.org/10.1084/jem.20181994) |
| Small zebrafish light-sheet 3D time-lapse | [14017](http://localhost:4080/biomero_zarr_viewer/?image=14017) | tzyx: 79 x 201 x 333 x 333 | Spatial calibration unverified; pixel units only. Time interval 120 seconds according to the IDR experiment description. | [Data](https://idr.openmicroscopy.org/webclient/?show=image-4007817) · [Paper](https://doi.org/10.1242/dev.166728) |

## Condensin_3D_time_IDR5514375

All 40 frames, 3 channels, and both original Cell/Chromosomes label layers.

Native NGFF and IDR pixels; IDR experiment description states 90 seconds. Normalized legacy label axes units to unit; original metadata retained under sources/.

License: CC BY 4.0. Source: https://idr.openmicroscopy.org/webclient/?show=image-5514375.

## Lung_tilescan_IDR9798462

Full 21,115 x 16,433 RGB image and all 8 source pyramid levels.

Publication: Tissue samples and image acquisition, Aperio AT2 at 0.253 micrometers/pixel. Added missing calibration to the prepared copy.

License: CC BY 4.0. Source: https://idr.openmicroscopy.org/webclient/?show=image-9798462.

## Melanoma_2D_time_IDR12922361

First 60 consecutive frames of the 721-frame source, full 2560 x 2160 native pixels, all 6 pyramid levels.

IDR REST Pixels PhysicalSizeX/Y values. Publication and annotation sources checked; no reliable matching acquisition interval recovered.

License: CC BY 4.0. Source: https://idr.openmicroscopy.org/webclient/?show=image-12922361.

## Neurites_fluorescence_DRG

Original image 01_0101u_0p0_001p000.tif, original explant and neurite binary masks. No segmentation generated.

Dataset readme and publication Data Records section specify 2.58 micrometers/pixel.

License: CC0 1.0. Source: https://doi.org/10.6084/m9.figshare.6752873.

## Neurites_phase_NeuroQuantify

Original Snap-573.tif, 2560 x 1920; new downsampled pyramid; no generated labels.

Publication states 1 micrometer = 2.21 pixels. TIFF Snap-573 from test set B; preserve all three source RGB planes.

License: CC0 1.0. Source: https://doi.org/10.17617/3.UIBMJX.

## Tonsil_27channels_IDR5025553

Full 2500 x 2500 image, all 27 original named channels and 5 pyramid levels.

Native NGFF and IDR Pixels omit physical sizes. Publication confirms Hyperion imaging mass cytometry but does not specify a matching pixel pitch; no instrument-default calibration assumed.

License: CC BY 4.0. Source: https://idr.openmicroscopy.org/webclient/?show=image-5025553.

## Zebrafish_lightsheet_IDR4007817

All 79 source preview volumes, 333 x 333 x 201, all 3 pyramid levels; no generated labels.

IDR study describes this dataset as one frame per 2 minutes. Publication describes a 2.5-minute imaging protocol; discrepancy is retained here. Preview downsampling factor and physical pixel size are not verified, so no micrometer pitch assigned.

License: CC BY 4.0. Source: https://idr.openmicroscopy.org/webclient/?show=image-4007817.

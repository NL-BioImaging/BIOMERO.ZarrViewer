# Movie playback and export

For data with more than one timepoint, the existing T slider provides playback,
frame stepping, seeking, adjustable speed and looping. Playback defaults to
5 frames per second and does not imply an acquisition interval.

Playback holds the current channel intensity limits and slider bounds fixed.
Intensity sliders, numeric limits, AUTO, FIT and HIST stay disabled throughout
playback, including while the next frame loads. Statistics refresh resumes when
playback pauses, finishes or is stopped by frame stepping/seeking; the selected
contrast remains unchanged until the user adjusts it. This applies in 2D and 3D.

Ordinary HTTP-backed images render immediately with their OMERO source ranges,
then apply sampled initial AUTO contrast once it is available. Manual ranges
and contrast restored from a viewer URL are preserved. Opening an image afresh
from OMERO allows the initial AUTO calculation instead of restoring a saved URL.

**Export movie** renders a selected frame range using the authenticated browser
loaders and the current compositor. Encoding runs locally in a browser worker
using WebCodecs and the bundled MP4 muxer. No new rendering service is required.
Chrome is the playback acceptance target; encoding support is checked separately
before starting an export. Progress and cancellation are shown beside export.

The film/download icon in the toolbar opens the export options (tooltip:
**Export movie**). During export, a visible **Cancel** button remains beside
the icon, including when the options panel is closed. Cancellation stops the
active export and restores the controls; a late result from a cancelled export
is not downloaded.

Exports support intensity channels, slice or declared Z projection, independently
ordered overlapping raster-label layers, caller-supplied points and lines, and
tracks with explicit table-column mappings. Track gaps remain gaps; observations
are never interpolated automatically. Trails and current-position markers are
bounded and use stable colors. Crops use source pixel coordinates and preserve
their offsets. Scale-bar labels fit the exported panel.

Initial limits are 600 frames, 2048 by 2048 pixels, and the smaller of 256 MiB or
the caller's upload limit. Processing is sequential and decoded frames are not
retained for the entire sequence. Projection loading also reduces slices
incrementally rather than requesting every slice at once.

For Z projections, raster labels use the same categorical projection as the
viewer: the first nonzero object ID along Z is retained at each pixel, after
any focused-ID filtering. This applies to MIP, mean and minimum intensity
projections; IDs are never averaged. Slice exports retain the selected Z plane.

The additive render recipe uses `version: 2` and a `sequence` declaration with
`version: 1`, `start`, `end`, optional `step`, and optional `fps` (default 5).
The source is an explicitly verified store UUID or `source: {kind: "current-image"}`
for an Image workspace; source bindings are checked again on authorization
refresh. The recipe retains frame range, playback speed, crop, dimensions,
channel/contrast settings, overlays, source identity and renderer provenance.
Acquisition units are preserved when available; otherwise timepoints are frames.

The authenticated `zarr-movie-v1` capability exposes the same renderer to
OMERO.Analysis Methods and Notebooks. Their render request declares
`omero_analysis_render_format="mp4"`. Existing PNG/SVG recipes and ordinary
viewer links remain supported. The bundled `use-omero-zarr-viewer` skill (v7)
documents both formats; its canonical source is under `_agents/skills/`, with
the packaged copy checked by `scripts/sync_analysis_skills.py --check`.

## Rendered 3D movies

The viewer also exports Volume, Slice and Orthogonal layouts in Neuroglancer and Viv. These exports capture the current screen view with its camera, visible layers and scale bars, and fit within the same 2048 × 2048 limit. They are not native-resolution 3D stacks. Neuroglancer can include label surfaces; Viv renders intensities. Export waits for each frame, permits cancellation and restores the original timepoint. The fixed background is shared with the viewer.

Recipes record `viewCapture`, engine, layout, quality, camera and display settings. The Analysis integration's native 2D renderer cannot replay these screen-space recipes. Playback FPS is independent of acquisition timing.

## Acceptance

The real Chrome smoke test covers four ordered frames at 5 FPS (0.8 seconds),
seeking/replay, odd-size encoder padding, crop offsets, overlapping red/green
labels, and mapped tracks with a missing observation. Frontend recipe tests
cover bounded sequences and overlay validation. Live local OMERO checks also
generated an annotated Image 66 movie through Analysis, saved the movie/poster/
recipe, and restored those artifacts from OMERO in fresh browser storage.

Run `npm run smoke:movie` from `frontend` with Chrome installed (or set
`CHROME_PATH`). Screenshots, the MP4 and trace/report evidence are retained in
`frontend/test-results/`; CI uploads that evidence. Current test and check
results for this branch are available on its pull request.

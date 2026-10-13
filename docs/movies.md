# Movie playback and export

For data with more than one timepoint, the existing T slider provides playback,
frame stepping, seeking, adjustable speed and looping. Playback defaults to
5 frames per second and does not imply an acquisition interval.

**Export movie** renders a selected frame range using the authenticated browser
loaders and the current compositor. Encoding runs locally in a browser worker
using WebCodecs and the bundled MP4 muxer. No new rendering service is required.
Chrome is the playback acceptance target; encoding support is checked separately
before starting an export. Progress and cancellation are shown beside export.

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

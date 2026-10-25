# Viewer guide

## Open an image

Select an OME-Zarr Image, Plate or Well in OMERO.web and choose **Open With → OME-Zarr Viewer**.
The viewer displays registered OME-Zarr data, including multichannel images,
Z stacks, time series, plates and segmentation results. Viewing does not change
your image pixels or segmentation labels.

## Navigate in 2D

- Drag the image to pan. Scroll the mouse wheel to zoom.
- The image cursor shows a magnifying glass for wheel zoom and a closed hand while panning. It updates when modifier keys or mouse buttons change the active action.
- **Zoom fit**, immediately before Fullscreen, centers the image and fits it inside the window.
- **Zoom 1:1** shows one native image X pixel per screen pixel. It keeps the current position and applies to the original resolution, even when a coarser quality level is displayed.
- Use **Navigator** in the top toolbar to show or hide the overview map.
- Use **Scale bar** to show or hide the physical scale when calibration is available.
- Use **Fullscreen** for more space; click it again or press Escape to leave fullscreen.
- For Z stacks, move the **Z** control to select a slice. The viewer starts at the middle slice.
- Choose a single slice or a maximum, mean or minimum projection through Z.

## Channels and contrast

Use the checkbox beside **Channels** to show or hide all intensity channels.
A partial check means that only some channels are visible. Individual channels
have their own visibility checkbox, color and display range. Open a channel color
swatch to choose Red, Green, Blue, Cyan, Magenta, Yellow or Grayscale, or use a custom color.
Grayscale maps intensities from black to white. These presets work in both engines.

- **Auto** estimates a useful contrast range from sampled image data.
- **Fit** fits the display range to the sampled values.
- **Hist** shows or hides the sampled intensity histogram.
- Adjust the lower and upper range handles or enter values to fine-tune contrast.

These controls change the display only. They do not change the underlying measurements.

## Segmentation labels

Use the checkbox beside **Labels** to show or hide all segmentation layers.
The Labels tab provides individual visibility, opacity and color controls.
New label layers start at **15%** opacity for single-Z images and **55%** for Z stacks, including their 2D slices. Saved links retain their explicit opacity.
Keep multicolor object colors or select a single color to compare segmentation results.

In 2D, choose filled objects, outlines or both and adjust outline width.
Hover over an object to see its label ID, including IDs from overlapping visible layers.
Reorder layers to control which overlays are drawn on top.

In MIP, Mean and Min views, labels are projected across all Z slices too.
Object IDs are preserved: where objects overlap within one layer, the first
non-background ID from the lowest Z slice is shown. IDs are never averaged.
Hover reports the projected ID; switch to Slice or 3D to inspect objects hidden
behind another object. Focused object selections are applied before projection.

In Neuroglancer 3D, labels appear as object surfaces alongside the image.
Their visibility, color and opacity are independent of intensity brightness.
The 2D fill and outline controls do not define the appearance of 3D surfaces.
Viv 3D displays intensity channels only; return to Neuroglancer or 2D to view labels.

## Choose a 3D renderer

For a compatible Z stack, select **3D** using the **2D / 3D** buttons in the top toolbar. Under
**Viewer**, choose the rendering engine:

- **Neuroglancer** is the default and displays intensity channels with segmentation surfaces.
- **Viv** is the alternative intensity-only volume renderer.

Choose **Quality** to select a stored resolution level. Level 0 is the finest;
higher level numbers are coarser and usually faster. Physical XYZ proportions
are preserved across levels. Switching renderers keeps channel and label settings.
The navigator is available in 2D only and is hidden in 3D.

## Slices and orthogonal views

The top **2D / 3D** buttons switch between the image tools and volume tools.
At the top of the sidebar, the **Volume**, **Slice** and **Orthogonal** buttons choose the layout,
beside the existing Neuroglancer / Viv engine choices. The 2D view retains projections,
labels, the navigator and movie export. Both engines provide all three volume layouts.

- **Slice** displays one section. Choose **XY**, **XZ** or **YZ** and move its position slider.
- **Orthogonal** displays XY, XZ and YZ sections alongside a 3D volume. The X, Y and Z sliders select the common intersection.
- In Neuroglancer, the sections share a center and show their planes in the 3D panel. Drag to pan; the mouse wheel zooms, while Ctrl+wheel steps sections and Shift+wheel steps ten sections. Positions and slice zoom survive changing modes and shared links.
- In Viv, sections display actual XY, XZ and YZ voxel planes from the cached intensity volume. Crosshairs show the same selected voxel in every section. Click a section or use the sliders to move the common position. Drag to pan and scroll to zoom; section navigation is linked and framing preserves physical XYZ proportions. Viv remains intensity-only.

Slice positions refer to the selected quality level and are displayed starting at 1.
Changing quality preserves the shared physical position and scale in both engines.
Viv reuses one cached volume and three lightweight section images, so Level 0 is available whenever it fits the shared 200 MiB level limit and GPU texture limits.
In Orthogonal mode, all four panels share the same physical zoom. The 3D panel uses orthographic projection to keep sizes consistent through the volume. Zooming any panel updates the others. The initial scale fits the complete sections, and Viv uses gentle wheel zoom in both the 3D and slice panels. Standalone Volume mode retains perspective.

Scale bars use the same style as 2D in every panel, follow zoom and remain visible during slice changes when **Scale bar** is enabled and calibration is available.
Use **Reset 3D View** to recenter sections and reset the volume camera.

## Move around in 3D

In **Neuroglancer**, left-drag rotates, while right-drag or Shift+left-drag pans. The mouse wheel zooms
gently, about 12% per notch. **Ctrl+wheel** moves the focus through depth by ten
calibrated Z slices per notch, without changing the zoom. The depth readout shows
the movement distance; rotating the view changes the direction of depth movement.

In **Viv**, left-drag rotates, right-drag pans and scrolling zooms, matching Neuroglancer. Shift, Ctrl, Alt or Meta with a left-drag also pans the volume. In flat Viv sections and 2D images, both ordinary left-drag and right-drag pan. The middle button is not required for navigation.

The cursor previews wheel zoom at rest. While dragging it shows the active pan or rotation action. In Neuroglancer, holding Ctrl shows slice/depth movement for the wheel; Shift shows slice movement in flat panels. Alt+wheel changes the depth range. Clicking changes the cursor to the action bound to that mouse button. The cursor stays with the operation that started a drag until the button is released.

**Zoom fit** and **Zoom 1:1** work in both engines and all layouts. Fit centers and frames the image without resetting volume rotation; a single Slice retains its selected depth. 1:1 uses the native X pixel size at the 3D view center. Perspective objects away from that plane can appear larger or smaller. Orthogonal panels remain linked at one physical scale. These screen pixels are browser CSS pixels; display scaling does not change the source data.
Use **Reset 3D View** in the toolbar to return to the initial framing.
The 3D scale bar follows zoom and shows the physical scale at the volume center.
Perspective means objects nearer or farther from the center have a different apparent scale.

## Clipping planes

In **Volume** view, open **Clipping planes** immediately below the Volume/Slice/Orthogonal choices. The panel starts collapsed. Each X, Y and Z double slider selects the retained interval, from 0 to 100% of the volume. Use the reset icon beside an axis to restore that axis to its full range.

Clipping works in **Viv** and **Neuroglancer**. In Neuroglancer it also clips segmentation surfaces. It changes only the display: source pixels, calibration and stored segmentation data remain intact. The bounds are shared when changing engines and retained in viewer links and movie capture settings. Clipping is inactive in Slice and Orthogonal layouts; returning to Volume restores the selected bounds.

## 3D display and brightness

In 3D mode, immediately above **Quality**, **Max VRAM** offers 100 MiB, 200 MiB,
500 MiB, and 75% of the GPU VRAM selected in the adjacent dropdown. Choose
**Estimate (x GiB)** or manually select **2, 4, 8, 12, 16, 24 or 48 GiB**.
For example, choosing **24 GiB** makes the 75% option **18 GiB**. Manual choices
do not depend on window size. The default is 200 MiB with Estimate as the GPU
source; both choices are stored locally in this browser. The controls are hidden
in 2D. If no quality level fits, 3D keeps the controls available without loading
a volume, so you can raise the budget.

With Estimate selected, the 75% value is rounded down to 10 MiB. With a manual
GPU size it is exactly 75% (in whole MiB). The fixed 500 MiB option is omitted
when the 75% option is at most 500 MiB. A saved 500 MiB choice temporarily falls
back to 200 MiB when unavailable. Only Estimate follows the window size and
display pixel ratio.

This follows [MDN's per-pixel VRAM-budget heuristic](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices#estimate_a_per-pixel_vram_budget),
using an application-selected reference of 1 GiB at 1920×1080 device pixels:
`estimateMiB = 1024 × width × height × devicePixelRatio² / (1920 × 1080)`.
The estimate is bounded to 128 MiB–4 GiB. It is **not a measurement of total or
free GPU memory**, and larger windows do not prove that more VRAM is available.

Quality choices account for all visible channels and at least four GPU bytes
per voxel, because Viv uploads Float32 volume textures. Texture-dimension limits
still apply. Reducing the budget selects a fitting lower resolution, or pauses
volume loading when none fits. Neuroglancer's chunk-memory limits follow the same choice.
Framebuffers, temporary CPU copies, driver allocations and other tabs consume
additional memory; the chosen number is a viewer budget rather than a guarantee
of total process usage. The physical-store server cache keeps its separate
200 MiB per-volume guard; larger permitted volumes use the existing plane/chunk
reader rather than raising server-side resource limits.

The **Display** choice buttons offer **Additive blend**, **Maximum intensity**
and **Minimum intensity**. Neuroglancer defaults to Maximum intensity; Viv
defaults to Additive blend. An explicitly saved choice in a viewer link takes
precedence. Try the different modes to emphasize different
structures in the intensity volume.

Use **Brightness** to adjust intensity channels. The image background is fixed. Neuroglancer also provides **Volume gain** to adjust their
volume appearance. These intensity controls do not alter label color or opacity.
Use the Labels tab to adjust segmentation surfaces separately.

## Plates and wells

Use **Field**, **Well** and **Plate** views to move between a detailed image and
the broader experiment. Choose the acquisition and field where available.
Open a field to inspect labels or switch to 3D. Well and Plate overviews show
intensity thumbnails in 2D. Well fields form a compact, near-square grid: 36 fields
use 6 × 6 tiles and 81 fields use 9 × 9. Fields follow numeric order (0, 1, 2,
… 10, 11) in the overview and field selector. Pan and zoom to explore the overview.

Shallow segmentation results show their labels over the linked original image
without needing a second copy of the intensity data.

## Time and movies

For images with multiple timepoints, use the **T** control to step, seek or play
through time. Playback has adjustable speed and looping and starts at 5 frames
per second. This playback rate does not imply an acquisition interval.

In a 2D field view, **Export movie** saves a browser-generated MP4 of the selected
frame range and visible image area, with channel settings and label overlays.
Export shows progress and can be cancelled. Encoding requires browser support;
Chrome is the tested browser. Exports are limited to 2000 frames and 2048 × 2048 pixels.
In 3D, **Export movie** captures the rendered Volume, Slice or Orthogonal view in either engine. It preserves the selected camera, quality, visible layers and scale bars while stepping through time. Neuroglancer includes available label surfaces; Viv includes intensities. These movies use the current screen view, rather than native image pixels. Controls are held during export; Stop cancels and restores the previous timepoint. A recipe and poster accompany the MP4.

## Share a view

Copy the browser URL to share the current field, plane, projection, channel and
label settings, viewport or 3D camera and renderer. Recipients must sign in to
OMERO and have access to the image. The link does not grant additional access.
Focused object links can open a selected region and highlighted segmentation.
When available, **Download ROI PNG** saves the focused region as an image.

## Loading and limits

3D needs WebGL 2 and a volume that fits the viewer's memory limits. If 3D is
unavailable, use 2D or a smaller field. Choose a coarser Quality level if a
volume or segmentation is too large. Label surfaces require calibrated XYZ
axes and integer object IDs; very large or complex segmentations can exceed
the surface-generation limits.

Changing quality, field, timepoint or visible layers can reload the volume.
The progress indicator shows preparation and download status. If all channels
and labels are switched off, the viewer stays in 3D and displays an empty-view message.

The viewer is read-only. It cannot edit segmentations or turn conventional
OMERO pixels into an OME-Zarr store. At a 2D label tile boundary, an outline
segment may occasionally be absent.

## Use this help window

Open **Help** in the top toolbar, after the metadata icon. Search for a feature or select a
section from Contents. Drag the title bar to move the window and drag its
bottom-right corner to resize it. You can keep it open while using the viewer.
Use **Close help**, or press Escape while focused inside help, to close it.


## Inspect image metadata

Select the **Image metadata** icon immediately after **Fullscreen** in the top toolbar.
The movable, resizable popup groups stored dimensions, calibration, channels,
resolution levels, labels and plate information. Search names, keys or values in the currently loaded metadata. The selected field and summary load first; browse additional hierarchy pages on demand to inspect custom attributes and array metadata. No pixel chunks are read for this inspection.

The lower categories show readable OMERO image, acquisition, pixels, channel and
instrument details, annotations and key-values, parent container annotations,
and original import metadata when available. Missing or unreadable optional
metadata is reported in the Availability section. Close with the cross or Escape.

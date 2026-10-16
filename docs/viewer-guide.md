# Viewer guide

## Open an image

Select an OME-Zarr Image, Plate or Well in OMERO.web and choose **Open With → OME-Zarr Viewer**.
The viewer displays registered OME-Zarr data, including multichannel images,
Z stacks, time series, plates and segmentation results. Viewing does not change
your image pixels or segmentation labels.

## Navigate in 2D

- Drag the image to pan. Scroll the mouse wheel to zoom.
- Use **Navigator** in the top toolbar to show or hide the overview map.
- Use **Scale bar** to show or hide the physical scale when calibration is available.
- Use **Fullscreen** for more space; click it again or press Escape to leave fullscreen.
- For Z stacks, move the **Z** control to select a slice. The viewer starts at the middle slice.
- Choose a single slice or a maximum, mean or minimum projection through Z.

## Channels and contrast

Use the checkbox beside **Channels** to show or hide all intensity channels.
A partial check means that only some channels are visible. Individual channels
have their own visibility checkbox, color and display range.

- **Auto** estimates a useful contrast range from sampled image data.
- **Fit** fits the display range to the sampled values.
- **Hist** shows or hides the sampled intensity histogram.
- Adjust the lower and upper range handles or enter values to fine-tune contrast.

These controls change the display only. They do not change the underlying measurements.

## Segmentation labels

Use the checkbox beside **Labels** to show or hide all segmentation layers.
The Labels tab provides individual visibility, opacity and color controls.
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

For a compatible Z stack, select **3D** in the top toolbar. Under
**3D Volume → Viewer**, choose the rendering engine:

- **Neuroglancer** is the default and displays intensity channels with segmentation surfaces.
- **Viv** is the alternative intensity-only volume renderer.

Choose **Quality** to select a stored resolution level. Level 0 is the finest;
higher level numbers are coarser and usually faster. Physical XYZ proportions
are preserved across levels. Switching renderers keeps channel and label settings.
The navigator is available in 2D only and is hidden in 3D.

## Move around in 3D

In **Neuroglancer**, drag to rotate and Shift+drag to pan. The mouse wheel zooms
gently, about 12% per notch. **Ctrl+wheel** moves the focus through depth by ten
calibrated Z slices per notch, without changing the zoom. The depth readout shows
the movement distance; rotating the view changes the direction of depth movement.

In **Viv**, drag to rotate and scroll to zoom.
Use **Reset 3D View** in the toolbar to return to the initial framing.
The 3D scale bar follows zoom and shows the physical scale at the volume center.
Perspective means objects nearer or farther from the center have a different apparent scale.

## 3D display and brightness

The **Display** menu offers **Additive blend**, **Maximum intensity**
and **Minimum intensity**. Neuroglancer defaults to Maximum intensity; Viv
defaults to Additive blend. An explicitly saved choice in a viewer link takes
precedence. Try the different modes to emphasize different
structures in the intensity volume.

Use **Background** to choose the canvas color and **Brightness** to adjust
intensity channels. Neuroglancer also provides **Volume gain** to adjust their
volume appearance. These intensity controls do not alter label color or opacity.
Use the Labels tab to adjust segmentation surfaces separately.

## Plates and wells

Use **Field**, **Well** and **Plate** views to move between a detailed image and
the broader experiment. Choose the acquisition and field where available.
Open a field to inspect labels or switch to 3D. Well and Plate overviews show
intensity thumbnails in 2D. Pan and zoom to explore the overview.

Shallow segmentation results show their labels over the linked original image
without needing a second copy of the intensity data.

## Time and movies

For images with multiple timepoints, use the **T** control to step, seek or play
through time. Playback has adjustable speed and looping and starts at 5 frames
per second. This playback rate does not imply an acquisition interval.

In a 2D field view, **Export movie** saves a browser-generated MP4 of the selected
frame range and visible image area, with channel settings and label overlays.
Export shows progress and can be cancelled. Encoding requires browser support;
Chrome is the tested browser. Exports are limited to 600 frames and 2048 × 2048 pixels.
3D movie export is not available.

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

Open **Help** to the right of Fullscreen. Search for a feature or select a
section from Contents. Drag the title bar to move the window and drag its
bottom-right corner to resize it. You can keep it open while using the viewer.
Use **Close help**, or press Escape while focused inside help, to close it.

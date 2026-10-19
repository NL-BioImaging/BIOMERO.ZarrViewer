import { imageAction, installImageCursor } from "../src/image-cursor";
import "neuroglancer";
import "../src/browser-mesh-store";
import { makeDefaultViewer } from "neuroglancer/unstable/ui/default_viewer.js";
import { setDefaultInputEventBindings } from "neuroglancer/unstable/ui/default_input_event_bindings.js";
import "./viewer.css";
import { registerActionListener } from "neuroglancer/unstable/util/event_action_map.js";
import { PerspectivePanel } from "neuroglancer/unstable/perspective_view/panel.js";
import { SliceViewPanel } from "neuroglancer/unstable/sliceview/panel.js";
import { vec3 } from "neuroglancer/unstable/util/geom.js";
import { configureVolumeWheel, depthWheelStep, wheelZoomFactor, sliceWheelStep, configureSliceWheel, linkOrthogonalZoom, orthogonalFitScale } from "../src/neuroglancer-controls";

const origin = window.parent.location.origin;
const send = (message: object) => window.parent.postMessage(message, origin);
try {
  const viewer = makeDefaultViewer({ showUIControls: false, showLayerDialog: false, resetStateWhenEmpty: false });
  setDefaultInputEventBindings(viewer.inputEventBindings);

  // Ordinary wheel movement zooms in every panel; modified wheel moves slices.
  configureVolumeWheel(viewer.inputEventBindings.perspectiveView);
  viewer.registerDisposer(registerActionListener<WheelEvent>(viewer.element, "biomero-zoom-via-wheel", event => {
    viewer.perspectiveNavigationState.zoomBy(wheelZoomFactor(event.detail.deltaY, event.detail.deltaMode));
  }));
  let voxelDepthNm = 1;
  let voxelSizeNm = [1, 1, 1];
  configureSliceWheel(viewer.inputEventBindings.sliceView);
  viewer.registerDisposer(registerActionListener<WheelEvent>(viewer.element, "biomero-section-zoom-via-wheel", event => {
    viewer.navigationState.zoomBy(wheelZoomFactor(event.detail.deltaY, event.detail.deltaMode));
  }));
  viewer.registerDisposer(registerActionListener<WheelEvent>(viewer.element, "biomero-slice-via-wheel", event => {
    const panel = [...viewer.display.panels].find(panel => panel instanceof SliceViewPanel && panel.element.contains(event.target as Node)) as SliceViewPanel | undefined;
    if (!panel) return;
    const normal = vec3.transformQuat(vec3.create(), [0, 0, 1], panel.navigationState.pose.orientation.orientation);
    const step = sliceWheelStep(normal, voxelSizeNm, event.detail.deltaY || event.detail.deltaX, event.detail.shiftKey);
    panel.navigationState.pose.translateVoxelsRelative([0, 0, step]);
  }));
  viewer.registerDisposer(registerActionListener<WheelEvent>(viewer.element, "biomero-depth-via-wheel", event => {
    const step = depthWheelStep(event.detail.deltaY, event.detail.deltaMode, voxelDepthNm);
    viewer.perspectiveNavigationState.pose.translateVoxelsRelative([0, 0, step]);
    send({ type: "biomero-ng-depth", nanometers: step });
  }));
  viewer.element.classList.add("image-cursor-surface");
  const imageCursor=installImageCursor(viewer.element,input=>{
    const panel=[...viewer.display.panels].find(panel=>panel.element.contains(input.target as Node));
    const bindings=panel instanceof PerspectivePanel?viewer.inputEventBindings.perspectiveView:viewer.inputEventBindings.sliceView;
    return imageAction("neuroglancer",input,id=>(bindings.get(id)||bindings.get(id.replace("at:","bubble:")))?.action);
  });
  viewer.registerDisposer(imageCursor.dispose);
  let positionCommandId = -1;
  let layout = "";
  let initialized = false;
  let reset = -1;
  let scene = "";
  let updating = false;
  let wasReady = false;
  let lastError = "";
  let lastPanels = "";
  let fitPending = false;
  let physicalExtent = [1, 1, 1];
  const perspectiveHeight = () => [...viewer.display.panels].find(panel => panel instanceof PerspectivePanel)?.element.getBoundingClientRect().height || 0;
  const linkedZoom = linkOrthogonalZoom(viewer.crossSectionScale, viewer.projectionScale, perspectiveHeight,
    () => initialized && !updating && layout === "4panel");
  viewer.crossSectionScale.changed.add(linkedZoom.fromSections);
  viewer.projectionScale.changed.add(linkedZoom.fromVolume);
  let layerSources = new Map<string, string>();
  let segmentSelections = new Map<string, string>();
  let timer: ReturnType<typeof setTimeout>;
  const camera = () => ({ position: Array.from(viewer.position.value), orientation: Array.from(viewer.projectionOrientation.orientation), scale: viewer.projectionScale.value, crossSectionScale: viewer.crossSectionScale.value });
  const cameraChanged = () => {
    if (updating || !initialized) return;
    clearTimeout(timer);
    timer = setTimeout(() => send({ type: "biomero-ng-camera", camera: camera() }), 150);
  };
  viewer.position.changed.add(cameraChanged);
  viewer.projectionOrientation.changed.add(cameraChanged);
  viewer.projectionScale.changed.add(cameraChanged);
  viewer.crossSectionScale.changed.add(cameraChanged);
  window.addEventListener("message", event => {
    if(event.source===window.parent&&event.origin===origin&&event.data?.type==='biomero-ng-modifiers'){
      imageCursor.setModifiers(event.data);return;
    }
    if(event.source===window.parent&&event.origin===origin&&event.data?.type==='biomero-ng-capture'){
      try{
        if(!viewer.isReady())throw new Error('The 3D frame is still loading.');
        viewer.display.draw();
        const source=viewer.display.canvas;
        if(!source.width||!source.height||source.width*source.height>16_000_000)throw new Error('The 3D view is too large to capture.');
        const target=new OffscreenCanvas(source.width,source.height),context=target.getContext('2d')!;
        context.drawImage(source,0,0);const pixels=context.getImageData(0,0,source.width,source.height);
        window.parent.postMessage({type:'biomero-ng-capture',id:event.data.id,width:source.width,height:source.height,data:pixels.data.buffer},origin,[pixels.data.buffer]);
      }catch(error){send({type:'biomero-ng-capture',id:event.data.id,error:String(error)});}
      return;
    }
    if (event.source !== window.parent || event.origin !== origin || event.data?.type !== "biomero-ng-state") return;
    try {
      updating = true;
      const { state, resetKey, sceneKey } = event.data;
      physicalExtent = event.data.physicalExtentNm || physicalExtent;
      if ((!initialized || layout !== state.layout || resetKey !== reset || sceneKey !== scene) && state.layout === "4panel")
        fitPending = !event.data.camera?.crossSectionScale;
      voxelDepthNm = event.data.voxelDepthNm || 1;
      voxelSizeNm = event.data.voxelSizeNm || [1, 1, voxelDepthNm];
      const previous = initialized && resetKey === reset && sceneKey === scene ? camera() : event.data.camera;
      if (!initialized) {
        viewer.state.restoreState({ ...state, layout:{type:state.layout,orthographicProjection:state.layout === "4panel"}, ...(previous ? { position: previous.position, projectionOrientation: previous.orientation, projectionScale: previous.scale, crossSectionScale: previous.crossSectionScale || state.crossSectionScale } : {}) });
        layerSources = new Map(state.layers.map((spec: any) => [spec.name, JSON.stringify(spec.source)]));
        segmentSelections = new Map(state.layers.filter((spec: any) => spec.type === "segmentation").map((spec: any) => [spec.name, JSON.stringify(spec.segments)]));
      } else {
        // Update appearance in place. Recreating the layout during async chunk
        // loading invalidates Neuroglancer's render-layer attachment state.
        // Only rebuild panels when the requested mode/plane actually changes.
        if (layout !== state.layout) viewer.layout.restoreState({type:state.layout,orthographicProjection:state.layout === "4panel"});
        viewer.showPerspectiveSliceViews.value = state.showSlices;
        viewer.showAxisLines.value = state.showAxisLines;
        viewer.showScaleBar.value = state.showScaleBar;
        viewer.crossSectionBackgroundColor.restoreState(state.crossSectionBackgroundColor);
        viewer.perspectiveViewBackgroundColor.restoreState(state.projectionBackgroundColor);
        for (const spec of state.layers) {
          const layer: any = viewer.layerManager.managedLayers.find(item => item.name === spec.name)?.layer;
          if (!layer) continue;
          const sources = JSON.stringify(spec.source);
          if (sources !== layerSources.get(spec.name)) {
            for (const oldSource of [...layer.dataSources]) oldSource.dispose();
            layer.dataSources.length = 0;
            for (const source of layer.getDataSourceSpecifications(spec)) layer.addDataSource(source);
            layerSources.set(spec.name, sources);
          }
          if (spec.type === "image") {
            layer.fragmentMain.value = spec.shader;
            layer.volumeRenderingMode.restoreState(spec.volumeRendering);
            layer.volumeRenderingGain.value = spec.volumeRenderingGain;
            layer.volumeRenderingDepthSamplesTarget.value = spec.volumeRenderingDepthSamples;
          } else {
            layer.displayState.objectAlpha.value = spec.objectAlpha;
            layer.displayState.selectedAlpha.value = spec.selectedAlpha;
            layer.displayState.segmentDefaultColor.restoreState(spec.segmentDefaultColor);
            const selected = JSON.stringify(spec.segments);
            if (selected !== segmentSelections.get(spec.name)) {
              const visible = layer.displayState.segmentationGroupState.value.visibleSegments;
              visible.clear();
              for (const id of spec.segments) visible.add(BigInt(id));
              segmentSelections.set(spec.name, selected);
            }
          }
        }
        if (resetKey !== reset || sceneKey !== scene) {
          viewer.position.restoreState(previous?.position || state.position);
          viewer.projectionOrientation.restoreState(previous?.orientation || state.projectionOrientation);
          viewer.projectionScale.restoreState(previous?.scale || state.projectionScale);
          viewer.crossSectionScale.restoreState(previous?.crossSectionScale || state.crossSectionScale);
        }
      }
      const command = event.data.positionCommand;
      if (command && command.id !== positionCommandId) {
        if (initialized && resetKey === reset && sceneKey === scene) viewer.position.restoreState(command.position);
        positionCommandId = command.id;
      }
      // Keep sections axis aligned even if a native rotate shortcut was used.
      viewer.crossSectionOrientation.restoreState(state.crossSectionOrientation);
      layout = state.layout;
      initialized = true;
      wasReady = false;
      reset = resetKey;
      scene = sceneKey;
      send({ type: "biomero-ng-loading" });
    } catch (error) {
      send({ type: "biomero-ng-error", message: String(error) });
    } finally { updating = false; }
  });
  window.setInterval(() => {
    if (!initialized) { send({ type: "biomero-ng-initialized" }); return; }
    if (layout === "4panel") {
      const section = [...viewer.display.panels].find(panel => panel instanceof SliceViewPanel);
      if (fitPending && section && perspectiveHeight() > 0) {
        const bounds = section.element.getBoundingClientRect();
        if (bounds.width > 0 && bounds.height > 0) {
          viewer.crossSectionScale.value = orthogonalFitScale(physicalExtent, bounds.width, bounds.height);
          fitPending = false;
        }
      }
      linkedZoom.fromSections();
    }
    const origin = viewer.element.getBoundingClientRect();
    const panels = [...viewer.display.panels].flatMap(panel => {
      if (!(panel instanceof SliceViewPanel || panel instanceof PerspectivePanel)) return [];
      const bounds = panel.element.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return [];
      const perspective = panel instanceof PerspectivePanel;
      return [{ left:bounds.left-origin.left, top:bounds.top-origin.top, width:bounds.width, height:bounds.height,
        unitsPerPixel:perspective ? viewer.projectionScale.value / bounds.height : panel.navigationState.zoomFactor.value, perspective:panel instanceof PerspectivePanel && !panel.viewer.orthographicProjection.value }];
    });
    const panelKey = JSON.stringify(panels);
    if (panelKey !== lastPanels) { lastPanels = panelKey; send({ type:"biomero-ng-panels", panels }); }
    const errors = viewer.layerManager.managedLayers.flatMap(layer => [...(layer.layer?.messages || [])]
      .filter(message => message.severity === 2).map(message => `${layer.name}: ${message.message}`));
    const error = errors.join("; ");
    if (error && error !== lastError) send({ type: "biomero-ng-error", message: error });
    lastError = error;
    if (error) return;
    const ready = viewer.isReady();
    if (ready && !wasReady) send({ type: "biomero-ng-ready" });
    wasReady = ready;
  }, 300);
  window.addEventListener("error", event => send({ type: "biomero-ng-error", message: event.message }));
  send({ type: "biomero-ng-initialized" });
} catch (error) { send({ type: "biomero-ng-error", message: String(error) }); }

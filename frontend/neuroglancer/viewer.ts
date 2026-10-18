import "neuroglancer";
import "../src/browser-mesh-store";
import { makeDefaultViewer } from "neuroglancer/unstable/ui/default_viewer.js";
import { setDefaultInputEventBindings } from "neuroglancer/unstable/ui/default_input_event_bindings.js";
import "./viewer.css";
import { registerActionListener } from "neuroglancer/unstable/util/event_action_map.js";
import { SliceViewPanel } from "neuroglancer/unstable/sliceview/panel.js";
import { vec3 } from "neuroglancer/unstable/util/geom.js";
import { configureVolumeWheel, depthWheelStep, wheelZoomFactor, sliceWheelStep } from "../src/neuroglancer-controls";

const origin = window.parent.location.origin;
const send = (message: object) => window.parent.postMessage(message, origin);
try {
  const viewer = makeDefaultViewer({ showUIControls: false, showLayerDialog: false, resetStateWhenEmpty: false });
  setDefaultInputEventBindings(viewer.inputEventBindings);
  // Perspective panels zoom on wheel; slice panels keep native slice navigation.
  configureVolumeWheel(viewer.inputEventBindings.perspectiveView);
  viewer.registerDisposer(registerActionListener<WheelEvent>(viewer.element, "biomero-zoom-via-wheel", event => {
    viewer.perspectiveNavigationState.zoomBy(wheelZoomFactor(event.detail.deltaY, event.detail.deltaMode));
  }));
  let voxelDepthNm = 1;
  let voxelSizeNm = [1, 1, 1];
  viewer.inputEventBindings.sliceView.set("at:wheel", { action: "biomero-slice-via-wheel", preventDefault: true });
  viewer.inputEventBindings.sliceView.set("at:shift+wheel", { action: "biomero-slice-via-wheel", preventDefault: true });
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
  let positionCommandId = -1;
  let layout = "";
  let initialized = false;
  let reset = -1;
  let scene = "";
  let updating = false;
  let wasReady = false;
  let lastError = "";
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
    if (event.source !== window.parent || event.origin !== origin || event.data?.type !== "biomero-ng-state") return;
    try {
      updating = true;
      const { state, resetKey, sceneKey } = event.data;
      voxelDepthNm = event.data.voxelDepthNm || 1;
      voxelSizeNm = event.data.voxelSizeNm || [1, 1, voxelDepthNm];
      const previous = initialized && resetKey === reset && sceneKey === scene ? camera() : event.data.camera;
      if (!initialized) {
        viewer.state.restoreState({ ...state, ...(previous ? { position: previous.position, projectionOrientation: previous.orientation, projectionScale: previous.scale, crossSectionScale: previous.crossSectionScale || state.crossSectionScale } : {}) });
        layerSources = new Map(state.layers.map((spec: any) => [spec.name, JSON.stringify(spec.source)]));
        segmentSelections = new Map(state.layers.filter((spec: any) => spec.type === "segmentation").map((spec: any) => [spec.name, JSON.stringify(spec.segments)]));
      } else {
        // Update appearance in place. Recreating the layout during async chunk
        // loading invalidates Neuroglancer's render-layer attachment state.
        // Only rebuild panels when the requested mode/plane actually changes.
        if (layout !== state.layout) viewer.layout.restoreState(state.layout);
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

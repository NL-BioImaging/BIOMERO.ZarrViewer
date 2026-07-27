import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { loadOmeZarrFromStore } from "@hms-dbmi/viv";
import { fetchCapabilities, selectedImageId, ViewerApiError } from "./api";
import { AuthenticatedZarrStore, PrefixStore } from "./authenticated-store";
import { analyzeChannels, applyChannelAnalysis, type ChannelAnalysis } from "./channel-scaling";
import { attachNgffPhysicalSizes } from "./ngff-physical-sizes";
import { projectLoader } from "./projection-loader";
import type {
  Capability,
  ChannelState,
  LabelCapability,
  LabelState,
  ProjectionMode,
  RenderMode,
  ViewportState,
  VolumeCameraState,
  VolumeLevel,
} from "./types";
import {
  applyChannelDeepLink,
  applyLabelDeepLink,
  applySourceChannels,
  fitRoiViewport,
  parseDeepLink,
  writeDeepLink,
  type DeepLinkState,
} from "./viewer-state";
import { ViewerCanvas } from "./ViewerCanvas";
import { VolumeCanvas } from "./VolumeCanvas";
import { OverviewGrid } from "./OverviewGrid";
import {
  activeVolumeChannels,
  chooseVolumeLevel,
  detectMax3dTextureSize,
  formatBytes,
  safeVolumeLevels,
  volumeLevels,
} from "./volume-utils";

interface LoadedData {
  path: string;
  image: any[];
  labels: Array<{ id: string; loader: any[]; channelIndex?: number }>;
  sizeZ: number;
  sizeT: number;
  sizeC: number;
}

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width: Math.max(1, Math.floor(width)), height: Math.max(1, Math.floor(height)) });
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return [ref, size] as const;
}

function dtypeDomain(dtype: string): [number, number] {
  const normalized = dtype.toLowerCase();
  if (normalized.includes("uint8")) return [0, 255];
  if (normalized.includes("uint16")) return [0, 65535];
  if (normalized.includes("uint32")) return [0, 4294967295];
  if (normalized.includes("int8")) return [-128, 127];
  if (normalized.includes("int16")) return [-32768, 32767];
  if (normalized.includes("int32")) return [-2147483648, 2147483647];
  return [0, 1];
}

const palette = ["#FFFFFF", "#00FF00", "#FF00FF", "#00FFFF", "#FFFF00", "#FF0000"];

function channelStates(capability: Capability, loader: any[]): ChannelState[] {
  const source = loader[0];
  const cIndex = source.labels.indexOf("c");
  const count = cIndex >= 0 ? source.shape[cIndex] : 1;
  const [domainMin, domainMax] = dtypeDomain(source.dtype || "uint16");
  return Array.from({ length: count }, (_, index) => {
    const metadata = capability.channels[index];
    const window = metadata?.window;
    return {
      index,
      label: metadata?.label || `Channel ${index + 1}`,
      visible: metadata?.active ?? index < 3,
      color: metadata?.color || palette[index % palette.length],
      low: window?.start ?? domainMin,
      high: window?.end ?? domainMax,
      domainMin: window?.min ?? domainMin,
      domainMax: window?.max ?? domainMax,
    };
  });
}

export function labelStates(capability: Capability): LabelState[] {
  return capability.labels.map((label) => ({
    id: label.id,
    name: label.name,
    path: label.path,
    visible: true,
    opacity: 0.3,
    mode: "fill",
    color: label.color,
  }));
}

function axisSize(loader: any[], axis: string): number {
  const source = loader[0];
  const index = source.labels.indexOf(axis);
  return index >= 0 ? source.shape[index] : 1;
}

export function defaultZIndex(sizeZ: number, requested?: number): number {
  const maximum = Math.max(0, sizeZ - 1);
  return requested == null ? Math.floor(maximum / 2) : Math.max(0, Math.min(maximum, requested));
}

export function RenderModeToggle({
  mode,
  disabled3d,
  onChange,
}: {
  mode: RenderMode;
  disabled3d: boolean;
  onChange: (mode: RenderMode) => void;
}) {
  return <div className="render-mode-toggle" role="group" aria-label="Image rendering mode">
    <button className={mode === "2d" ? "active" : ""} aria-pressed={mode === "2d"} onClick={() => onChange("2d")}>2D</button>
    <button className={mode === "3d" ? "active" : ""} aria-pressed={mode === "3d"} disabled={disabled3d} title={disabled3d ? "No safe 3D level is available" : undefined} onClick={() => onChange("3d")}>3D</button>
  </div>;
}

function physicalScale(capability: Capability | null): { size: number; unit: string } | undefined {
  if (!capability?.datasets?.length) return undefined;
  const xIndex = capability.axes.findIndex((axis) => axis.name === "x");
  const transformations = capability.datasets[0].coordinate_transformations;
  if (xIndex < 0 || !Array.isArray(transformations)) return undefined;
  const scale = transformations.find((item: any) => item?.type === "scale" && Array.isArray(item.scale)) as any;
  const size = Number(scale?.scale?.[xIndex]);
  return Number.isFinite(size) && size > 0 ? { size, unit: capability.axes[xIndex].unit || "px" } : undefined;
}

export function fieldLabelPath(labelPath: string, initialPath: string, fieldPath: string): string {
  if (initialPath === ".") return labelPath;
  return labelPath === initialPath || labelPath.startsWith(`${initialPath}/`)
    ? `${fieldPath}${labelPath.slice(initialPath.length)}`
    : labelPath;
}

export function focusedLabelStates(
  capability: Capability,
  field: string,
  focus: Pick<DeepLinkState, "labelPath" | "labelChannel" | "labelValue">,
): LabelState[] {
  const states = labelStates(capability);
  if (focus.labelChannel != null) {
    return [
      ...states.map((state) => ({ ...state, visible: false })),
      {
        id: `focused-channel-${focus.labelChannel}`,
        name: `Label channel ${focus.labelChannel}`,
        path: `${field}:channel:${focus.labelChannel}`,
        visible: true,
        opacity: 1,
        mode: "outline",
        color: "#FFFF00",
        highlightValue: focus.labelValue,
      },
    ];
  }
  if (!focus.labelPath) return states;
  return states.map((state) => {
    const matches = fieldLabelPath(state.path, capability.initial_path, field) === focus.labelPath;
    return {
      ...state,
      visible: matches,
      ...(matches ? { opacity: 1, mode: "outline" as const, highlightValue: focus.labelValue } : {}),
    };
  });
}

export function roiPngUrl(
  capability: Capability,
  state: DeepLinkState & { field?: string; z: number; t: number },
  visibleChannels: ChannelState[],
): string | undefined {
  if (!capability.store.roi_url || !state.roi) return undefined;
  const url = new URL(capability.store.roi_url, window.location.href);
  url.searchParams.set("field", state.field || capability.initial_path);
  url.searchParams.set("roi", [state.roi.x0, state.roi.y0, state.roi.x1, state.roi.y1].join(","));
  url.searchParams.set("z", String(state.z));
  url.searchParams.set("t", String(state.t));
  const selected = visibleChannels.filter((channel) => channel.visible).map((channel) => channel.index + 1);
  if (selected.length) url.searchParams.set("sourceChannels", selected.join(","));
  if (state.labelPath) url.searchParams.set("labelPath", state.labelPath);
  if (state.labelChannel != null) url.searchParams.set("labelChannel", String(state.labelChannel));
  if (state.labelValue != null) url.searchParams.set("labelValue", String(state.labelValue));
  const storeUuid = state.storeUuid || capability.store.uuid;
  if (storeUuid) url.searchParams.set("storeUuid", storeUuid);
  return url.toString();
}

export default function App() {
  const imageId = useMemo(() => selectedImageId(), []);
  const deepLink = useMemo(() => parseDeepLink(), []);
  const [capability, setCapability] = useState<Capability | null>(null);
  const [authStore, setAuthStore] = useState<AuthenticatedZarrStore | null>(null);
  const [loaded, setLoaded] = useState<LoadedData | null>(null);
  const [status, setStatus] = useState("Loading image metadata…");
  const [error, setError] = useState<string | null>(null);
  const [field, setField] = useState<string | undefined>(deepLink.field);
  const [channels, setChannels] = useState<ChannelState[]>([]);
  const [channelAnalyses, setChannelAnalyses] = useState<ChannelAnalysis[]>([]);
  const [labels, setLabels] = useState<LabelState[]>([]);
  const [zIndex, setZIndex] = useState(deepLink.z || 0);
  const [tIndex, setTIndex] = useState(deepLink.t || 0);
  const [projection, setProjection] = useState<ProjectionMode>(deepLink.projection || "slice");
  const [viewport, setViewport] = useState<ViewportState | undefined>(deepLink.viewport);
  const [renderMode, setRenderMode] = useState<RenderMode>(deepLink.renderMode || "2d");
  const [volumeLevel, setVolumeLevel] = useState<number | undefined>(deepLink.volumeLevel);
  const [volumeCamera, setVolumeCamera] = useState<VolumeCameraState | undefined>(deepLink.volumeCamera);
  const [volumeReset, setVolumeReset] = useState(0);
  const [maxTextureSize, setMaxTextureSize] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<"field" | "well" | "plate">("field");
  const [plateFieldIndex, setPlateFieldIndex] = useState(0);
  const [showMinimap, setShowMinimap] = useState(true);
  const [showScale, setShowScale] = useState(true);
  const [viewerRef, viewerSize] = useElementSize<HTMLDivElement>();
  const initializedZ = useRef(false);
  const fittedRoi = useRef("");
  const analyzedProjection = useRef<ProjectionMode>(projection);
  const displayLoader = useMemo(() => loaded ? projectLoader(loaded.image, projection) : null, [loaded, projection]);
  const currentLoaded = loaded?.path === field ? loaded : null;
  const volumeChannels = useMemo(() => activeVolumeChannels(channels), [channels]);
  const allVolumeLevels = useMemo(
    () => currentLoaded && maxTextureSize != null
      ? volumeLevels(currentLoaded.image, volumeChannels.length, maxTextureSize)
      : [],
    [currentLoaded, volumeChannels.length, maxTextureSize],
  );
  const availableVolumeLevels = useMemo(() => safeVolumeLevels(allVolumeLevels), [allVolumeLevels]);
  const selectedVolumeLevel = useMemo(
    () => chooseVolumeLevel(allVolumeLevels, volumeLevel),
    [allVolumeLevels, volumeLevel],
  );
  const volumeAvailable = Boolean(
    currentLoaded && currentLoaded.sizeZ > 1 && volumeChannels.length && selectedVolumeLevel,
  );
  const effectiveRenderMode: RenderMode = renderMode === "3d" && volumeAvailable ? "3d" : "2d";
  const visibleChannelCount = channels.filter((channel) => channel.visible).length;
  const volumeChannelWarning = visibleChannelCount > volumeChannels.length
    ? `3D loads the first ${volumeChannels.length} visible channels; hide another channel to change the set.`
    : undefined;

  useEffect(() => {
    setMaxTextureSize(detectMax3dTextureSize());
  }, []);

  const refreshCapability = useCallback(async () => {
    if (!imageId) throw new ViewerApiError("missing_image", "No OMERO image was selected", 400);
    const value = await fetchCapabilities(imageId);
    if (
      deepLink.storeUuid
      && value.store.uuid?.toLowerCase() !== deepLink.storeUuid.toLowerCase()
    ) {
      throw new ViewerApiError(
        "store_uuid_mismatch",
        "This link targets a different CI Segmentation output store",
        409,
      );
    }
    setCapability(value);
    return value;
  }, [imageId, deepLink.storeUuid]);

  useEffect(() => {
    if (!imageId) {
      setError("Open the viewer from one OME-Zarr image in OMERO.web, or supply ?image=<id>.");
      return;
    }
    refreshCapability().then((value) => {
      const controller = new AuthenticatedZarrStore(value, refreshCapability);
      setAuthStore(controller);
      setField((current) => {
        const validFields = value.plate?.wells.flatMap((well) => well.fields.map((item) => item.path)) || [];
        return current && validFields.includes(current) ? current : value.initial_path;
      });
    }).catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to load OME-Zarr capabilities"));
  }, [imageId, refreshCapability]);

  useEffect(() => {
    if (!capability || !authStore || !field) return;
    let cancelled = false;
    setStatus("Opening multiscale image…");
    setError(null);
    const load = async () => {
      const imageResult = await loadOmeZarrFromStore(new PrefixStore(authStore.store, field) as any);
      const imageLoader = attachNgffPhysicalSizes(imageResult.data, imageResult.metadata);
      const labelResults = await Promise.allSettled(capability.labels.map(async (label) => {
        const path = fieldLabelPath(label.path, capability.initial_path, field);
        const result = await loadOmeZarrFromStore(new PrefixStore(authStore.store, path) as any);
        return { id: label.id, loader: attachNgffPhysicalSizes(result.data, result.metadata) };
      }));
      if (cancelled) return;
      const next: LoadedData = {
        path: field,
        image: imageLoader,
        labels: [
          ...labelResults.filter((item): item is PromiseFulfilledResult<any> => item.status === "fulfilled").map((item) => item.value),
          ...(deepLink.labelChannel != null && deepLink.labelChannel <= axisSize(imageLoader, "c")
            ? [{
                id: `focused-channel-${deepLink.labelChannel}`,
                loader: imageLoader,
                channelIndex: deepLink.labelChannel - 1,
              }]
            : []),
        ],
        sizeC: axisSize(imageResult.data, "c"),
        sizeZ: axisSize(imageResult.data, "z"),
        sizeT: axisSize(imageResult.data, "t"),
      };
      const nextZ = !initializedZ.current
        ? defaultZIndex(next.sizeZ, deepLink.z)
        : defaultZIndex(next.sizeZ, zIndex);
      const nextT = Math.min(tIndex, next.sizeT - 1);
      initializedZ.current = true;
      setStatus("Calculating automatic channel ranges…");
      const defaults = channelStates(capability, next.image);
      const analysisLoader = projectLoader(next.image, projection);
      const analyses = await analyzeChannels(analysisLoader, defaults, projection === "slice" ? nextZ : 0, nextT);
      const scaled = applyChannelAnalysis(defaults, analyses);
      analyzedProjection.current = projection;
      setLoaded(next);
      setChannelAnalyses(analyses);
      setChannels((current) => {
        const restored = applyChannelDeepLink(scaled, current.length ? current : deepLink.channels);
        return !current.length && !deepLink.channels
          ? applySourceChannels(restored, deepLink.sourceChannels)
          : restored;
      });
      setLabels((current) => {
        const defaults = focusedLabelStates(capability, field, deepLink);
        return applyLabelDeepLink(defaults, current.length ? current : deepLink.labels);
      });
      setZIndex(nextZ);
      setTIndex(nextT);
      setStatus(labelResults.some((item) => item.status === "rejected") ? "Image ready; one or more label layers are unavailable for this field." : "Ready");
    };
    load().catch((reason) => setError(reason instanceof Error ? reason.message : "The OME-Zarr image could not be opened"));
    return () => { cancelled = true; };
  }, [capability, authStore, field]);

  useEffect(() => {
    if (!deepLink.roi || !field || viewerSize.width <= 0 || viewerSize.height <= 0) return;
    const key = `${field}:${viewerSize.width}:${viewerSize.height}`;
    if (fittedRoi.current === key) return;
    fittedRoi.current = key;
    setViewport(fitRoiViewport(deepLink.roi, viewerSize.width, viewerSize.height));
  }, [deepLink.roi, field, viewerSize.width, viewerSize.height]);

  useEffect(() => {
    if (renderMode !== "3d" || !currentLoaded || maxTextureSize == null) return;
    if (currentLoaded.sizeZ <= 1) {
      setRenderMode("2d");
      setStatus("3D is unavailable because this field has only one Z plane.");
      return;
    }
    if (maxTextureSize === 0) {
      setRenderMode("2d");
      setStatus("3D is unavailable because WebGL 2 could not be initialized.");
      return;
    }
    if (!volumeChannels.length) {
      setRenderMode("2d");
      setStatus("Enable at least one image channel before opening 3D.");
      return;
    }
    if (!selectedVolumeLevel) {
      setRenderMode("2d");
      setStatus("No multiscale level fits the 256 MiB 3D memory and GPU texture limits.");
      return;
    }
    if (volumeLevel !== selectedVolumeLevel.index) {
      setVolumeLevel(selectedVolumeLevel.index);
      if (volumeLevel != null) setStatus("The requested 3D quality was unsafe; using the coarsest safe level.");
    }
  }, [renderMode, currentLoaded, maxTextureSize, volumeChannels.length, selectedVolumeLevel, volumeLevel]);

  useEffect(() => {
    if (!loaded || !displayLoader || !channels.length || analyzedProjection.current === projection) return;
    analyzedProjection.current = projection;
    let cancelled = false;
    setStatus(projection === "slice" ? "Calculating slice ranges…" : "Calculating projection ranges…");
    analyzeChannels(displayLoader, channels, projection === "slice" ? zIndex : 0, tIndex).then((analyses) => {
      if (cancelled) return;
      setChannelAnalyses(analyses);
      setChannels((current) => applyChannelAnalysis(current, analyses));
      setStatus("Ready");
    }).catch((reason) => {
      if (!cancelled) setStatus(`Projection warning: ${reason instanceof Error ? reason.message : "range calculation failed"}`);
    });
    return () => { cancelled = true; };
  }, [projection, displayLoader]);

  useEffect(() => {
    if (!imageId || !loaded) return;
    const timeout = window.setTimeout(() => {
      const relative = writeDeepLink(imageId, {
        viewport,
        z: zIndex,
        t: tIndex,
        projection,
        renderMode: effectiveRenderMode,
        volumeLevel: selectedVolumeLevel?.index,
        volumeCamera,
        field,
        roi: deepLink.roi,
        sourceChannels: deepLink.sourceChannels,
        labelPath: deepLink.labelPath,
        labelChannel: deepLink.labelChannel,
        labelValue: deepLink.labelValue,
        storeUuid: deepLink.storeUuid,
        channels,
        labels,
      });
      window.history.replaceState(null, "", relative);
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [imageId, loaded, viewport, zIndex, tIndex, projection, effectiveRenderMode, selectedVolumeLevel, volumeCamera, field, channels, labels]);

  if (error && !capability) return <main className="fatal"><h1>OME-Zarr Viewer</h1><p>{error}</p></main>;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div><strong>BIOMERO OME-Zarr Viewer</strong><span>{capability?.plate ? field : capability?.image.name || "Loading…"}</span></div>
        <div className="toolbar">
          <span className="status" aria-live="polite">{error || status}</span>
          {currentLoaded && viewMode === "field" && currentLoaded.sizeZ > 1 &&
            <RenderModeToggle
              mode={effectiveRenderMode}
              disabled3d={!volumeAvailable}
              onChange={(mode) => {
                if (mode === "3d" && selectedVolumeLevel) setVolumeLevel(selectedVolumeLevel.index);
                setRenderMode(mode);
              }}
            />}
          {currentLoaded && viewMode === "field" && effectiveRenderMode === "2d" && <>
            <button className={showMinimap ? "active" : ""} aria-pressed={showMinimap} onClick={() => setShowMinimap((value) => !value)}>Show Navigator</button>
            <button className={showScale ? "active" : ""} aria-pressed={showScale} onClick={() => setShowScale((value) => !value)}>Show Scale</button>
            {deepLink.roi && capability && <a
              className="toolbar-button"
              href={roiPngUrl(capability, {
                ...deepLink,
                field,
                z: zIndex,
                t: tIndex,
              }, channels)}
              download
            >Download ROI PNG</a>}
          </>}
          {currentLoaded && viewMode === "field" && effectiveRenderMode === "3d" &&
            <button onClick={() => {
              setVolumeCamera(undefined);
              setVolumeReset((value) => value + 1);
            }}>Reset 3D View</button>}
          <button onClick={() => void document.documentElement.requestFullscreen()}>Fullscreen</button>
        </div>
      </header>
      <div className="workspace">
        <main className="viewer-host" ref={viewerRef}>
          {capability?.plate && authStore && viewMode !== "field" ? (
            <OverviewGrid
              capability={capability}
              store={authStore.store}
              mode={viewMode}
              selectedPath={field}
              plateFieldIndex={plateFieldIndex}
              channels={channels}
              z={zIndex}
              t={tIndex}
              onSelect={(path) => {
                setField(path);
                setVolumeLevel(undefined);
                setVolumeCamera(undefined);
              }}
              onOpen={(path) => {
                setField(path);
                setVolumeLevel(undefined);
                setVolumeCamera(undefined);
                setViewMode(viewMode === "plate" ? "well" : "field");
              }}
            />
          ) : currentLoaded && displayLoader && viewerSize.width > 0 && viewerSize.height > 0 && effectiveRenderMode === "3d" && selectedVolumeLevel ? (
            <VolumeCanvas
              key={`${currentLoaded.path}:${tIndex}:${selectedVolumeLevel.index}:${volumeChannels.map((channel) => channel.index).join(",")}:${volumeReset}`}
              width={viewerSize.width}
              height={viewerSize.height}
              loader={currentLoaded.image}
              channels={channels}
              t={tIndex}
              resolution={selectedVolumeLevel.index}
              camera={volumeCamera}
              onCameraChange={setVolumeCamera}
              onCancel={() => setRenderMode("2d")}
              onError={(message) => setStatus(`3D warning: ${message}`)}
              onReady={() => setStatus(volumeChannelWarning || "3D volume ready")}
            />
          ) : currentLoaded && displayLoader && viewerSize.width > 0 && viewerSize.height > 0 ? (
            <ViewerCanvas
              width={viewerSize.width}
              height={viewerSize.height}
              loader={displayLoader}
              labels={currentLoaded.labels}
              channels={channels}
              labelStates={labels}
              z={zIndex}
              t={tIndex}
              viewport={viewport}
              showMinimap={showMinimap}
              showScale={showScale}
              physicalScale={physicalScale(capability)}
              onViewportChange={setViewport}
              onTileError={(message) => setStatus(`Tile warning: ${message}`)}
            />
          ) : <div className="loading">{error || status}</div>}
        </main>
        <ViewerPanel
          capability={capability}
          field={field}
          onField={(path) => {
            setField(path);
            setVolumeLevel(undefined);
            setVolumeCamera(undefined);
          }}
          channels={channels}
          channelAnalyses={channelAnalyses}
          onChannels={setChannels}
          labels={labels}
          onLabels={setLabels}
          sizeZ={currentLoaded?.sizeZ || 1}
          sizeT={currentLoaded?.sizeT || 1}
          z={zIndex}
          t={tIndex}
          onZ={setZIndex}
          onT={setTIndex}
          projection={projection}
          onProjection={setProjection}
          renderMode={effectiveRenderMode}
          volumeLevels={availableVolumeLevels}
          volumeLevel={selectedVolumeLevel?.index}
          onVolumeLevel={setVolumeLevel}
          volumeChannelWarning={volumeChannelWarning}
          viewMode={viewMode}
          onViewMode={setViewMode}
          plateFieldIndex={plateFieldIndex}
          onPlateFieldIndex={setPlateFieldIndex}
        />
      </div>
    </div>
  );
}

interface ViewerPanelProps {
  capability: Capability | null;
  field?: string;
  onField: (path: string) => void;
  channels: ChannelState[];
  channelAnalyses: ChannelAnalysis[];
  onChannels: (value: ChannelState[]) => void;
  labels: LabelState[];
  onLabels: (value: LabelState[]) => void;
  sizeZ: number;
  sizeT: number;
  z: number;
  t: number;
  onZ: (value: number) => void;
  onT: (value: number) => void;
  projection: ProjectionMode;
  onProjection: (value: ProjectionMode) => void;
  renderMode: RenderMode;
  volumeLevels: VolumeLevel[];
  volumeLevel?: number;
  onVolumeLevel: (value: number) => void;
  volumeChannelWarning?: string;
  viewMode: "field" | "well" | "plate";
  onViewMode: (value: "field" | "well" | "plate") => void;
  plateFieldIndex: number;
  onPlateFieldIndex: (value: number) => void;
}

export function ViewerPanel(props: ViewerPanelProps) {
  const [plateTab, setPlateTab] = useState<"navigation" | "view">("navigation");
  const [viewTab, setViewTab] = useState<"channels" | "labels">("channels");
  const { capability } = props;
  const showNavigation = Boolean(capability?.plate && plateTab === "navigation");
  const datasetName = capability?.plate?.name || capability?.image.name || "Loading dataset…";

  useEffect(() => {
    if (props.renderMode === "3d" && viewTab === "labels") setViewTab("channels");
  }, [props.renderMode, viewTab]);

  return <aside className="control-panel">
    <div className="dataset-heading"><span aria-hidden="true">▰</span><strong>{datasetName}</strong></div>
    {capability?.plate && <div className="panel-tabs primary-tabs" role="tablist" aria-label="Plate controls">
      <button role="tab" aria-selected={plateTab === "navigation"} className={plateTab === "navigation" ? "active" : ""} onClick={() => setPlateTab("navigation")}>Navigation</button>
      <button role="tab" aria-selected={plateTab === "view"} className={plateTab === "view" ? "active" : ""} onClick={() => setPlateTab("view")}>View options</button>
    </div>}
    {showNavigation && capability ? <PlateNavigation capability={capability} field={props.field} onField={props.onField} mode={props.viewMode} onMode={props.onViewMode} plateFieldIndex={props.plateFieldIndex} onPlateFieldIndex={props.onPlateFieldIndex} /> : <>
      <div className="panel-tabs content-tabs" role="tablist" aria-label="Image layers">
        <button role="tab" aria-selected={viewTab === "channels"} className={viewTab === "channels" ? "active" : ""} onClick={() => setViewTab("channels")}>Channels ({props.channels.length})</button>
        <button role="tab" aria-selected={viewTab === "labels"} className={viewTab === "labels" ? "active" : ""} disabled={props.renderMode === "3d"} title={props.renderMode === "3d" ? "Segmentation labels are available in 2D" : undefined} onClick={() => setViewTab("labels")}>Labels ({props.labels.length})</button>
      </div>
      <div className="panel-scroll">
        {viewTab === "channels" ? <>
          <ChannelPanel channels={props.channels} analyses={props.channelAnalyses} onChange={props.onChannels} />
          {props.renderMode === "3d"
            ? <VolumeControls
                sizeT={props.sizeT}
                t={props.t}
                onT={props.onT}
                levels={props.volumeLevels}
                level={props.volumeLevel}
                onLevel={props.onVolumeLevel}
                channelWarning={props.volumeChannelWarning}
              />
            : <PlaneControls sizeZ={props.sizeZ} sizeT={props.sizeT} z={props.z} t={props.t} projection={props.projection} onZ={props.onZ} onT={props.onT} onProjection={props.onProjection} />}
        </> : <LabelPanel labels={props.labels} onChange={props.onLabels} />}
      </div>
    </>}
    {capability && <div className="source-strip"><span>NGFF {capability.ngff_version}</span><span>Zarr v{capability.zarr_format}</span><span>{capability.kind}</span></div>}
  </aside>;
}

function ChannelPanel({ channels, analyses, onChange }: { channels: ChannelState[]; analyses: ChannelAnalysis[]; onChange: (value: ChannelState[]) => void }) {
  const [histograms, setHistograms] = useState<Set<number>>(new Set());
  const analysisByIndex = new Map(analyses.map((analysis) => [analysis.index, analysis]));
  const update = (index: number, patch: Partial<ChannelState>) => onChange(channels.map((item) => item.index === index ? { ...item, ...patch } : item));
  const apply = (channel: ChannelState, mode: "auto" | "fit") => {
    const analysis = analysisByIndex.get(channel.index);
    if (!analysis) return;
    update(channel.index, mode === "auto"
      ? { low: analysis.autoLow, high: analysis.autoHigh }
      : { low: analysis.fitLow, high: analysis.fitHigh });
  };
  const toggleHistogram = (index: number) => setHistograms((current) => {
    const next = new Set(current);
    next.has(index) ? next.delete(index) : next.add(index);
    return next;
  });

  return <section className="panel-section channel-panel">
    <div className="settings-row"><strong>Display</strong><span>additive blend</span></div>
    {channels.length === 0 && <p className="muted">Loading channels…</p>}
    {channels.map((channel) => {
      const analysis = analysisByIndex.get(channel.index);
      const showHistogram = histograms.has(channel.index);
      return <div className="layer-card" key={channel.index}>
        <label className="layer-heading"><input type="checkbox" checked={channel.visible} onChange={(event) => update(channel.index, { visible: event.target.checked })}/><strong>{channel.label}</strong><input aria-label={`${channel.label} color`} type="color" value={channel.color} onChange={(event) => update(channel.index, { color: event.target.value })}/></label>
        <div className="contrast-heading"><span>Contrast</span><div className="micro-actions"><button onClick={() => apply(channel, "auto")} disabled={!analysis}>AUTO</button><button onClick={() => apply(channel, "fit")} disabled={!analysis}>FIT</button><button className={showHistogram ? "active" : ""} aria-pressed={showHistogram} onClick={() => toggleHistogram(channel.index)} disabled={!analysis}>HIST</button></div></div>
        {showHistogram && analysis && <Histogram values={analysis.histogram} color={channel.color} />}
        <DualRange channel={channel} analysis={analysis} onChange={(patch) => update(channel.index, patch)} />
      </div>;
    })}
  </section>;
}

function Histogram({ values, color }: { values: number[]; color: string }) {
  const maximum = Math.max(1, ...values);
  return <div className="histogram" aria-label="Sampled intensity histogram">{values.map((value, index) => <i key={index} style={{ height: `${Math.max(2, Math.log1p(value) / Math.log1p(maximum) * 100)}%`, backgroundColor: color }}/>)}</div>;
}

function DualRange({ channel, analysis, onChange }: { channel: ChannelState; analysis?: ChannelAnalysis; onChange: (patch: Partial<ChannelState>) => void }) {
  const rangeMin = analysis?.fitLow ?? channel.domainMin;
  const rangeMax = analysis?.fitHigh ?? channel.domainMax;
  const span = Math.max(Number.EPSILON, rangeMax - rangeMin);
  const low = Math.max(rangeMin, Math.min(rangeMax, channel.low));
  const high = Math.max(low, Math.min(rangeMax, channel.high));
  const start = (low - rangeMin) / span * 100;
  const end = (high - rangeMin) / span * 100;
  const step = Number.isInteger(rangeMin) && Number.isInteger(rangeMax) ? 1 : span / 1000;
  const style = { "--range-start": `${start}%`, "--range-end": `${end}%`, "--range-color": channel.color } as CSSProperties;
  return <div className="dual-range">
    <div className="range-track" style={style}>
      <input aria-label={`${channel.label} display minimum`} type="range" min={rangeMin} max={rangeMax} step={step} value={low} onChange={(event) => onChange({ low: Math.min(Number(event.target.value), high) })}/>
      <input aria-label={`${channel.label} display maximum`} type="range" min={rangeMin} max={rangeMax} step={step} value={high} onChange={(event) => onChange({ high: Math.max(Number(event.target.value), low) })}/>
    </div>
    <div className="range-values"><input aria-label={`${channel.label} minimum value`} type="number" min={rangeMin} max={high} step={step} value={low} onChange={(event) => onChange({ low: Math.max(rangeMin, Math.min(Number(event.target.value), high)) })}/><input aria-label={`${channel.label} maximum value`} type="number" min={low} max={rangeMax} step={step} value={high} onChange={(event) => onChange({ high: Math.min(rangeMax, Math.max(Number(event.target.value), low)) })}/></div>
  </div>;
}

function PlaneControls({ sizeZ, sizeT, z, t, projection, onZ, onT, onProjection }: {
  sizeZ: number;
  sizeT: number;
  z: number;
  t: number;
  projection: ProjectionMode;
  onZ: (v: number) => void;
  onT: (v: number) => void;
  onProjection: (value: ProjectionMode) => void;
}) {
  if (sizeZ === 1 && sizeT === 1) return null;
  const projections: Array<{ value: ProjectionMode; label: string }> = [
    { value: "slice", label: "Slice" },
    { value: "mip", label: "MIP" },
    { value: "mean", label: "Mean" },
    { value: "min", label: "Min" },
  ];
  return <section className="panel-section position-section"><h2>Position</h2>
    {sizeZ > 1 && <>
      <div className="projection-control"><span>Projection</span><div className="mode-toggle projection-toggle" role="group" aria-label="Z projection mode">
        {projections.map((item) => <button key={item.value} className={projection === item.value ? "active" : ""} aria-pressed={projection === item.value} onClick={() => onProjection(item.value)}>{item.label}</button>)}
      </div></div>
      {projection === "slice"
        ? <label className="slider">Z <input type="range" min="0" max={sizeZ - 1} value={z} onChange={(e) => onZ(Number(e.target.value))}/><output>{z + 1}/{sizeZ}</output></label>
        : <p className="projection-note">Using all {sizeZ} Z slices</p>}
    </>}
    {sizeT > 1 && <label className="slider">T <input type="range" min="0" max={sizeT - 1} value={t} onChange={(e) => onT(Number(e.target.value))}/><output>{t + 1}/{sizeT}</output></label>}
  </section>;
}

export function VolumeControls({
  sizeT,
  t,
  onT,
  levels,
  level,
  onLevel,
  channelWarning,
}: {
  sizeT: number;
  t: number;
  onT: (value: number) => void;
  levels: VolumeLevel[];
  level?: number;
  onLevel: (value: number) => void;
  channelWarning?: string;
}) {
  return <section className="panel-section position-section volume-controls">
    <h2>3D Volume</h2>
    <label className="quality-control">
      <span>Quality</span>
      <select aria-label="3D volume quality" value={level ?? ""} onChange={(event) => onLevel(Number(event.target.value))}>
        {levels.map((item) => <option key={item.index} value={item.index}>
          Level {item.index} · {item.width}×{item.height}×{item.depth} · {formatBytes(item.rawBytes)}
        </option>)}
      </select>
    </label>
    <p className="projection-note">Only visible intensity channels are loaded. Quality and visibility changes reload the volume.</p>
    {channelWarning && <p className="volume-warning" role="status">{channelWarning}</p>}
    {sizeT > 1 && <label className="slider">T <input type="range" min="0" max={sizeT - 1} value={t} onChange={(event) => onT(Number(event.target.value))}/><output>{t + 1}/{sizeT}</output></label>}
  </section>;
}

function LabelPanel({ labels, onChange }: { labels: LabelState[]; onChange: (value: LabelState[]) => void }) {
  const update = (id: string, patch: Partial<LabelState>) => onChange(labels.map((item) => item.id === id ? { ...item, ...patch } : item));
  const move = (index: number, delta: number) => { const copy = [...labels]; const target = index + delta; if (target < 0 || target >= copy.length) return; [copy[index], copy[target]] = [copy[target], copy[index]]; onChange(copy); };
  return <section className="panel-section label-panel">{labels.length === 0 && <div className="empty-state"><strong>No NGFF label images</strong><p>This field has no segmentation layers advertised in its label-group metadata.</p></div>}{labels.map((label, index) => <div className="layer-card" key={label.id}>
    <label className="layer-heading"><input type="checkbox" checked={label.visible} onChange={(e) => update(label.id, { visible: e.target.checked })}/><strong>{label.name}</strong>{label.color && <input aria-label={`${label.name} fixed color`} type="color" value={label.color} onChange={(e) => update(label.id, { color: e.target.value })}/>}</label>
    <label className="slider">Opacity<input type="range" min="0" max="1" step="0.05" value={label.opacity} onChange={(e) => update(label.id, { opacity: Number(e.target.value) })}/><output>{Math.round(label.opacity * 100)}%</output></label>
    <div className="label-actions">
      <div className="mode-toggle" role="group" aria-label={`${label.name} display mode`}>
        <button className={label.mode === "fill" ? "active" : ""} aria-pressed={label.mode === "fill"} onClick={() => update(label.id, { mode: "fill" })}>Fill</button>
        <button className={label.mode === "outline" ? "active" : ""} aria-pressed={label.mode === "outline"} onClick={() => update(label.id, { mode: "outline" })}>Outline</button>
      </div>
      <div className="reorder-actions"><button aria-label={`Move ${label.name} up`} onClick={() => move(index, -1)}>↑</button><button aria-label={`Move ${label.name} down`} onClick={() => move(index, 1)}>↓</button></div>
    </div>
  </div>)}</section>;
}

function PlateNavigation({ capability, field, onField, mode, onMode, plateFieldIndex, onPlateFieldIndex }: {
  capability: Capability;
  field?: string;
  onField: (path: string) => void;
  mode: "field" | "well" | "plate";
  onMode: (value: "field" | "well" | "plate") => void;
  plateFieldIndex: number;
  onPlateFieldIndex: (value: number) => void;
}) {
  const plate = capability.plate!;
  const selectedWell = plate.wells.find((well) => well.fields.some((item) => item.path === field));
  const populatedWells = [...plate.wells].filter((well) => well.fields.length).sort((a, b) => a.row_index - b.row_index || a.column_index - b.column_index);
  const selectedIndex = Math.max(0, populatedWells.findIndex((well) => well === selectedWell));
  const selectedField = selectedWell?.fields.find((item) => item.path === field);
  const wellName = selectedWell ? `${plate.rows[selectedWell.row_index]}/${plate.columns[selectedWell.column_index]}` : "—";
  const goToWell = (index: number) => populatedWells[index]?.fields[0] && onField(populatedWells[index].fields[0].path);
  const maxFieldCount = Math.max(1, ...populatedWells.map((well) => well.fields.length));

  return <div className="navigation-panel">
    <div className="panel-tabs navigation-tabs" role="tablist" aria-label="Plate navigation level">
      {(["field", "well", "plate"] as const).map((value) => <button key={value} role="tab" aria-selected={mode === value} className={mode === value ? "active" : ""} onClick={() => onMode(value)}>{value[0].toUpperCase() + value.slice(1)}</button>)}
    </div>
    <div className="well-toolbar"><button aria-label="Previous well" disabled={selectedIndex <= 0} onClick={() => goToWell(selectedIndex - 1)}>◀</button><div><span>Well <strong>{wellName}</strong></span>{mode === "plate" ? <label className="plate-field-picker">Field <select aria-label="Plate thumbnail field" value={plateFieldIndex} onChange={(event) => onPlateFieldIndex(Number(event.target.value))}>{Array.from({ length: maxFieldCount }, (_, index) => <option key={index} value={index}>{index}</option>)}</select></label> : selectedWell && <small>{selectedIndex + 1} of {populatedWells.length}</small>}</div><button aria-label="Next well" disabled={selectedIndex >= populatedWells.length - 1} onClick={() => goToWell(selectedIndex + 1)}>▶</button></div>
    {mode === "field" && selectedWell && <label className="field-toolbar"><span>Field</span><select aria-label="Select field" value={field} onChange={(event) => onField(event.target.value)}>{selectedWell.fields.map((item, index) => <option key={item.path} value={item.path}>{item.name || index}</option>)}</select><small>{selectedWell.fields.findIndex((item) => item === selectedField) + 1} of {selectedWell.fields.length}</small></label>}
    {mode === "well" && selectedWell && <p className="overview-hint">All {selectedWell.fields.length} fields are shown in the image area. Double-click a field to open it.</p>}
    {mode === "plate" && <p className="overview-hint">One field per populated well is shown in the image area. Double-click a well to inspect all its fields.</p>}
    <PlateGrid capability={capability} field={field} onField={onField} expanded={mode !== "well"} />
  </div>;
}

function PlateGrid({ capability, field, onField, expanded }: { capability: Capability; field?: string; onField: (path: string) => void; expanded: boolean }) {
  const plate = capability.plate!;
  const wells = new Map(plate.wells.map((well) => [`${well.row_index}:${well.column_index}`, well]));
  return <details className="plate-map" open={expanded}>
    <summary><span>{plate.rows.length * plate.columns.length}-well</span><small>{plate.rows.length} × {plate.columns.length}</small></summary>
    <div className="plate-grid" style={{ gridTemplateColumns: `1rem repeat(${plate.columns.length}, minmax(0, 1fr))` }}><span/>{plate.columns.map((column) => <b key={column}>{column}</b>)}{plate.rows.flatMap((row, rowIndex) => [<b key={`r-${row}`}>{row}</b>, ...plate.columns.map((column, columnIndex) => {
      const well = wells.get(`${rowIndex}:${columnIndex}`);
      const active = well?.fields.some((item) => item.path === field);
      const label = `${row}/${column}${well?.fields.length ? `, ${well.fields.length} fields` : ", no data"}`;
      return <button aria-label={label} title={label} key={`${rowIndex}-${columnIndex}`} className={active ? "active" : ""} disabled={!well?.fields.length} onClick={() => well?.fields[0] && onField(well.fields[0].path)}><span/></button>;
    })])}</div>
  </details>;
}

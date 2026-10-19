import { ViewerMetadata } from "./MetadataWindow";
import { MovieExport, TimePlayback } from "./MovieControls";
import { exportVolumeMovie, waitForVolumeFrame } from "./volume-movie";
import { viewerContextId } from "./viewer-context";
import { ViewerHelp } from "./HelpWindow";
import { visibleMovieCrop, type MovieRecipe } from "./movie-recipe";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { loadOmeZarrFromStore, getDefaultInitialViewState } from "@hms-dbmi/viv";
import { capabilityCalibration } from "./calibration";
import { navigationGeometry, fitNavigation, imageZoomNavigation, from2D, to2D, fromViv, toViv, fromNeuroglancer, toNeuroglancer, navigationZ, type SharedNavigation } from "./navigation";
import { fetchCapabilities, selectedImageId, ViewerApiError } from "./api";
import { AuthenticatedZarrStore, PrefixStore } from "./authenticated-store";
import { analyzeChannels, applyChannelAnalysis, dtypeDomain, type ChannelAnalysis, type StatisticsContext } from "./channel-scaling";
import { attachNgffPhysicalSizes } from "./ngff-physical-sizes";
import { projectLoader } from "./projection-loader";
import { projectLabelLoader } from "./label-projection";
import type {
  Capability,
  ChannelState,
  LabelCapability,
  LabelState,
  ProjectionMode,
  RenderMode,
  ViewportState,
  VolumeBlendMode,
  VolumeCameraState,
  VolumeLevel,
  VolumeRenderer,
} from "./types";
import {
  applyChannelDeepLink,
  applyLabelDeepLink,
  applySourceChannels,
  fitRoiViewport,
  parseDeepLink,
  writeDeepLink,
  defaultVolumeBlend,
  type DeepLinkState,
  type OverlayDeepLink,
} from "./viewer-state";
import { ViewerCanvas } from "./ViewerCanvas";
import { VolumeCanvas } from "./VolumeCanvas";
import { ChannelColorPicker } from "./ChannelColorPicker";
import type { VolumeView, SlicePlane } from "./VolumeViewControls";
import { NeuroglancerCanvas } from "./NeuroglancerCanvas";
import type { NeuroglancerCamera } from "./neuroglancer-state";
import { OverviewGrid, defaultPlateFieldIndex } from "./OverviewGrid";
import { plateGeometry } from "./plate-geometry";
import { withVolumeCache, type LoadProgress } from "./volume-loader";
import {
  activeVolumeChannels,
  chooseVolumeLevel,
  detectMax3dTextureSize,
  formatBytes,
  safeVolumeLevels,
  volumeLevels,
} from "./volume-utils";

interface LoadedData {
  capability: Capability;
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


const palette = ["#FFFFFF", "#00FF00", "#FF00FF", "#00FFFF", "#FFFF00", "#FF0000"];
const labelPalette = [
  { name: "Cyan", value: "#00FFFF" },
  { name: "Magenta", value: "#FF00FF" },
  { name: "Yellow", value: "#FFFF00" },
  { name: "Red", value: "#FF0000" },
  { name: "Green", value: "#00FF00" },
  { name: "Blue", value: "#0000FF" },
];

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

export function labelStates(capability: Capability, sizeZ = 1): LabelState[] {
  return capability.labels.map((label) => ({
    id: label.id,
    name: label.name,
    path: label.path,
    visible: true,
    opacity: sizeZ > 1 ? 0.55 : 0.15,
    mode: "fill",
    color: label.color,
    outlineWidth: 2,
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

export function ImageZoomButtons({onFit,onNative}:{onFit:()=>void;onNative:()=>void}) {
  return <>
    <button className="icon-button" aria-label="Zoom fit" title="Fit image to window" onClick={onFit}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5m6 0h5v5m0 6v5h-5m-6 0H4v-5"/><rect x="8" y="8" width="8" height="8" rx="1"/></svg>
    </button>
    <button className="icon-button" aria-label="Zoom 1:1" title="1 image pixel per screen pixel (3D: at view center)" onClick={onNative}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><text x="12" y="15" textAnchor="middle" fontSize="9" stroke="none" fill="currentColor">1:1</text></svg>
    </button>
  </>;
}

export function FullscreenButton() {
  const [active, setActive] = useState(Boolean(document.fullscreenElement));
  useEffect(() => {
    const update = () => setActive(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);
  const toggle = () => active
    ? document.exitFullscreen()
    : document.documentElement.requestFullscreen();
  return <button
    className="icon-button"
    aria-label={active ? "Exit fullscreen" : "Enter fullscreen"}
    title={active ? "Exit fullscreen" : "Enter fullscreen"}
    onClick={() => void toggle()}
  ><svg viewBox="0 0 24 24" aria-hidden="true"><path d={active ? "M3 9h6V3m6 0v6h6M3 15h6v6m6 0v-6h6" : "M9 3H3v6m12-6h6v6M3 15v6h6m6 0h6v-6"}/></svg></button>;
}

export function LayerVisibilityCheckbox({ items, name, disabled = false, onChange }: {
  items: Array<{ visible: boolean }>; name: string; disabled?: boolean; onChange: (visible: boolean) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const all = items.length > 0 && items.every(item => item.visible);
  const some = items.some(item => item.visible);
  useEffect(() => { if (ref.current) ref.current.indeterminate = some && !all; }, [some, all]);
  return <input ref={ref} type="checkbox" aria-label={`Show all ${name}`} title={`Show/hide all ${name}`}
    disabled={disabled || !items.length} checked={all} onChange={event => onChange(event.target.checked)} />;
}

function physicalScale(capability: Capability | null): { size: number; unit: string } | undefined {
  const value=capabilityCalibration(capability).x;
  return value && value.size>0 ? {size:value.size,unit:value.unit} : undefined;
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
  focus: Pick<DeepLinkState, "labelPath" | "labelChannel" | "labelValue" | "overlays">,
  sizeZ = 1,
): LabelState[] {
  const states = labelStates(capability, sizeZ);
  const overlays: OverlayDeepLink[] = focus.overlays?.length
    ? focus.overlays
    : focus.labelPath || focus.labelChannel
      ? [{
          ...(focus.labelPath ? { labelPath: focus.labelPath } : { labelChannel: focus.labelChannel }),
          ...(focus.labelValue ? { values: [focus.labelValue] } : {}),
          mode: "outline",
          color: "#FFFF00",
          opacity: 1,
          outlineWidth: 2,
        }]
      : [];
  if (!overlays.length) return states;
  const result = states.map((state) => ({ ...state, visible: false }));
  for (const overlay of overlays) {
    if (overlay.labelChannel != null) {
      result.push({
        id: `focused-channel-${overlay.labelChannel}`,
        name: `Label channel ${overlay.labelChannel}`,
        path: `${field}:channel:${overlay.labelChannel}`,
        visible: true,
        opacity: overlay.opacity,
        mode: overlay.mode === "fill" ? "fill" : "outline",
        color: overlay.color || "#FFFF00",
        highlightValues: overlay.values,
        outlineWidth: overlay.outlineWidth,
      });
      continue;
    }
    const match = result.find((state) =>
      fieldLabelPath(state.path, capability.initial_path, field) === overlay.labelPath
    );
    if (match) Object.assign(match, {
      visible: true,
      opacity: overlay.opacity,
      mode: overlay.mode === "fill" ? "fill" : "outline",
      color: overlay.color || match.color,
      highlightValues: overlay.values,
      outlineWidth: overlay.outlineWidth,
    });
  }
  return result;
}

function labelOverlays(
  labels: LabelState[],
  capability: Capability | null,
  field?: string,
): OverlayDeepLink[] {
  return labels.filter((label) => label.visible).slice(0, 8).map((label) => {
    const appended = label.path.match(/:channel:(\d+)$/);
    const labelPath = capability && field
      ? fieldLabelPath(label.path, capability!.initial_path, field!)
      : label.path;
    return {
      ...(appended ? { labelChannel: Number(appended[1]) } : { labelPath }),
      ...(label.highlightValues?.length
        ? { values: label.highlightValues }
        : label.highlightValue
          ? { values: [label.highlightValue] }
          : {}),
      mode: label.mode,
      colorMode: label.color ? "solid" : "instance",
      color: label.color,
      opacity: label.opacity,
      outlineWidth: label.outlineWidth || 2,
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
  url.searchParams.set("channelSettings",JSON.stringify(visibleChannels.filter(c=>c.visible).map(({index,color,low,high})=>({index,color,low,high}))));
  if(state.overlays)url.searchParams.set("overlays",JSON.stringify(state.overlays));
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
  const [navigation,setNavigation]=useState<SharedNavigation>();
  const [readyFrameKey,setReadyFrameKey]=useState("");
  const [renderMode, setRenderMode] = useState<RenderMode>(deepLink.renderMode || "2d");
  const [volumeLevel, setVolumeLevel] = useState<number | undefined>(deepLink.volumeLevel);
  const [volumeRenderer, setVolumeRenderer] = useState<VolumeRenderer>(deepLink.volumeRenderer || "neuroglancer");
  const [selectedVolumeBlend, setVolumeBlend] = useState<VolumeBlendMode | undefined>(deepLink.volumeBlend);
  const [volumeBrightness, setVolumeBrightness] = useState(deepLink.volumeBrightness ?? 1);
  const [volumeGain, setVolumeGain] = useState(deepLink.volumeGain ?? -3);
  const [volumeCamera, setVolumeCamera] = useState<VolumeCameraState | undefined>(deepLink.volumeCamera);
  const [volumeView, setVolumeView] = useState<VolumeView>(deepLink.volumeView || "3d");
  const [slicePlane, setSlicePlane] = useState<SlicePlane>(deepLink.slicePlane || "xy");
  const [ngCamera, setNgCamera] = useState<NeuroglancerCamera | undefined>(deepLink.ngCamera);
  const [ngViewId] = useState(viewerContextId);
  const ngCameraField = useRef(field);
  useEffect(() => {
    if (ngCameraField.current != null && ngCameraField.current !== field) setNgCamera(undefined);
    ngCameraField.current = field;
  }, [field]);
  const [volumeReset, setVolumeReset] = useState(0);
  const [maxTextureSize, setMaxTextureSize] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<"field" | "well" | "plate">(deepLink.view || "field");
  const [plateFieldIndex, setPlateFieldIndex] = useState(deepLink.plateField || 0);
  const [showMinimap, setShowMinimap] = useState(true);
  const [showScale, setShowScale] = useState(true);
  const [viewerRef, viewerSize] = useElementSize<HTMLDivElement>();
  const initializedZ = useRef(false);
  const fittedRoi = useRef("");
  const analyzedProjection = useRef<string>(projection);
  const [loadProgress, setLoadProgress] = useState<LoadProgress>({busy:false,fraction:0,phase:""});
  const reportLoadProgress = useCallback((value: LoadProgress) => setLoadProgress(value), []);
  const displayLoader = useMemo(() => loaded ? projectLoader(loaded.image, projection) : null, [loaded, projection]);
  const labelProjectionKey = JSON.stringify(labels.map(label => [label.id, label.highlightValues || (label.highlightValue ? [label.highlightValue] : [])]));
  const displayLabels = useMemo(() => loaded?.labels.map(label => {
    const state = labels.find(item => item.id === label.id);
    const values = state?.highlightValues?.length ? state.highlightValues : state?.highlightValue ? [state.highlightValue] : undefined;
    return { ...label, loader: projectLabelLoader(label.loader, projection, values) };
  }) || [], [loaded, projection, labelProjectionKey]);
  const currentLoaded = loaded?.path === field ? loaded : null;
  const displayCapability = currentLoaded?.capability || capability;
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
  const ngAvailable = Boolean(authStore?.neuroglancerUrl);
  const useNeuroglancer = ngAvailable && volumeRenderer === "neuroglancer";
  const volumeBlend = selectedVolumeBlend ?? defaultVolumeBlend(useNeuroglancer ? "neuroglancer" : "classic");
  const volumeAvailable = Boolean(currentLoaded && currentLoaded.sizeZ > 1 && selectedVolumeLevel);
  const effectiveRenderMode: RenderMode = renderMode === "3d" && volumeAvailable ? "3d" : "2d";
  const statisticsContext:StatisticsContext={field:field||"",renderMode:effectiveRenderMode,projection,z:zIndex,t:tIndex,level:selectedVolumeLevel?.index,channels:channels.filter(c=>c.visible).map(c=>c.index)};
  const statisticsKey=JSON.stringify(statisticsContext);
  const geometry=useMemo(()=>currentLoaded&&displayCapability?navigationGeometry(displayCapability,currentLoaded.image):undefined,[currentLoaded,displayCapability]);
  const volumeGeometry=useMemo(()=>currentLoaded&&displayCapability?navigationGeometry(displayCapability,currentLoaded.image,selectedVolumeLevel?.index||0):undefined,[currentLoaded,displayCapability,selectedVolumeLevel?.index]);
  const panelHeight=volumeView==="orthogonal"?viewerSize.height/2:viewerSize.height;
  const sharedViewport=navigation&&geometry?to2D(navigation,geometry):viewport;
  const sharedNgCamera=navigation?toNeuroglancer(navigation,ngCamera,panelHeight):ngCamera;
  const sharedVivCamera=navigation&&volumeGeometry?toViv(navigation,volumeGeometry,volumeCamera,volumeView,slicePlane,viewerSize.width,viewerSize.height):volumeCamera;
  const frameKey=JSON.stringify([field,zIndex,tIndex,projection,renderMode,volumeRenderer,volumeLevel,volumeView,slicePlane,viewMode]);
  const latestFrameKey=useRef(frameKey);latestFrameKey.current=frameKey;
  const frameReady=readyFrameKey===frameKey;
  const [exportingVolume,setExportingVolume]=useState(false);
  const liveMovieFrame=useRef({t:tIndex,ready:frameReady});liveMovieFrame.current={t:tIndex,ready:frameReady};
  const movieScreenScale=Math.min(1,2048/Math.max(1,viewerSize.width,viewerSize.height));
  const volumeMovieSize:[number,number]=[Math.max(1,Math.floor(viewerSize.width*movieScreenScale)),Math.max(1,Math.floor(viewerSize.height*movieScreenScale))];
  const volumeMovieExporter=effectiveRenderMode!=="3d"?undefined:async(recipe:MovieRecipe,signal:AbortSignal,progress:(done:number,total:number)=>void)=>{
    const host=viewerRef.current!,previous=tIndex;
    try{return await exportVolumeMovie(imageId!,recipe,currentLoaded!.sizeT,host,async(t,abort)=>{
      if(liveMovieFrame.current.t!==t){setReadyFrameKey("");setTIndex(t);}
      await waitForVolumeFrame(()=>liveMovieFrame.current.t===t&&liveMovieFrame.current.ready,abort);
    },signal,progress);}
    finally{if(viewerRef.current===host)setTIndex(previous);}
  };
  const setFrameReady=(value:boolean)=>setReadyFrameKey(value?frameKey:"");
  const readyFrame=()=>{if(latestFrameKey.current===frameKey)setFrameReady(true);};
  const acceptNavigation=(next:SharedNavigation)=>{
    if(!Number.isFinite(next.unitsPerPixel)||next.unitsPerPixel<=0||next.position.some(n=>!Number.isFinite(n)))return;
    setNavigation(old=>old&&Math.abs(old.unitsPerPixel-next.unitsPerPixel)<1e-8&&old.position.every((n,i)=>Math.abs(n-next.position[i])<1e-6)?old:next);
    if(geometry)setZIndex(navigationZ(next,geometry));
  };
  const captureNavigation=()=>{
    if(navigation||!geometry)return;
    if(effectiveRenderMode==="3d"&&useNeuroglancer&&ngCamera)acceptNavigation(fromNeuroglancer(ngCamera,geometry.unit,panelHeight,volumeView));
    else if(effectiveRenderMode==="3d"&&volumeCamera&&volumeGeometry)acceptNavigation(fromViv(volumeCamera,volumeGeometry));
    else if(sharedViewport)acceptNavigation(from2D(sharedViewport,zIndex,geometry));
  };
  const applyImageZoom=(native:boolean)=>{
    if(!geometry)return;
    const current=navigation||(effectiveRenderMode==="3d"&&useNeuroglancer&&ngCamera?fromNeuroglancer(ngCamera,geometry.unit,panelHeight,volumeView):
      effectiveRenderMode==="3d"&&volumeCamera&&volumeGeometry?fromViv(volumeCamera,volumeGeometry):
      sharedViewport?from2D(sharedViewport,zIndex,geometry):fitNavigation(geometry,viewerSize.width,viewerSize.height,volumeView));
    acceptNavigation(imageZoomNavigation(geometry,current,viewerSize.width,viewerSize.height,effectiveRenderMode==="2d"?"2d":volumeView,slicePlane,native));
    // The embedded viewer preserves its live camera during appearance updates.
    // Use its explicit camera command when a toolbar zoom is requested.
    if(effectiveRenderMode==="3d"&&useNeuroglancer)setVolumeReset(value=>value+1);
  };

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
        "This link targets a different image store",
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
      const defaultField = defaultPlateFieldIndex(value);
      setPlateFieldIndex(deepLink.plateField ?? defaultField);
      setField((current) => {
        const validFields = value.plate?.wells.flatMap((well) => well.fields.map((item) => item.path)) || [];
        if (current && validFields.includes(current)) return current;
        const initialWell = value.plate?.wells.find(well=>well.fields.some(item=>item.path===value.initial_path));
        return deepLink.view === "plate" ? initialWell?.fields[Math.min(deepLink.plateField ?? defaultField,initialWell.fields.length-1)]?.path || value.initial_path : value.initial_path;
      });
    }).catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to load OME-Zarr capabilities"));
  }, [imageId, refreshCapability]);

  useEffect(() => {
    if (!capability || !authStore || !field) return;
    let cancelled = false;
    const abort = new AbortController();
    setStatus("Opening multiscale image…");
    setError(null);
    const load = async () => {
      const fieldCapability = field === capability.initial_path ? capability : await fetchCapabilities(imageId!, field, abort.signal);
      const imageResult = await loadOmeZarrFromStore(new PrefixStore(authStore.store, field, abort.signal) as any);
      const imageLoader = withVolumeCache(attachNgffPhysicalSizes(imageResult.data, imageResult.metadata), authStore, field, reportLoadProgress);
      const labelResults = await Promise.allSettled(fieldCapability.labels.map(async (label) => {
        const path = label.path;
        const result = await loadOmeZarrFromStore(new PrefixStore(authStore.store, path, abort.signal) as any);
        return { id: label.id, loader: attachNgffPhysicalSizes(result.data, result.metadata) };
      }));
      if (cancelled) return;
      const next: LoadedData = {
        capability: fieldCapability,
        path: field,
        image: imageLoader,
        labels: [
          ...labelResults.filter((item): item is PromiseFulfilledResult<any> => item.status === "fulfilled").map((item) => item.value),
          ...[...new Set([
            ...(deepLink.labelChannel != null ? [deepLink.labelChannel] : []),
            ...(deepLink.overlays || []).flatMap((overlay) => overlay.labelChannel ? [overlay.labelChannel] : []),
          ])].filter((channel) => channel <= axisSize(imageLoader, "c")).map((channel) => ({
            id: `focused-channel-${channel}`,
            loader: imageLoader,
            channelIndex: channel - 1,
          })),
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
      const defaults = channelStates(fieldCapability, next.image);
      const analyses = await analyzeChannels(next.image, defaults, nextZ, nextT, {signal: abort.signal, volume: renderMode === "3d" || projection !== "slice"});
      if (cancelled) return;
      const automatic = applyChannelAnalysis(defaults, analyses);
      const scaled = automatic.map(channel => ({...channel, contrastSource: "auto" as const}));
      analyzedProjection.current = projection;
      setLoaded(next);
      const g=navigationGeometry(fieldCapability,next.image);
      const initialView=getDefaultInitialViewState(next.image,{width:viewerSize.width,height:viewerSize.height/(g.spacing[1]/g.spacing[0])},.35) as any;
      const requested=loaded ? undefined : deepLink.viewport;
      if(!loaded && deepLink.renderMode==="3d" && (deepLink.ngCamera || deepLink.volumeCamera)) setNavigation(undefined);
      else if(!requested && renderMode==="3d")setNavigation(fitNavigation(g,viewerSize.width,viewerSize.height,volumeView));
      else setNavigation(from2D(requested||{x:initialView.target?.[0]??g.shape[0]/2,y:initialView.target?.[1]??g.shape[1]/2,zoom:Number(initialView.zoom)||0},nextZ,g));
      setChannelAnalyses(analyses);
      setChannels((current) => {
        const restored = applyChannelDeepLink(scaled, current.length ? current : deepLink.channels);
        return !current.length && !deepLink.channels
          ? applySourceChannels(restored, deepLink.sourceChannels)
          : restored;
      });
      setLabels((current) => {
        const defaults = focusedLabelStates(fieldCapability, field, deepLink, next.sizeZ);
          const matching=defaults.flatMap(label=>{
            const previous=current.find(item=>item.name===label.name&&item.path.split("/labels/").at(-1)===label.path.split("/labels/").at(-1));
            return previous?[{...previous,id:label.id}]:[];
          });
          return applyLabelDeepLink(defaults, current.length ? matching : loaded ? undefined : deepLink.labels);
      });
      setZIndex(nextZ);
      setTIndex(nextT);
      setStatus(labelResults.some((item) => item.status === "rejected") ? "Image ready; one or more label layers are unavailable for this field." : "Ready");
    };
    load().catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "The OME-Zarr image could not be opened"); });
    return () => { cancelled = true; abort.abort(); };
  }, [capability, authStore, field]);

  useEffect(() => {
    if (!deepLink.roi || !field || !geometry || viewerSize.width <= 0 || viewerSize.height <= 0) return;
    const key = `${field}:${viewerSize.width}:${viewerSize.height}`;
    if (fittedRoi.current === key) return;
    fittedRoi.current = key;
    const next=fitRoiViewport(deepLink.roi, viewerSize.width, viewerSize.height);
    setViewport(next);if(geometry)acceptNavigation(from2D(next,zIndex,geometry));
  }, [deepLink.roi, field, viewerSize.width, viewerSize.height, geometry]);

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
    if (!selectedVolumeLevel) {
      setRenderMode("2d");
      setStatus("No multiscale level fits the 200 MiB 3D memory and GPU texture limits.");
      return;
    }
    if (volumeLevel !== selectedVolumeLevel.index) {
      setVolumeLevel(selectedVolumeLevel.index);
      if (volumeLevel != null) setStatus("The requested 3D quality was unsafe; using the coarsest safe level.");
    }
  }, [renderMode, currentLoaded, maxTextureSize, selectedVolumeLevel, volumeLevel]);

  useEffect(() => {
    const analysisKey = statisticsKey;
    if (!loaded || loaded.path !== field || !displayLoader || !channels.length || analyzedProjection.current === analysisKey) return;
    let cancelled = false;
    const abort = new AbortController();
    setChannelAnalyses([]);
    analyzeChannels(loaded.image, channels, zIndex, tIndex, {signal: abort.signal, volume: effectiveRenderMode === "3d" || projection !== "slice"}).then((analyses) => {
      if (cancelled) return;
      analyzedProjection.current = analysisKey;
      setChannelAnalyses(analyses);
    }).catch((reason) => {
      if (!cancelled) setStatus(`Projection warning: ${reason instanceof Error ? reason.message : "range calculation failed"}`);
    });
    return () => { cancelled = true; abort.abort(); };
  }, [loaded, statisticsKey]);

  useEffect(() => {
    if (!imageId || !loaded) return;
    const timeout = window.setTimeout(() => {
      const relative = writeDeepLink(imageId, {
        view: viewMode,
        plateField: plateFieldIndex,
        viewport:sharedViewport,
        z: zIndex,
        t: tIndex,
        projection,
        renderMode: effectiveRenderMode,
        volumeLevel: selectedVolumeLevel?.index,
        volumeRenderer,
        volumeBlend,
        volumeBrightness,
        volumeGain,
        volumeCamera:sharedVivCamera,
        ngCamera:sharedNgCamera, volumeView, slicePlane,
        field,
        roi: deepLink.roi,
        sourceChannels: deepLink.sourceChannels,
        labelPath: deepLink.labelPath,
        labelChannel: deepLink.labelChannel,
        labelValue: deepLink.labelValue,
        overlays: labelOverlays(labels, capability, field),
        storeUuid: deepLink.storeUuid,
        channels,
        labels,
      });
      window.history.replaceState(null, "", relative);
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [imageId, loaded, capability, viewMode, plateFieldIndex, navigation, viewport, zIndex, tIndex, projection, effectiveRenderMode, selectedVolumeLevel, volumeRenderer, volumeBlend, volumeBrightness, volumeGain, volumeCamera, ngCamera, volumeView, slicePlane, field, channels, labels]);

  if (error && !capability) return <main className="fatal"><h1>OME-Zarr Viewer</h1><p>{error}</p></main>;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div><strong>BIOMERO OME-Zarr Viewer</strong><span>{capability?.plate ? field : capability?.image.name || "Loading…"}</span></div>
        <div className="toolbar">
          <span className="status" aria-live="polite">{error || status}</span>
          {currentLoaded && (viewMode !== "field" || effectiveRenderMode === "2d") && <>
            {deepLink.roi && capability && <a className="toolbar-button" href={roiPngUrl(capability, {
                  ...deepLink, field, z: zIndex, t: tIndex, overlays:labelOverlays(labels,displayCapability,field),
                }, channels)} download>{projection==="slice"?"Download ROI PNG":"Download ROI slice PNG"}</a>}
          </>}
          {currentLoaded && currentLoaded.sizeT > 1 && imageId && capability && viewMode === "field" && <MovieExport
            key={`${effectiveRenderMode}:${volumeRenderer}:${volumeView}`} imageId={imageId} sizeT={currentLoaded.sizeT} exporter={volumeMovieExporter} onBusy={setExportingVolume} recipe={{ version: 2, storeUuid: capability.store.uuid || undefined, sourceBinding: capability.store.binding_digest, source: { kind: "current-image" },
              ...(effectiveRenderMode==="3d"?{viewCapture:{version:1,space:"screen",renderer:useNeuroglancer?"neuroglancer":"viv",mode:volumeView,quality:selectedVolumeLevel!.index,
                settings:{brightness:volumeBrightness,blend:volumeBlend,gain:volumeGain,navigation,camera:useNeuroglancer?sharedNgCamera:sharedVivCamera,scaleBar:showScale,
                  renderedChannels:(useNeuroglancer?channels.filter(c=>c.visible).slice(0,10):volumeChannels).map(c=>c.index),labelsRendered:useNeuroglancer}}}:{}),
              filename: capability.image.name, sequence: { version: 1, start: 0, end: Math.min(currentLoaded.sizeT, 600) - 1, fps: 5 },
              panels: [{ field, roi: effectiveRenderMode==="3d"?[0,0,...volumeMovieSize]:visibleMovieCrop(axisSize(currentLoaded.image, "x"), axisSize(currentLoaded.image, "y"), sharedViewport, viewerSize),
                sourceChannels: channels.filter(channel => channel.visible).map(channel => channel.index + 1),
                channelSettings: channels, t: tIndex, z: zIndex, projection, scaleBar: showScale,
                overlays: labels.filter(label => label.visible).map(label => ({
                  ...(label.id.startsWith("focused-channel-") ? { labelChannel: Number(label.id.split("-").at(-1)) } :
                    { labelPath: fieldLabelPath(label.path, capability!.initial_path, field!) }),
                  values: label.highlightValues || (label.highlightValue ? [label.highlightValue] : undefined),
                  mode: label.mode, colorMode:label.color?"solid":"instance", color: label.color, opacity: label.opacity, outlineWidth: label.outlineWidth || 2
                })) }]
            } as MovieRecipe} />}
          <div className="view-toolbar" role="group" aria-label="View controls" inert={exportingVolume}>
            {currentLoaded && viewMode === "field" && currentLoaded.sizeZ > 1 && <RenderModeToggle mode={effectiveRenderMode} disabled3d={!volumeAvailable}
              onChange={mode => {captureNavigation(); if (mode === "3d" && selectedVolumeLevel) setVolumeLevel(selectedVolumeLevel.index); setRenderMode(mode); }} />}
            {currentLoaded && viewMode === "field" && effectiveRenderMode === "3d" &&
              <button className="icon-button" aria-label="Reset 3D View" title="Reset 3D View" onClick={() => {
                if(geometry)acceptNavigation(fitNavigation(geometry,viewerSize.width,viewerSize.height,volumeView));setVolumeCamera(undefined); setNgCamera(undefined); setVolumeReset(value => value + 1);
              }}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/></svg></button>}
            {currentLoaded && <>
              {(effectiveRenderMode !== "3d" || viewMode !== "field") && <button className={`icon-button ${showMinimap ? "active" : ""}`} aria-label="Navigator"
                title="Navigator" aria-pressed={showMinimap}
                onClick={() => setShowMinimap(value => !value)}><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="m7 17 3-7 7-3-3 7Z"/><path d="m10 10 4 4"/></svg></button>}
              <button className={`icon-button ${showScale ? "active" : ""}`} aria-label="Scale bar" title="Scale bar" aria-pressed={showScale} onClick={() => setShowScale(value => !value)}><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="7" width="18" height="10" rx="2"/><path d="M7 7v5m5-5v3m5-3v5"/></svg></button>
            </>}
            {currentLoaded && viewMode === "field" && <ImageZoomButtons onFit={()=>applyImageZoom(false)} onNative={()=>applyImageZoom(true)} />}
            <FullscreenButton />
            <ViewerMetadata imageId={imageId} field={field || "."} />
            <ViewerHelp />
          </div>
        </div>
      </header>
      <div className="workspace">
        <main className="viewer-host" ref={viewerRef} inert={exportingVolume} aria-busy={exportingVolume}>
          {loadProgress.busy && (projection !== "slice" || effectiveRenderMode === "3d") && !(effectiveRenderMode === "3d" && useNeuroglancer) && <div className="volume-cache-progress" role="status" aria-live="polite"><span>{loadProgress.phase}… {Math.round(loadProgress.fraction*100)}%</span><progress aria-label="Volume loading progress" max="1" value={loadProgress.fraction}/></div>}
          {capability?.plate && authStore && viewMode !== "field" ? (
            <OverviewGrid
              capability={capability}
              store={authStore.store}
              mode={viewMode}
              showMinimap={showMinimap}
              showScale={showScale}
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
          ) : currentLoaded && authStore && useNeuroglancer && effectiveRenderMode === "3d" && selectedVolumeLevel ? (
            <NeuroglancerCanvas key={`neuroglancer:${currentLoaded.path}`} auth={authStore} field={currentLoaded.path} channels={channels}
              labels={labels.map(label => ({ ...label, path: label.id.startsWith("focused-channel-") ? currentLoaded.path : fieldLabelPath(label.path, capability!.initial_path, currentLoaded.path) }))}
              t={tIndex} resolution={selectedVolumeLevel.index} blendMode={volumeBlend} showScale={showScale}
              brightness={volumeBrightness}
              gain={volumeGain} height={viewerSize.height} unit={geometry?.unit} viewId={ngViewId}
              view={volumeView} plane={slicePlane} onPlane={setSlicePlane}
              resetKey={volumeReset} camera={sharedNgCamera} onCameraChange={camera=>{setNgCamera(camera);if(geometry)acceptNavigation(fromNeuroglancer(camera,geometry.unit,panelHeight,volumeView));}}
              onCancel={() => setRenderMode("2d")} onError={message => setStatus(`3D warning: ${message}`)}
              onReady={() => {readyFrame();setStatus(volumeView === "3d" ? "3D image and labels ready" : volumeView === "slice" ? "Slice ready" : "Orthogonal views ready");}} />
          ) : currentLoaded && displayLoader && viewerSize.width > 0 && viewerSize.height > 0 && effectiveRenderMode === "3d" && selectedVolumeLevel ? (
            <VolumeCanvas
              key={`${currentLoaded.path}:${tIndex}:${selectedVolumeLevel.index}:${volumeChannels.map((channel) => channel.index).join(",")}:${volumeReset}`}
              width={viewerSize.width}
              height={viewerSize.height}
              loader={currentLoaded.image}
              channels={channels}
              t={tIndex}
              resolution={selectedVolumeLevel.index}
              blendMode={volumeBlend}
              brightness={volumeBrightness}
              showScale={showScale}
              camera={sharedVivCamera} view={volumeView} plane={slicePlane} onPlane={setSlicePlane}
              onCameraChange={camera=>{setVolumeCamera(camera);if(volumeGeometry)acceptNavigation(fromViv(camera,volumeGeometry));}}
              onCancel={() => setRenderMode("2d")}
              onError={(message) => setStatus(`3D warning: ${message}`)}
              onReady={() => {readyFrame();setStatus(volumeChannelWarning || "3D volume ready");}}
            />
          ) : currentLoaded && displayLoader && viewerSize.width > 0 && viewerSize.height > 0 ? (
            <ViewerCanvas
              width={viewerSize.width}
              height={viewerSize.height}
              loader={displayLoader}
              labels={displayLabels}
              channels={channels}
              labelStates={labels}
              z={zIndex}
              t={tIndex}
              viewport={sharedViewport}
              projection={projection}
              showMinimap={showMinimap}
              showScale={showScale}
              physicalScale={physicalScale(displayCapability)}
              onViewportChange={next=>{setViewport(next);if(geometry)acceptNavigation(from2D(next,zIndex,geometry));}}
              onTileError={(message) => setStatus(`Tile warning: ${message}`)}
              onTilesLoaded={() => {readyFrame();setStatus((current) => current.startsWith("Image ready;") ? current : "Ready");}}
            />
          ) : <div className="loading">{error || status}</div>}
        </main>
        <div className="viewer-panel-export-wrapper" style={{display:"contents"}} inert={exportingVolume}><ViewerPanel
          capability={displayCapability}
          field={field}
          onField={(path) => {
            setField(path);
            setVolumeLevel(undefined);
            setVolumeCamera(undefined);
          }}
          channels={channels}
          channelAnalyses={currentLoaded && analyzedProjection.current===statisticsKey ? channelAnalyses : []}
          onChannels={setChannels}
          labels={labels}
          onLabels={setLabels}
          sizeZ={currentLoaded?.sizeZ || 1}
          sizeT={currentLoaded?.sizeT || 1}
          z={zIndex}
          t={tIndex}
          onZ={value=>{setZIndex(value);if(geometry&&sharedViewport)acceptNavigation(from2D(sharedViewport,value,geometry));}}
          onT={value=>{setFrameReady(false);setTIndex(value);}}
          frameReady={frameReady && !exportingVolume}
          projection={projection}
          onProjection={setProjection}
          renderMode={effectiveRenderMode}
          labels3dAvailable={useNeuroglancer} volumeView={volumeView} onVolumeView={value=>{captureNavigation();setVolumeView(value);}}
          volumeRenderer={useNeuroglancer ? "neuroglancer" : "classic"}
          onVolumeRenderer={value=>{captureNavigation();setVolumeRenderer(value);}} neuroglancerAvailable={ngAvailable}
          volumeLevels={availableVolumeLevels}
          volumeLevel={selectedVolumeLevel?.index}
          volumeBlend={volumeBlend}
          onVolumeBlend={setVolumeBlend}
          volumeBrightness={volumeBrightness} onVolumeBrightness={setVolumeBrightness}
          volumeGain={volumeGain} onVolumeGain={useNeuroglancer ? setVolumeGain : undefined}
          onVolumeLevel={setVolumeLevel}
          volumeChannelWarning={volumeChannelWarning}
          viewMode={viewMode}
          onViewMode={setViewMode}
          plateFieldIndex={plateFieldIndex}
          onPlateFieldIndex={setPlateFieldIndex}
        /></div>
      </div>
    </div>
  );
}

interface ViewerPanelProps {
  frameReady?:boolean;
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
  labels3dAvailable?: boolean;
  volumeView?: VolumeView;
  onVolumeView?: (view: VolumeView) => void;
  volumeRenderer?: VolumeRenderer;
  onVolumeRenderer?: (value: VolumeRenderer) => void;
  neuroglancerAvailable?: boolean;
  volumeLevels: VolumeLevel[];
  volumeLevel?: number;
  volumeBlend?: VolumeBlendMode;
  onVolumeBlend?: (value: VolumeBlendMode) => void;
  volumeBrightness?: number;
  onVolumeBrightness?: (value: number) => void;
  volumeGain?: number;
  onVolumeGain?: (value: number) => void;
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
  const labelsDisabled = props.viewMode !== "field" || (props.renderMode === "3d" && !props.labels3dAvailable);

  useEffect(() => {
    if (labelsDisabled && viewTab === "labels") setViewTab("channels");
  }, [labelsDisabled, viewTab]);

  return <aside className="control-panel">
    <div className="dataset-heading"><span aria-hidden="true">▰</span><strong>{datasetName}</strong></div>
    {capability?.plate && <div className="panel-tabs primary-tabs" role="tablist" aria-label="Plate controls">
      <button role="tab" aria-selected={plateTab === "navigation"} className={plateTab === "navigation" ? "active" : ""} onClick={() => setPlateTab("navigation")}>Navigation</button>
      <button role="tab" aria-selected={plateTab === "view"} className={plateTab === "view" ? "active" : ""} onClick={() => setPlateTab("view")}>View options</button>
    </div>}
    {showNavigation && capability ? <PlateNavigation capability={capability} field={props.field} onField={props.onField} mode={props.viewMode} onMode={props.onViewMode} plateFieldIndex={props.plateFieldIndex} onPlateFieldIndex={props.onPlateFieldIndex} /> : <>
      <div className="panel-scroll">
          {props.renderMode === "3d"
            ? <VolumeControls
                sizeT={props.sizeT}
                t={props.t}
                onT={props.onT}
                frameReady={props.frameReady}
                levels={props.volumeLevels}
                level={props.volumeLevel}
                onLevel={props.onVolumeLevel}
                channelWarning={props.volumeChannelWarning}
                appearance={<DisplayOptions volumeBlend={props.volumeBlend} onVolumeBlend={props.renderMode === "3d" ? props.onVolumeBlend : undefined}
          volumeBrightness={props.volumeBrightness} onVolumeBrightness={props.onVolumeBrightness}
          volumeGain={props.volumeGain} onVolumeGain={props.onVolumeGain} />}
                view={props.volumeView} onView={props.onVolumeView} blend={props.volumeBlend} onBlend={props.onVolumeBlend}
                renderer={props.volumeRenderer} onRenderer={props.onVolumeRenderer} neuroglancerAvailable={props.neuroglancerAvailable}
              />
            : <PlaneControls frameReady={props.frameReady} sizeZ={props.sizeZ} sizeT={props.sizeT} z={props.z} t={props.t} projection={props.projection} onZ={props.onZ} onT={props.onT} onProjection={props.onProjection} />}

      <div className="panel-tabs content-tabs" role="tablist" aria-label="Image layers">
        <div className="layer-tab" role="presentation">
          <LayerVisibilityCheckbox items={props.channels} name="channels" onChange={visible => props.onChannels(props.channels.map(item => ({ ...item, visible })))} />
          <button role="tab" aria-selected={viewTab === "channels"} className={viewTab === "channels" ? "active" : ""} onClick={() => setViewTab("channels")}>Channels ({props.channels.length})</button>
        </div>
        <div className="layer-tab" role="presentation">
          <LayerVisibilityCheckbox items={props.labels} name="labels" disabled={labelsDisabled} onChange={visible => props.onLabels(props.labels.map(item => ({ ...item, visible })))} />
          <button role="tab" aria-selected={viewTab === "labels"} className={viewTab === "labels" ? "active" : ""} disabled={labelsDisabled} title={props.viewMode !== "field" ? "Open a field to view labels" : labelsDisabled ? "Viv 3D displays intensity channels only" : undefined} onClick={() => setViewTab("labels")}>Labels ({props.labels.length})</button>
        </div>
      </div>
        {viewTab === "channels" ?
          <ChannelPanel channels={props.channels} analyses={props.channelAnalyses} onChange={props.onChannels} />
          : <LabelPanel labels={props.labels} onChange={props.onLabels} volume={props.renderMode === "3d"} volumeDescription={props.volumeView === "slice" ? "Slice labels" : props.volumeView === "orthogonal" ? "Slices and 3D surfaces" : undefined} />}

      </div>
    </>}
    {capability && <div className="source-strip">
      <span>NGFF {capability.ngff_version}</span>
      <span>Zarr v{capability.zarr_format}</span>
      <span>{capability.kind}</span>
      <a href="https://github.com/NL-BioImaging/BIOMERO.ZarrViewer" target="_blank" rel="noreferrer">Source · AGPL</a>
    </div>}
  </aside>;
}

function DisplayOptions({ volumeBlend = "additive", onVolumeBlend, volumeBrightness = 1, onVolumeBrightness, volumeGain = -3, onVolumeGain }: {
  volumeBlend?: VolumeBlendMode;
  onVolumeBlend?: (value: VolumeBlendMode) => void;
  volumeBrightness?: number;
  onVolumeBrightness?: (value: number) => void;
  volumeGain?: number;
  onVolumeGain?: (value: number) => void;
}) {
  if (!onVolumeBlend) return null;
  return <div className="volume-appearance-controls">
    <div className="appearance-line">
      <label>Brightness<input aria-label="3D intensity brightness" type="range" min="0.1" max="4" step="0.1" value={volumeBrightness} onChange={event=>onVolumeBrightness?.(Number(event.target.value))}/><output>{volumeBrightness.toFixed(1)}×</output></label>
    </div>
    {onVolumeGain && volumeBlend === "additive" && <label className="slider volume-gain">Volume gain<input aria-label="3D intensity volume gain" type="range" min="-5" max="3" step="0.1" value={volumeGain} onChange={event=>onVolumeGain(Number(event.target.value))}/><output>{Math.exp(volumeGain).toFixed(2)}×</output></label>}
  </div>;
}

function ChannelPanel({ channels, analyses, onChange }: {
  channels: ChannelState[]; analyses: ChannelAnalysis[]; onChange: (value: ChannelState[]) => void;
}) {
  const [histograms, setHistograms] = useState<Set<number>>(new Set());
  const analysisByIndex = new Map(analyses.map((analysis) => [analysis.index, analysis]));
  const update = (index: number, patch: Partial<ChannelState>) => onChange(channels.map((item) => item.index === index ? { ...item, ...((patch.low != null || patch.high != null) ? {contrastSource: "manual" as const} : {}), ...patch } : item));
  const apply = (channel: ChannelState, mode: "auto" | "fit") => {
    const analysis = analysisByIndex.get(channel.index);
    if (!analysis) return;
    update(channel.index, mode === "auto"
      ? { low: analysis.autoLow, high: analysis.autoHigh, contrastSource: "auto" }
      : { low: analysis.fitLow, high: analysis.fitHigh, contrastSource: "manual" });
  };
  const toggleHistogram = (index: number) => setHistograms((current) => {
    const next = new Set(current);
    next.has(index) ? next.delete(index) : next.add(index);
    return next;
  });

  return <section className="panel-section channel-panel">
    {channels.length === 0 && <p className="muted">Loading channels…</p>}
    {channels.map((channel) => {
      const analysis = analysisByIndex.get(channel.index);
      const showHistogram = histograms.has(channel.index);
      return <div className="layer-card" key={channel.index}>
        <div className="layer-heading"><input type="checkbox" aria-label={`${channel.label} visibility`} checked={channel.visible} onChange={(event) => update(channel.index, { visible: event.target.checked })}/><strong>{channel.label}</strong><ChannelColorPicker name={channel.label} color={channel.color} onChange={color => update(channel.index, { color })}/></div>

        {showHistogram && analysis && <Histogram values={analysis.histogram} color={channel.color} />}
        <DualRange channel={channel} analysis={analysis} onChange={(patch) => update(channel.index, patch)} actions={<div className="micro-actions"><button onClick={() => apply(channel, "auto")} disabled={!analysis || analysis.status==="error"}>AUTO</button><button onClick={() => apply(channel, "fit")} disabled={!analysis || analysis.status==="error"}>FIT</button><button className={showHistogram ? "active" : ""} aria-pressed={showHistogram} onClick={() => toggleHistogram(channel.index)} disabled={!analysis || analysis.status==="error"}>HIST</button></div>} />
        {analysis?.status==="error" && <small role="status">Channel statistics are unavailable. The current contrast is preserved.</small>}
      </div>;
    })}
  </section>;
}

function Histogram({ values, color }: { values: number[]; color: string }) {
  const maximum = Math.max(1, ...values);
  return <div className="histogram" aria-label="Sampled intensity histogram">{values.map((value, index) => <i key={index} style={{ height: `${Math.max(2, Math.log1p(value) / Math.log1p(maximum) * 100)}%`, backgroundColor: color }}/>)}</div>;
}

function DualRange({ channel, analysis, onChange, actions }: { channel: ChannelState; analysis?: ChannelAnalysis; onChange: (patch: Partial<ChannelState>) => void; actions?: ReactNode }) {
  const rangeMin = Math.min(analysis?.fitLow ?? channel.domainMin, channel.low);
  const rangeMax = Math.max(analysis?.fitHigh ?? channel.domainMax, channel.high);
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
    <div className="range-values"><input aria-label={`${channel.label} minimum value`} type="number" min={rangeMin} max={high} step={step} value={low} onChange={(event) => onChange({ low: Math.max(rangeMin, Math.min(Number(event.target.value), high)) })}/>{actions}<input aria-label={`${channel.label} maximum value`} type="number" min={low} max={rangeMax} step={step} value={high} onChange={(event) => onChange({ high: Math.min(rangeMax, Math.max(Number(event.target.value), low)) })}/></div>
  </div>;
}

function PlaneControls({ sizeZ, sizeT, z, t, projection, onZ, onT, onProjection, frameReady }: {
  frameReady?:boolean;
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
  return <section className="panel-section position-section" aria-label="Position controls">
    {sizeZ > 1 && <>
      <div className="projection-control"><div className="mode-toggle projection-toggle" role="group" aria-label="Z projection mode">
        {projections.map((item) => <button key={item.value} className={projection === item.value ? "active" : ""} aria-pressed={projection === item.value} onClick={() => onProjection(item.value)}>{item.label}</button>)}
      </div></div>
      {projection === "slice"
        ? <label className="slider">Z <input type="range" min="0" max={sizeZ - 1} value={z} onChange={(e) => onZ(Number(e.target.value))}/><output>{z + 1}/{sizeZ}</output></label>
        : <p className="projection-note">Using all {sizeZ} Z slices</p>}
    </>}
    {sizeT > 1 && <TimePlayback sizeT={sizeT} t={t} onT={onT} ready={frameReady} />}
    {sizeT > 1 && <label className="slider">T <input type="range" min="0" max={sizeT - 1} value={t} onChange={(e) => onT(Number(e.target.value))}/><output>{t + 1}/{sizeT}</output></label>}
  </section>;
}

export function VolumeControls({
  frameReady,
  sizeT,
  t,
  onT,
  levels,
  level,
  onLevel,
  channelWarning,
  renderer = "neuroglancer",
  onRenderer,
  neuroglancerAvailable = true,
  view = "3d", onView, blend = "additive", onBlend, appearance,
}: {
  frameReady?:boolean;
  sizeT: number;
  t: number;
  onT: (value: number) => void;
  levels: VolumeLevel[];
  level?: number;
  onLevel: (value: number) => void;
  channelWarning?: string;
  renderer?: VolumeRenderer;
  onRenderer?: (value: VolumeRenderer) => void;
  neuroglancerAvailable?: boolean;
  view?: VolumeView; onView?: (view: VolumeView) => void;
  blend?: VolumeBlendMode; onBlend?: (blend:VolumeBlendMode) => void;
  appearance?: ReactNode;
}) {
  return <section className="panel-section position-section volume-controls" aria-label="Volume options">
    {appearance}
    {onView && <div className="quality-control"><span>View</span><div className="mode-toggle volume-view-toggle" role="group" aria-label="Volume view">
      {([["3d","Volume"],["slice","Slice"],["orthogonal","Orthogonal"]] as const).map(([value,label]) =>
        <button key={value} className={view === value ? "active" : ""} aria-pressed={view === value} onClick={()=>onView(value)}>{label}</button>)}
    </div></div>}
    {onBlend && <div className="quality-control"><span>Display</span><div className="mode-toggle volume-view-toggle" role="group" aria-label="3D display mode">
      {([["additive","Additive","Additive blend"],["maximum","Maximum","Maximum intensity"],["minimum","Minimum","Minimum intensity"]] as const).map(([value,label,name])=>
        <button key={value} aria-label={name} title={name} className={blend===value?"active":""} aria-pressed={blend===value} onClick={()=>onBlend(value)}>{label}</button>)}
    </div></div>}
    {onRenderer && <div className="quality-control">
      <span>Viewer</span>
      <div className="mode-toggle" role="group" aria-label="3D viewer">
        <button className={renderer === "neuroglancer" ? "active" : ""} aria-pressed={renderer === "neuroglancer"} disabled={!neuroglancerAvailable}
          title="Neuroglancer: image and labels (default)" onClick={() => onRenderer("neuroglancer")}>Neuroglancer</button>
        <button className={renderer === "classic" ? "active" : ""} aria-pressed={renderer === "classic"}
          title="Viv: intensity channels" onClick={() => onRenderer("classic")}>Viv</button>
      </div>
    </div>}
    <label className="quality-control">
      <span>Quality</span>
      <select aria-label="3D volume quality" value={level ?? ""} onChange={(event) => onLevel(Number(event.target.value))}>
        {levels.map((item) => <option key={item.index} value={item.index}>
          Level {item.index} · {item.width}×{item.height}×{item.depth} · {formatBytes(item.rawBytes)}
        </option>)}
      </select>
    </label>

    {channelWarning && <p className="volume-warning" role="status">{channelWarning}</p>}
    {sizeT > 1 && <TimePlayback sizeT={sizeT} t={t} onT={onT} ready={frameReady} />}
    {sizeT > 1 && <label className="slider">Timepoint <input aria-label="Timepoint" type="range" min="0" max={sizeT - 1} value={t} onChange={(event) => onT(Number(event.target.value))}/><output>{t + 1}/{sizeT}</output></label>}
  </section>;
}

export function LabelPanel({ labels, onChange, volume = false, volumeDescription = "3D surfaces" }: { labels: LabelState[]; onChange: (value: LabelState[]) => void; volume?: boolean; volumeDescription?: string }) {
  const update = (id: string, patch: Partial<LabelState>) => onChange(labels.map((item) => item.id === id ? { ...item, ...patch } : item));
  const move = (index: number, delta: number) => { const copy = [...labels]; const target = index + delta; if (target < 0 || target >= copy.length) return; [copy[index], copy[target]] = [copy[target], copy[index]]; onChange(copy); };
  return <section className="panel-section label-panel">{labels.length === 0 && <div className="empty-state"><strong>No NGFF label images</strong><p>This field has no segmentation layers advertised in its label-group metadata.</p></div>}{labels.map((label, index) => <div className="layer-card" key={label.id}>
    <label className="layer-heading"><input type="checkbox" checked={label.visible} onChange={(e) => update(label.id, { visible: e.target.checked })}/><strong>{label.name}</strong><select className="label-color-select" aria-label={`${label.name} color mode`} value={label.color || ""} onChange={(e) => update(label.id, { color: e.target.value || undefined })}><option value="">Multicolor</option>{label.color && !labelPalette.some((color) => color.value === label.color?.toUpperCase()) && <option value={label.color}>Custom</option>}{labelPalette.map((color) => <option key={color.value} value={color.value}>{color.name}</option>)}</select></label>
    <label className="slider">Opacity<input type="range" min="0" max="1" step="0.05" value={label.opacity} onChange={(e) => update(label.id, { opacity: Number(e.target.value) })}/><output>{Math.round(label.opacity * 100)}%</output></label>
    {!volume && label.mode === "outline" && <label className="slider">Outline width<input aria-label={`${label.name} outline width`} type="range" min="1" max="20" step="1" value={label.outlineWidth || 2} onChange={(e) => update(label.id, { outlineWidth: Number(e.target.value) })}/><output>{label.outlineWidth || 2}px</output></label>}
    <div className="label-actions">
      {volume ? <span className="muted">{volumeDescription}</span> : <div className="mode-toggle" role="group" aria-label={`${label.name} display mode`}>
        <button className={label.mode === "fill" ? "active" : ""} aria-pressed={label.mode === "fill"} onClick={() => update(label.id, { mode: "fill" })}>Fill</button>
        <button className={label.mode === "outline" ? "active" : ""} aria-pressed={label.mode === "outline"} onClick={() => update(label.id, { mode: "outline" })}>Outline</button>
      </div>}
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
  const plate = plateGeometry(capability.plate!);
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

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { loadOmeZarrFromStore } from "@hms-dbmi/viv";
import * as zarr from "zarrita";
import { fetchCapabilities, selectedImageId, ViewerApiError } from "./api";
import { AuthenticatedZarrStore, PrefixStore } from "./authenticated-store";
import { analyzeChannels, applyChannelAnalysis, type ChannelAnalysis } from "./channel-scaling";
import type { Capability, ChannelState, LabelCapability, LabelState, SelectedObject, ViewportState } from "./types";
import { applyChannelDeepLink, applyLabelDeepLink, parseDeepLink, writeDeepLink } from "./viewer-state";
import { ViewerCanvas } from "./ViewerCanvas";
import { OverviewGrid } from "./OverviewGrid";

interface LoadedData {
  image: any[];
  labels: Array<{ id: string; loader: any[]; capability: LabelCapability; arrayPath: string }>;
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
    opacity: label.opacity ?? 0.15,
    mode: "fill",
    color: label.color,
  }));
}

function axisSize(loader: any[], axis: string): number {
  const source = loader[0];
  const index = source.labels.indexOf(axis);
  return index >= 0 ? source.shape[index] : 1;
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

async function scalarLabelValue(store: zarr.FetchStore, path: string, axes: string[], x: number, y: number, zIndex: number, tIndex: number): Promise<number> {
  const array = await zarr.open(zarr.root(store).resolve(path), { kind: "array" });
  const selection = array.shape.map((size, index) => {
    const axis = axes[index] || (index === array.shape.length - 2 ? "y" : index === array.shape.length - 1 ? "x" : "");
    const value = axis === "x" ? x : axis === "y" ? y : axis === "z" ? zIndex : axis === "t" ? tIndex : 0;
    return Math.max(0, Math.min(size - 1, Math.floor(value)));
  });
  const result = await zarr.get(array, selection as any);
  if (typeof result === "number" || typeof result === "bigint") return Number(result);
  const data = (result as any)?.data;
  return Number(ArrayBuffer.isView(data) ? (data as any)[0] : data ?? 0);
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
  const [viewport, setViewport] = useState<ViewportState | undefined>(deepLink.viewport);
  const [hovered, setHovered] = useState<SelectedObject | null>(null);
  const [selected, setSelected] = useState<SelectedObject | null>(null);
  const [viewMode, setViewMode] = useState<"field" | "well" | "plate">("field");
  const [plateFieldIndex, setPlateFieldIndex] = useState(0);
  const [showMinimap, setShowMinimap] = useState(true);
  const [showScale, setShowScale] = useState(true);
  const [viewerRef, viewerSize] = useElementSize<HTMLDivElement>();
  const hoverTimer = useRef<number | undefined>(undefined);

  const refreshCapability = useCallback(async () => {
    if (!imageId) throw new ViewerApiError("missing_image", "No OMERO image was selected", 400);
    const value = await fetchCapabilities(imageId);
    setCapability(value);
    return value;
  }, [imageId]);

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
      const labelResults = await Promise.allSettled(capability.labels.map(async (label) => {
        const path = fieldLabelPath(label.path, capability.initial_path, field);
        const result = await loadOmeZarrFromStore(new PrefixStore(authStore.store, path) as any);
        return { id: label.id, loader: result.data, capability: label, arrayPath: `${path}/${label.datasets[0].path}` };
      }));
      if (cancelled) return;
      const next: LoadedData = {
        image: imageResult.data,
        labels: labelResults.filter((item): item is PromiseFulfilledResult<any> => item.status === "fulfilled").map((item) => item.value),
        sizeC: axisSize(imageResult.data, "c"),
        sizeZ: axisSize(imageResult.data, "z"),
        sizeT: axisSize(imageResult.data, "t"),
      };
      setStatus("Calculating automatic channel ranges…");
      const defaults = channelStates(capability, next.image);
      const analyses = await analyzeChannels(next.image, defaults, zIndex, tIndex);
      const scaled = applyChannelAnalysis(defaults, analyses);
      setLoaded(next);
      setChannelAnalyses(analyses);
      setChannels((current) => applyChannelDeepLink(scaled, current.length ? current : deepLink.channels));
      setLabels((current) => applyLabelDeepLink(labelStates(capability), current.length ? current : deepLink.labels));
      setZIndex((value) => Math.min(value, next.sizeZ - 1));
      setTIndex((value) => Math.min(value, next.sizeT - 1));
      setStatus(labelResults.some((item) => item.status === "rejected") ? "Image ready; one or more label layers are unavailable for this field." : "Ready");
    };
    load().catch((reason) => setError(reason instanceof Error ? reason.message : "The OME-Zarr image could not be opened"));
    return () => { cancelled = true; };
  }, [capability, authStore, field]);

  useEffect(() => {
    if (!imageId || !loaded) return;
    const timeout = window.setTimeout(() => {
      const relative = writeDeepLink(imageId, { viewport, z: zIndex, t: tIndex, field, channels, labels });
      window.history.replaceState(null, "", relative);
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [imageId, loaded, viewport, zIndex, tIndex, field, channels, labels]);

  const inspectCoordinate = useCallback((x: number, y: number, clicked: boolean) => {
    if (!loaded || !authStore) return;
    const candidates = [...labels].reverse().filter((item) => item.visible && loaded.labels.some((loadedLabel) => loadedLabel.id === item.id));
    if (!candidates.length) {
      if (clicked) setSelected(null);
      setHovered(null);
      return;
    }
    const run = async () => {
      let object: SelectedObject | null = null;
      for (const active of candidates) {
        const source = loaded.labels.find((item) => item.id === active.id)!;
        const axes = source.loader[0]?.labels || source.capability.axes.map((axis) => axis.name);
        const value = await scalarLabelValue(authStore.store, source.arrayPath, axes, x, y, zIndex, tIndex);
        if (value > 0) {
          object = { layerId: active.id, layerName: active.name, labelId: value, x, y };
          break;
        }
      }
      setHovered(object);
      if (clicked) setSelected(object);
    };
    if (clicked) {
      window.clearTimeout(hoverTimer.current);
      void run();
    } else {
      window.clearTimeout(hoverTimer.current);
      hoverTimer.current = window.setTimeout(() => void run(), 120);
    }
  }, [loaded, authStore, labels, zIndex, tIndex]);

  if (error && !capability) return <main className="fatal"><h1>OME-Zarr Viewer</h1><p>{error}</p></main>;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div><strong>BIOMERO OME-Zarr Viewer</strong><span>{capability?.plate ? field : capability?.image.name || "Loading…"}</span></div>
        <div className="toolbar">
          <span className="status" aria-live="polite">{error || status}</span>
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
              onSelect={setField}
              onOpen={(path) => {
                setField(path);
                setViewMode(viewMode === "plate" ? "well" : "field");
              }}
            />
          ) : loaded && viewerSize.width > 0 && viewerSize.height > 0 ? (
            <ViewerCanvas
              width={viewerSize.width}
              height={viewerSize.height}
              loader={loaded.image}
              labels={loaded.labels}
              channels={channels}
              labelStates={labels}
              z={zIndex}
              t={tIndex}
              viewport={viewport}
              selectedLabel={selected?.labelId}
              showMinimap={showMinimap}
              showScale={showScale}
              physicalScale={physicalScale(capability)}
              onViewportChange={setViewport}
              onCoordinate={inspectCoordinate}
              onTileError={(message) => setStatus(`Tile warning: ${message}`)}
            />
          ) : <div className="loading">{error || status}</div>}
          {loaded && viewMode === "field" && <div className="viewer-options" aria-label="Viewer overlays">
            <button className={showScale ? "active" : ""} aria-pressed={showScale} onClick={() => setShowScale((value) => !value)}>Scale</button>
            <button className={showMinimap ? "active" : ""} aria-pressed={showMinimap} onClick={() => setShowMinimap((value) => !value)}>Minimap</button>
          </div>}
        </main>
        <ViewerPanel
          capability={capability}
          field={field}
          onField={setField}
          channels={channels}
          channelAnalyses={channelAnalyses}
          onChannels={setChannels}
          labels={labels}
          onLabels={setLabels}
          sizeZ={loaded?.sizeZ || 1}
          sizeT={loaded?.sizeT || 1}
          z={zIndex}
          t={tIndex}
          onZ={setZIndex}
          onT={setTIndex}
          selected={selected}
          hovered={hovered}
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
  selected: SelectedObject | null;
  hovered: SelectedObject | null;
  viewMode: "field" | "well" | "plate";
  onViewMode: (value: "field" | "well" | "plate") => void;
  plateFieldIndex: number;
  onPlateFieldIndex: (value: number) => void;
}

function ViewerPanel(props: ViewerPanelProps) {
  const [plateTab, setPlateTab] = useState<"navigation" | "view">("navigation");
  const [viewTab, setViewTab] = useState<"channels" | "labels">("channels");
  const { capability } = props;
  const showNavigation = Boolean(capability?.plate && plateTab === "navigation");
  const datasetName = capability?.plate?.name || capability?.image.name || "Loading dataset…";

  return <aside className="control-panel">
    <div className="dataset-heading"><span aria-hidden="true">▰</span><strong>{datasetName}</strong></div>
    {capability?.plate && <div className="panel-tabs primary-tabs" role="tablist" aria-label="Plate controls">
      <button role="tab" aria-selected={plateTab === "navigation"} className={plateTab === "navigation" ? "active" : ""} onClick={() => setPlateTab("navigation")}>Navigation</button>
      <button role="tab" aria-selected={plateTab === "view"} className={plateTab === "view" ? "active" : ""} onClick={() => setPlateTab("view")}>View options</button>
    </div>}
    {showNavigation && capability ? <PlateNavigation capability={capability} field={props.field} onField={props.onField} mode={props.viewMode} onMode={props.onViewMode} plateFieldIndex={props.plateFieldIndex} onPlateFieldIndex={props.onPlateFieldIndex} /> : <>
      <div className="panel-tabs content-tabs" role="tablist" aria-label="Image layers">
        <button role="tab" aria-selected={viewTab === "channels"} className={viewTab === "channels" ? "active" : ""} onClick={() => setViewTab("channels")}>Channels ({props.channels.length})</button>
        <button role="tab" aria-selected={viewTab === "labels"} className={viewTab === "labels" ? "active" : ""} onClick={() => setViewTab("labels")}>Labels ({props.labels.length})</button>
      </div>
      <div className="panel-scroll">
        {viewTab === "channels" ? <>
          <ChannelPanel channels={props.channels} analyses={props.channelAnalyses} onChange={props.onChannels} />
          <PlaneControls sizeZ={props.sizeZ} sizeT={props.sizeT} z={props.z} t={props.t} onZ={props.onZ} onT={props.onT} />
        </> : <>
          <LabelPanel labels={props.labels} onChange={props.onLabels} />
          <section className="panel-section object-section"><h2>Object information</h2><ObjectInfo title="Selected" value={props.selected} /><ObjectInfo title="Hover" value={props.hovered} /></section>
        </>}
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

function PlaneControls({ sizeZ, sizeT, z, t, onZ, onT }: { sizeZ: number; sizeT: number; z: number; t: number; onZ: (v: number) => void; onT: (v: number) => void }) {
  if (sizeZ === 1 && sizeT === 1) return null;
  return <section className="panel-section position-section"><h2>Position</h2>{sizeZ > 1 && <label className="slider">Z <input type="range" min="0" max={sizeZ - 1} value={z} onChange={(e) => onZ(Number(e.target.value))}/><output>{z + 1}/{sizeZ}</output></label>}{sizeT > 1 && <label className="slider">T <input type="range" min="0" max={sizeT - 1} value={t} onChange={(e) => onT(Number(e.target.value))}/><output>{t + 1}/{sizeT}</output></label>}</section>;
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

function ObjectInfo({ title, value }: { title: string; value: SelectedObject | null }) {
  return <div className="object-info"><h3>{title}</h3>{value ? <dl><dt>Layer</dt><dd>{value.layerName}</dd><dt>Label ID</dt><dd>{value.labelId}</dd><dt>Position</dt><dd>{value.x}, {value.y}</dd></dl> : <p className="muted">None</p>}</div>;
}

import { useEffect, useMemo, useRef, useState } from "react";
import type { AuthenticatedZarrStore } from "./authenticated-store";
import type { ChannelState, LabelState, VolumeBlendMode } from "./types";
import { neuroglancerState, type NeuroglancerCamera, type NeuroglancerPrepared } from "./neuroglancer-state";
import { SliceControls, volumeLayout, type VolumeView, type SlicePlane } from "./VolumeViewControls";
import { PanelScaleBars, type PanelScale } from "./ScaleBar";
import { viewerContextId } from "./viewer-context";

interface Props {
  auth: AuthenticatedZarrStore; field: string; channels: ChannelState[]; labels: LabelState[];
  t: number; resolution: number; blendMode: VolumeBlendMode; showScale: boolean; resetKey: number;
  brightness: number; gain: number; height: number;
  unit?: string;
  viewId?: string;
  view?: VolumeView; plane?: SlicePlane; onPlane?: (plane: SlicePlane) => void;
  camera?: NeuroglancerCamera; onCameraChange: (camera: NeuroglancerCamera) => void;
  onError: (message: string) => void; onReady: () => void; onCancel: () => void;
}

export function NeuroglancerCanvas(props: Props) {
  const view = props.view || "3d";
  const plane = props.plane || "xy";
  const [positionCommand, setPositionCommand] = useState<{ position: number[]; id: number }>();
  const iframe = useRef<HTMLIFrameElement>(null);
  const [contextViewId] = useState(()=>props.viewId || viewerContextId());
  const latest = useRef(props); latest.current = props;
  const [panelScales, setPanelScales] = useState<PanelScale[]>([]);
  const [prepared, setPrepared] = useState<NeuroglancerPrepared>();
  const meshesPending=useRef(false);meshesPending.current=Boolean(prepared?.pending);
  const [error, setError] = useState<string>();
  const [progress, setProgress] = useState("Opening 3D data…");
  const [initialized, setInitialized] = useState(0);
  const [retry, setRetry] = useState(0);
  const [depthStep, setDepthStep] = useState<number>();
  const depthTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [viewerHtml, setViewerHtml] = useState<string>();
  useEffect(() => {
    const abort = new AbortController();
    const url = new URL(window.BIOMERO_ZARR_VIEWER.neuroglancerUrl!, window.location.href);
    void fetch(url, { signal: abort.signal, credentials: "same-origin", cache: "no-store" }).then(async response => {
      if (!response.ok) throw new Error("The 3D renderer could not be loaded");
      const html = await response.text();
      if (!abort.signal.aborted) setViewerHtml(html.replace("<head>", `<head><base href="${new URL(".", url).href}">`));
    }).catch(reason => { if (!abort.signal.aborted) setError(String(reason)); });
    return () => abort.abort();
  }, []);
  useEffect(()=>{
    const forward=(event:KeyboardEvent)=>iframe.current?.contentWindow?.postMessage({type:"biomero-ng-modifiers",ctrlKey:event.ctrlKey,altKey:event.altKey,shiftKey:event.shiftKey,metaKey:event.metaKey},window.location.origin);
    window.addEventListener("keydown",forward,true);window.addEventListener("keyup",forward,true);
    return ()=>{window.removeEventListener("keydown",forward,true);window.removeEventListener("keyup",forward,true);};
  },[]);
  const channelsKey = JSON.stringify(props.channels.filter(c => c.visible).slice(0, 10).map(c => c.index));
  const labelsKey = JSON.stringify(props.labels.filter(l => l.visible).map(l => ({ path: l.path, channel: l.id.startsWith("focused-channel-") ? Number(l.id.split("-").at(-1)) - 1 : 0,
    ...(l.highlightValues?.length || l.highlightValue ? { segments: (l.highlightValues?.length ? l.highlightValues : [l.highlightValue!]).map(String), interactive: true } : {}) })));
  useEffect(() => {
    let cancelled = false;
    const abort = new AbortController();
    let preparedOnce = false;
    let timer: ReturnType<typeof setTimeout>;
    setError(undefined);
    setPrepared(undefined);
    setProgress("Opening 3D data…");
    if (channelsKey === "[]" && labelsKey === "[]") {
      setPrepared(undefined);
      setProgress("");
      return;
    }
    const query = new URLSearchParams({ field: props.field, level: String(props.resolution), t: String(props.t), channels: channelsKey, labels: labelsKey, view_id: contextViewId });
    if(retry) query.set("retryFailed","1");
    const prepare = async () => {
      try {
        const response = await props.auth.fetch(`${props.auth.neuroglancerUrl}?${query}`, { signal: abort.signal });
        const result = await response.json();
        query.delete("retryFailed");
        if (!response.ok) throw new Error(result.error?.message || `3D preparation failed (${response.status})`);
        if (cancelled) return;
        if (result.status === "ready") {
          setPrepared(previous => JSON.stringify(previous) === JSON.stringify(result) ? previous : result);
          if (!preparedOnce) setProgress("Loading image and segmentation surfaces…");
          preparedOnce = true;
          // Renew the server-side context through the existing authorized client.
          timer = setTimeout(prepare, result.pending ? 500 : 60_000);
        } else {
          setProgress(`Preparing image and labels… ${Math.round((result.progress || 0) * 100)}%`);
          timer = setTimeout(prepare, 500);
        }
      } catch (reason) {
        if (!cancelled) { setError(String(reason)); latest.current.onError(String(reason)); }
      }
    };
    void prepare();
    return () => { cancelled = true; clearTimeout(timer); abort.abort(); };
  }, [props.auth, props.field, props.resolution, props.t, channelsKey, labelsKey, retry]);
  const displayKey = JSON.stringify([props.channels, props.labels, props.blendMode, props.brightness, props.gain]);
  const state = useMemo(() => prepared ? {
    ...neuroglancerState(prepared, props.channels, props.labels, props.blendMode, false, props.brightness, props.gain),
    layout: volumeLayout(view, plane), showSlices: view === "orthogonal", showAxisLines: view === "orthogonal",
  } : undefined, [prepared, displayKey, view, plane, props.showScale]);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== iframe.current?.contentWindow || event.origin !== window.location.origin) return;
      if (event.data?.type === "biomero-ng-initialized") setInitialized(value => value + 1);
      if (event.data?.type === "biomero-ng-ready" && !meshesPending.current) { setProgress(""); latest.current.onReady(); }
      if (event.data?.type === "biomero-ng-loading") setProgress("Loading image and segmentation surfaces…");
      if (event.data?.type === "biomero-ng-panels") setPanelScales(event.data.panels.map((panel: PanelScale) => ({...panel,unitsPerPixel:panel.unitsPerPixel / (latest.current.unit === "pixel" ? 1 : 1000)})));
      if (event.data?.type === "biomero-ng-camera") latest.current.onCameraChange(event.data.camera);
      if (event.data?.type === "biomero-ng-depth") {
        setDepthStep(event.data.nanometers / (latest.current.unit === "pixel" ? 1 : 1000));
        clearTimeout(depthTimer.current);
        depthTimer.current = setTimeout(() => setDepthStep(undefined), 2000);
      }
      if (event.data?.type === "biomero-ng-error") { setError(event.data.message); latest.current.onError(event.data.message); }
    };
    window.addEventListener("message", receive);
    return () => { window.removeEventListener("message", receive); clearTimeout(depthTimer.current); };
  }, []);
  useEffect(() => {
    if (initialized && state) iframe.current?.contentWindow?.postMessage({ type: "biomero-ng-state", state,
      sceneKey: props.field, resetKey: props.resetKey, camera: latest.current.camera,
      positionCommand,
      physicalExtentNm: prepared && (() => { const source = Object.values(prepared.sources)[0]; return source.shape.slice().reverse().map((n, i) => n * source.resolution[i]); })(),
      voxelSizeNm: prepared && Object.values(prepared.sources)[0]?.resolution,
      voxelDepthNm: prepared && Object.values(prepared.sources)[0]?.resolution[2] }, window.location.origin);
  }, [initialized, state, props.resetKey, props.field, positionCommand]);
  const source = prepared && Object.values(prepared.sources)[0];
  return <div className="volume-stage">
    {source && <SliceControls view={view} plane={plane} onPlane={value => props.onPlane?.(value)} source={source}
      camera={props.camera} onPosition={position => {
        setPositionCommand(previous => ({ position, id: (previous?.id || 0) + 1 }));
        props.onCameraChange({ position, orientation: props.camera?.orientation || [0, 0, 0, 1],
          scale: props.camera?.scale || state!.projectionScale, crossSectionScale: props.camera?.crossSectionScale || state!.crossSectionScale });
      }} />}

    {depthStep != null && <div className="volume-depth-feedback" role="status">Depth step: {depthStep > 0 ? "+" : ""}{Number(depthStep.toPrecision(3))} {props.unit === "pixel" ? "px" : "µm"}</div>}
    {channelsKey === "[]" && labelsKey === "[]" && <div className="volume-empty" role="status">All channels and labels are hidden.</div>}
    {prepared && Object.values(prepared.sources).some(source => Object.keys(source.mesh_errors || {}).length) &&
      <div className="volume-depth-feedback" role="status">Some label surfaces could not be prepared. Try a lower quality or <button onClick={()=>setRetry(n=>n+1)}>Retry failed surfaces</button>.</div>}
    {prepared && viewerHtml && <iframe key={`${prepared.url}:${retry}`} ref={iframe} title="Volume image and segmentation" className="neuroglancer-frame" srcDoc={viewerHtml} />}
    {view === "orthogonal" && <div className="orthogonal-panel-labels" aria-label="Orthogonal panels">
      <span>XY</span><span>XZ</span><span>3D</span><span>YZ</span>
    </div>}
    {progress && !error && <div className="volume-cache-progress" role="status">{progress}</div>}
    {props.showScale && !error && <PanelScaleBars panels={panelScales} unit={props.unit || "micrometer"} />}
    {error && <div className="volume-error" role="alert"><strong>Unable to load 3D labels</strong><p>{error}</p>
      <button onClick={() => { setError(undefined); setRetry(value => value + 1); }}>Retry</button>
      <button onClick={props.onCancel}>Return to 2D</button></div>}
  </div>;
}

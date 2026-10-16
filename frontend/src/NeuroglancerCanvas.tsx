import { useEffect, useMemo, useRef, useState } from "react";
import type { AuthenticatedZarrStore } from "./authenticated-store";
import type { ChannelState, LabelState, VolumeBlendMode } from "./types";
import { neuroglancerState, type NeuroglancerCamera, type NeuroglancerPrepared } from "./neuroglancer-state";
import { scaleBarSize } from "./physical-scale";

interface Props {
  auth: AuthenticatedZarrStore; field: string; channels: ChannelState[]; labels: LabelState[];
  t: number; resolution: number; blendMode: VolumeBlendMode; showScale: boolean; resetKey: number;
  brightness: number; background: string; gain: number; height: number;
  camera?: NeuroglancerCamera; onCameraChange: (camera: NeuroglancerCamera) => void;
  onError: (message: string) => void; onReady: () => void; onCancel: () => void;
}

export function NeuroglancerCanvas(props: Props) {
  const iframe = useRef<HTMLIFrameElement>(null);
  const latest = useRef(props); latest.current = props;
  const [prepared, setPrepared] = useState<NeuroglancerPrepared>();
  const [error, setError] = useState<string>();
  const [progress, setProgress] = useState("Preparing image and label volumes…");
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
  const channelsKey = JSON.stringify(props.channels.filter(c => c.visible).slice(0, 10).map(c => c.index));
  const labelsKey = JSON.stringify(props.labels.filter(l => l.visible).map(l => ({ path: l.path, channel: l.id.startsWith("focused-channel-") ? Number(l.id.split("-").at(-1)) - 1 : 0 })));
  useEffect(() => {
    let cancelled = false;
    const abort = new AbortController();
    let preparedOnce = false;
    let timer: ReturnType<typeof setTimeout>;
    setError(undefined);
    setPrepared(undefined);
    setProgress("Preparing image and label volumes…");
    if (channelsKey === "[]" && labelsKey === "[]") {
      setPrepared(undefined);
      setProgress("");
      return;
    }
    const query = new URLSearchParams({ field: props.field, level: String(props.resolution), t: String(props.t), channels: channelsKey, labels: labelsKey });
    const prepare = async () => {
      try {
        const response = await props.auth.fetch(`${props.auth.neuroglancerUrl}?${query}`, { signal: abort.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error?.message || `3D preparation failed (${response.status})`);
        if (cancelled) return;
        if (result.status === "ready") {
          setPrepared(previous => JSON.stringify(previous) === JSON.stringify(result) ? previous : result);
          if (!preparedOnce) setProgress("Loading image and segmentation surfaces…");
          preparedOnce = true;
          // Renew the server-side context through the existing authorized client.
          timer = setTimeout(prepare, 60_000);
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
  const displayKey = JSON.stringify([props.channels, props.labels, props.blendMode, props.brightness, props.background, props.gain]);
  const state = useMemo(() => prepared ? neuroglancerState(prepared, props.channels, props.labels, props.blendMode, false, props.brightness, props.background, props.gain) : undefined,
    [prepared, displayKey]);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== iframe.current?.contentWindow || event.origin !== window.location.origin) return;
      if (event.data?.type === "biomero-ng-initialized") setInitialized(value => value + 1);
      if (event.data?.type === "biomero-ng-ready") { setProgress(""); latest.current.onReady(); }
      if (event.data?.type === "biomero-ng-loading") setProgress("Loading image and segmentation surfaces…");
      if (event.data?.type === "biomero-ng-camera") latest.current.onCameraChange(event.data.camera);
      if (event.data?.type === "biomero-ng-depth") {
        setDepthStep(event.data.nanometers / 1000);
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
      voxelDepthNm: prepared && Object.values(prepared.sources)[0]?.resolution[2] }, window.location.origin);
  }, [initialized, state, props.resetKey, props.field]);
  const scale = props.camera?.scale || state?.projectionScale;
  const scaleBar = scale ? scaleBarSize(scale / Math.max(1, props.height) / 1000, 0) : undefined;
  return <div className="volume-stage">
    {depthStep != null && <div className="volume-depth-feedback" role="status">Depth step: {depthStep > 0 ? "+" : ""}{Number(depthStep.toPrecision(3))} µm</div>}
    {channelsKey === "[]" && labelsKey === "[]" && <div className="volume-empty" role="status">All channels and labels are hidden.</div>}
    {prepared && viewerHtml && <iframe key={`${prepared.url}:${retry}`} ref={iframe} title="3D image and segmentation" className="neuroglancer-frame" srcDoc={viewerHtml} />}
    {progress && !error && <div className="volume-cache-progress" role="status">{progress}</div>}
    {props.showScale && scaleBar && !progress && !error && <div className="physical-scale" aria-label={`Scale ${scaleBar.value} micrometer at volume center`}>
      <span style={{ width: `${scaleBar.pixels}px` }} /><strong>{scaleBar.value} µm</strong><small>at volume center</small>
    </div>}
    {error && <div className="volume-error" role="alert"><strong>Unable to load 3D labels</strong><p>{error}</p>
      <button onClick={() => { setError(undefined); setRetry(value => value + 1); }}>Retry</button>
      <button onClick={props.onCancel}>Return to 2D</button></div>}
  </div>;
}

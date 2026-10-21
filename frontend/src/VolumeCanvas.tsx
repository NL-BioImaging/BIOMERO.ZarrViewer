import { useImageCursor } from "./use-image-cursor";
import { IMAGE_BACKGROUND } from "./viewer-appearance";
import { Component, useCallback, useEffect, useMemo, useRef, useState, type ErrorInfo, type ReactNode } from "react";
import {
  ColorPalette3DExtensions,
  getDefaultInitialViewState,
  VivViewer,
} from "@hms-dbmi/viv";
import type { ChannelState, VolumeBlendMode, VolumeCameraState } from "./types";
import { activeVolumeChannels, volumeModelMatrix, volumePhysicalScale, volumeSelection } from "./volume-utils";
import type { VolumeView as ViewMode, SlicePlane } from "./VolumeViewControls";
import { VivSectionsCanvas } from "./VivSectionsCanvas";
import { ScaleBar } from "./ScaleBar";
import { GentleVolumeView } from "./viv-navigation";
import { Plane } from '@math.gl/culling';
import { getPhysicalSizeScalingMatrix } from '@vivjs/layers';
import { clippingActive, type ClippingBounds } from './clipping';

const VolumeVivViewer = VivViewer as any;

export interface VolumeCanvasProps {
  cacheProgress?:import('./volume-loader').LoadProgress;
  width: number;
  height: number;
  loader: any[];
  channels: ChannelState[];
  t: number;
  resolution: number;
  blendMode?: VolumeBlendMode;
  showScale?: boolean;
  brightness?: number;
  clipping?:ClippingBounds;
  view?: ViewMode; plane?: SlicePlane; onPlane?: (plane: SlicePlane) => void;
  camera?: VolumeCameraState;
  orthographic?: boolean;
  onCameraChange: (camera: VolumeCameraState) => void;
  onCancel: () => void;
  onError: (message: string) => void;
  onReady: () => void;
}

interface BoundaryProps {
  children: ReactNode;
  onError: (message: string) => void;
  onCancel: () => void;
}

interface BoundaryState {
  message?: string;
}

class VolumeErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = {};

  static getDerivedStateFromError(error: unknown): BoundaryState {
    return { message: error instanceof Error ? error.message : "The 3D renderer could not start" };
  }

  componentDidCatch(error: unknown, _info: ErrorInfo) {
    this.props.onError(error instanceof Error ? error.message : "The 3D renderer could not start");
  }

  render() {
    if (this.state.message) {
      return <div className="volume-error" role="alert">
        <strong>3D rendering unavailable</strong>
        <p>{this.state.message}</p>
        <button onClick={this.props.onCancel}>Return to 2D</button>
      </div>;
    }
    return this.props.children;
  }
}

function hexToRgb(value: string): [number, number, number] {
  const hex = value.replace("#", "");
  return [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16)) as [number, number, number];
}

export function withVolumeErrorReporting(loader: any[], onError: (message: string) => void): any[] {
  return loader.map((source) => new Proxy(source, {
    get(target, property, receiver) {
      if (property === "getRaster" && typeof target.getRaster === "function") {
        return async (...args: any[]) => {
          try {
            return await target.getRaster(...args);
          } catch (reason) {
            const message = reason instanceof Error ? reason.message : "A volume chunk failed to load";
            onError(message);
            throw reason;
          }
        };
      }
      const value = Reflect.get(target, property, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }));
}

function finite(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function VolumeRenderer({
  width,
  height,
  loader,
  channels,
  t,
  resolution,
  blendMode = "additive",
  showScale = true,
  brightness = 1,
  clipping,
  cacheProgress,
  camera,
  orthographic = false,
  onCameraChange,
  onCancel,
  onError,
  onReady,
}: VolumeCanvasProps) {
  const cursorHost=useImageCursor("viv-volume");
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string>();
  const [preparedKey, setPreparedKey] = useState("");
  const selectedChannels = useMemo(() => activeVolumeChannels(channels), [channels]);
  const extensions = useMemo(() => {
    const Extension = blendMode === "maximum"
      ? ColorPalette3DExtensions.MaximumIntensityProjectionExtension
      : blendMode === "minimum"
        ? ColorPalette3DExtensions.MinimumIntensityProjectionExtension
        : ColorPalette3DExtensions.AdditiveBlendExtension;
    return [new Extension({})];
  }, [blendMode]);
  const onErrorRef = useRef(onError);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);
  const reportError = useCallback((message: string) => {
    setLoadError(message);
    setReady(false);
    onErrorRef.current(message);
  }, []);
  // Each NGFF level already declares its Z downsampling. Passing one selected
  // level at resolution zero avoids Viv downsampling its depth a second time.
  const guardedLoader = useMemo(() => withVolumeErrorReporting([loader[resolution]], reportError), [loader, resolution, reportError]);
  const modelMatrix = useMemo(() => volumeModelMatrix(loader, resolution), [loader, resolution]);
  const sourceLabels = guardedLoader[0]?.labels || [];
  const selectionAxes = Array.isArray(sourceLabels) ? sourceLabels.join(",") : "";
  const selectedChannelKey = selectedChannels.map((channel) => channel.index).join(",");
  const prepareKey = `${resolution}:${t}:${selectedChannelKey}`;
  useEffect(() => {
    let cancelled = false;
    const abort = new AbortController();
    setPreparedKey("");
    const source = loader[resolution];
    if (!source?.getVolume) { setPreparedKey(prepareKey); return; }
    Promise.all(selectedChannels.map(channel => source.getVolume(volumeSelection(source.labels, channel.index, t),{signal:abort.signal})))
      .then(() => { if (!cancelled) setPreparedKey(prepareKey); })
      .catch((error) => { if (!cancelled) reportError(String(error)); });
    return () => { cancelled = true; abort.abort(); };
  }, [loader, resolution, t, selectedChannelKey, prepareKey, reportError]);
  const selections = useMemo(
    () => selectedChannels.map((channel) => volumeSelection(sourceLabels, channel.index, t)),
    [selectedChannelKey, selectionAxes, t],
  );
  const defaultView = useMemo(
    // Viv 0.22 implements a Matrix4 fifth argument but declares it as boolean.
    () => (getDefaultInitialViewState as any)(guardedLoader, { width, height }, 1, true, modelMatrix),
    [guardedLoader, width, height, modelMatrix],
  );
  const source=loader[resolution],sizes=["x","y","z"].map(axis=>source.meta?.physicalSizes?.[axis]?.size||1),smallest=Math.min(...sizes);
  const extent=["x","y","z"].map((axis,i)=>(source.shape[source.labels.indexOf(axis)]||1)*modelMatrix.getScale()[i]*sizes[i]/smallest);
  const translation=modelMatrix.getTranslation().map((n,i)=>n*sizes[i]/smallest);
  const target=(camera?.sliceTarget||camera?.slicePosition)?.map((n,i)=>translation[i]+n*extent[i]);
  const viewState = {
    ...defaultView,
    id: "3d",
    rotationOrbit: camera?.orbit ?? 0,
    rotationX: camera?.tilt ?? 0,
    zoom: camera?.zoom ?? finite(defaultView.zoom, 0),
    ...(target?{target}:{}),
  };
  const physicalScale = volumePhysicalScale(loader);
  // OrbitView maps 2^zoom pixels per world unit at the camera target. Because
  // it uses perspective, this bar describes the plane through the volume center.
  const view = useMemo(() => {
    const view = new GentleVolumeView({ id: "3d", width, height, target: defaultView.target, useFixedAxis: false });
    view.orthographic = orthographic;
    return view;
  }, [width, height, defaultView.target, orthographic]);
  const clippingPlanes=useMemo(()=>{
    if(!clippingActive(clipping))return [];
    const raw=loader[resolution];
    const physical=getPhysicalSizeScalingMatrix(raw).transformPoint(['x','y','z'].map(a=>raw.shape[raw.labels.indexOf(a)]));
    return clipping!.flatMap(([low,high],axis)=>[
      new Plane([0,1,2].map(i=>i===axis?1:0),-low*physical[axis]),
      new Plane([0,1,2].map(i=>i===axis?-1:0),high*physical[axis]),
    ]);
  },[loader,resolution,clipping]);

  useEffect(() => {
    setProgress(0);
    setReady(false);
    setLoadError(undefined);
  }, [guardedLoader, resolution, t, selectedChannelKey]);

  if (!selectedChannels.length) {
    return <div className="volume-error" role="status">
      <strong>No visible image channels</strong>
      <p>Enable at least one channel to render this stack in 3D.</p>
      <button onClick={onCancel}>Return to 2D</button>
    </div>;
  }

  const layerProps = [{
    clippingPlanes,
    loader: guardedLoader,
    modelMatrix,
    selections,
    channelsVisible: selectedChannels.map(() => true),
    colors: selectedChannels.map((channel) => hexToRgb(channel.color)),
    contrastLimits: selectedChannels.map((channel) => [channel.low, channel.low + (channel.high - channel.low) / brightness]),
    resolution: 0,
    extensions,
    useProgressIndicator: false,
    onUpdate: ({ progress: value }: { progress: number }) => setProgress(Math.max(0, Math.min(1, finite(value, 0)))),
      onViewportLoad: () => {
        // Match Viv's wrapper: avoid updating React state from inside Deck's
        // layer lifecycle callback.
        window.setTimeout(() => {
          setProgress(1);
          setReady(true);
          onReady();
        }, 0);
      },
  }];

  return <div className="volume-stage image-cursor-surface" ref={cursorHost} style={{ backgroundColor: IMAGE_BACKGROUND }}>
    {!loadError && showScale && physicalScale && <ScaleBar unitsPerPixel={physicalScale.size / 2 ** viewState.zoom} unit={physicalScale.unit} perspective={!orthographic} />}
    {preparedKey === prepareKey && <VolumeVivViewer
      views={[view]}
      viewStates={[viewState]}
      layerProps={layerProps}
      useDevicePixels={false}
      deckProps={{ style: { backgroundColor: IMAGE_BACKGROUND }, deviceProps:{webgl:{preserveDrawingBuffer:true}} }}
      onViewStateChange={({ viewId, viewState: next }: any) => {
        if (viewId !== "3d") return;
        onCameraChange({ ...camera,
          ...(Array.isArray(next.target)?{sliceTarget:next.target.map((n:number,i:number)=>(n-translation[i])/extent[i]),slicePosition:next.target.map((n:number,i:number)=>(n-translation[i])/extent[i])}:{}),
          orbit: finite(next.rotationOrbit, viewState.rotationOrbit),
          tilt: finite(next.rotationX, viewState.rotationX),
          zoom: finite(next.zoom, viewState.zoom),
        });
      }}
    />}
    {!ready && !loadError && <div className="volume-loading" role="status" aria-live="polite">
      <strong>Loading 3D volume…</strong>
      {preparedKey === prepareKey ? <><progress max="1" value={progress} /><span>{progress>=1?'Uploading GPU textures…':`${Math.round(progress * 100)}%`}</span></> : cacheProgress?.busy ? <><span>{cacheProgress.phase}</span><progress max="1" value={cacheProgress.fraction}/><span>{Math.round(cacheProgress.fraction*100)}%</span></> : <span>Preparing cached volume data...</span>}
      <button onClick={onCancel}>Cancel and return to 2D</button>
    </div>}
    {loadError && <div className="volume-error" role="alert">
      <strong>Unable to load this volume</strong>
      <p>{loadError}</p>
      <button onClick={onCancel}>Return to 2D</button>
    </div>}
  </div>;
}

export function VolumeCanvas(props: VolumeCanvasProps) {
  const [failure,setFailure]=useState<string>();
  const [retry,setRetry]=useState<{loader:any[];t:number;resolution:number;count:number}>();
  const report=useCallback((message:string)=>{setFailure(message);props.onError(message);},[props.onError]);
  const shouldRetry=retry?.loader===props.loader&&retry.t===props.t&&retry.resolution===props.resolution;
  const loader=useMemo(()=>!shouldRetry?props.loader:props.loader.map(source=>new Proxy(source,{get(target,key,receiver){
    if(key==="getVolume"&&target.getVolume)return (selection:any,options:any)=>target.getVolume(selection,{...options,retryFailed:true});
    const value=Reflect.get(target,key,receiver);return typeof value==="function"?value.bind(target):value;
  }})),[props.loader,shouldRetry,retry]);
  const active={...props,loader,onError:report};
  useEffect(()=>setFailure(undefined),[props.loader,props.t,props.resolution]);
  return <VolumeErrorBoundary key={retry?.count||0} onError={report} onCancel={props.onCancel}>
    {props.view && props.view !== "3d" ? <VivSectionsCanvas props={active} renderVolume={(width,height,camera,onCameraChange,onReady) => <VolumeRenderer {...active}
      width={width} height={height} view="3d" orthographic camera={camera} onCameraChange={onCameraChange} onReady={onReady}/>} /> : <VolumeRenderer {...active} />}
    {failure&&<button className="volume-depth-feedback" onClick={()=>{setFailure(undefined);setRetry({loader:props.loader,t:props.t,resolution:props.resolution,count:(retry?.count||0)+1});}}>Retry failed volume</button>}
  </VolumeErrorBoundary>;
}

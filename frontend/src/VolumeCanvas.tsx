import { Component, useCallback, useEffect, useMemo, useRef, useState, type ErrorInfo, type ReactNode } from "react";
import {
  ColorPalette3DExtensions,
  getDefaultInitialViewState,
  VivViewer,
  VolumeView,
} from "@hms-dbmi/viv";
import type { ChannelState, VolumeBlendMode, VolumeCameraState } from "./types";
import { activeVolumeChannels, volumeModelMatrix, volumePhysicalScale, volumeSelection } from "./volume-utils";
import type { VolumeView as ViewMode, SlicePlane } from "./VolumeViewControls";
import { VivSectionsCanvas } from "./VivSectionsCanvas";
import { ScaleBar } from "./ScaleBar";

const VolumeVivViewer = VivViewer as any;

export interface VolumeCanvasProps {
  width: number;
  height: number;
  loader: any[];
  channels: ChannelState[];
  t: number;
  resolution: number;
  blendMode?: VolumeBlendMode;
  showScale?: boolean;
  brightness?: number;
  background?: string;
  view?: ViewMode; plane?: SlicePlane; onPlane?: (plane: SlicePlane) => void;
  camera?: VolumeCameraState;
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
  background = "#030406",
  camera,
  onCameraChange,
  onCancel,
  onError,
  onReady,
}: VolumeCanvasProps) {
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
    setPreparedKey("");
    const source = loader[resolution];
    if (!source?.getVolume) { setPreparedKey(prepareKey); return; }
    Promise.all(selectedChannels.map(channel => source.getVolume(volumeSelection(source.labels, channel.index, t))))
      .then(() => { if (!cancelled) setPreparedKey(prepareKey); })
      .catch((error) => { if (!cancelled) reportError(String(error)); });
    return () => { cancelled = true; };
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
  const viewState = {
    ...defaultView,
    id: "3d",
    rotationOrbit: camera?.orbit ?? 0,
    rotationX: camera?.tilt ?? 0,
    zoom: camera?.zoom ?? finite(defaultView.zoom, 0),
  };
  const physicalScale = volumePhysicalScale(loader);
  // OrbitView maps 2^zoom pixels per world unit at the camera target. Because
  // it uses perspective, this bar describes the plane through the volume center.
  const view = useMemo(() => new VolumeView({ id: "3d", width, height, target: defaultView.target, useFixedAxis: true }),
    [width, height, defaultView.target]);

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

  return <div className="volume-stage" style={{ backgroundColor: background }}>
    {!loadError && showScale && physicalScale && <ScaleBar unitsPerPixel={physicalScale.size / 2 ** viewState.zoom} unit={physicalScale.unit} perspective />}
    {preparedKey === prepareKey && <VolumeVivViewer
      views={[view]}
      viewStates={[viewState]}
      layerProps={layerProps}
      useDevicePixels={false}
      deckProps={{ style: { backgroundColor: background } }}
      onViewStateChange={({ viewId, viewState: next }: any) => {
        if (viewId !== "3d") return;
        onCameraChange({ ...camera,
          orbit: finite(next.rotationOrbit, viewState.rotationOrbit),
          tilt: finite(next.rotationX, viewState.rotationX),
          zoom: finite(next.zoom, viewState.zoom),
        });
      }}
    />}
    {!ready && !loadError && <div className="volume-loading" role="status" aria-live="polite">
      <strong>Loading 3D volume…</strong>
      {preparedKey === prepareKey ? <><progress max="1" value={progress} /><span>{Math.round(progress * 100)}%</span></> : <span>Preparing cached volume data...</span>}
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
  return <VolumeErrorBoundary onError={props.onError} onCancel={props.onCancel}>
    {props.view && props.view !== "3d" ? <VivSectionsCanvas props={props} renderVolume={(width,height) => <VolumeRenderer {...props}
      width={width} height={height} view="3d" camera={props.camera ? {...props.camera,zoom:props.camera.zoom-1} : undefined}
      onCameraChange={camera=>props.onCameraChange({...camera,zoom:camera.zoom+1})} />} /> : <VolumeRenderer {...props} />}
  </VolumeErrorBoundary>;
}

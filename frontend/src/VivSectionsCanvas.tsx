import { useImageCursor } from "./use-image-cursor";
import { IMAGE_BACKGROUND } from "./viewer-appearance";
import { useMemo, useRef, type ReactNode } from "react";
import { ColorPaletteExtension, VivViewer } from "@hms-dbmi/viv";
import { Matrix4 } from "@math.gl/core";
import type { VolumeCanvasProps } from "./VolumeCanvas";
import { SliceControls, sliceAxis, type SlicePlane } from "./VolumeViewControls";
import { planeAxes, sectionFitZoom, sectionIndex, sectionSource, vivVolumePanels } from "./viv-slices";
import { volumeModelMatrix, volumePhysicalScale, activeVolumeChannels } from "./volume-utils";
import { ScaleBar } from "./ScaleBar";
import { GentleDetailView } from "./viv-navigation";
import type { ChannelState, VolumeCameraState } from "./types";
import type { PhysicalSize } from "./ngff-physical-sizes";

const SectionViewer = VivViewer as any;
const axisColors = ["#ef7777", "#77d98b", "#7faaff"];

interface SectionProps {
  panel: ReturnType<typeof vivVolumePanels>[number]; source: any; plane: SlicePlane; index: number; t: number;
  extent: number[]; shape: number[]; fractions: number[]; target: number[]; zoom: number; channels: ChannelState[];
  brightness: number; showScale: boolean; physicalUnit?: PhysicalSize;
  onNavigate: (plane: SlicePlane, state: any) => void; onSelect: (plane: SlicePlane, point: number[]) => void;
  onReady: () => void; onError: (message: string) => void;
}

function Section({ panel, source, plane, index, t, extent, shape, fractions, target, zoom, channels, brightness,
  showScale, physicalUnit, onNavigate, onSelect, onReady, onError }: SectionProps) {
  const cursorHost=useImageCursor("viv-2d");
  const [a, b] = planeAxes[plane];
  const errorHandler = useRef(onError); errorHandler.current = onError;
  const raster = useMemo(() => {
    const section = sectionSource(source, plane, index, t);
    return { ...section, async getRaster(options: any) {
      try { return await section.getRaster(options); }
      catch (error) { if (!(error instanceof DOMException && error.name === "AbortError")) errorHandler.current(String(error)); throw error; }
    } };
  }, [source, plane, index, t]);
  const view = useMemo(() => new GentleDetailView({ id: plane, width: panel.width, height: panel.height }), [plane, panel.width, panel.height]);
  const matrix = useMemo(() => new Matrix4().scale([extent[a] / shape[a], extent[b] / shape[b], 1]), [extent[a], extent[b], shape[a], shape[b]]);
  const state = { id: plane, target: [target[a] * extent[a], target[b] * extent[b], 0], zoom };
  const cross = [a, b].map((axis, i) => (fractions[axis] - target[axis]) * extent[axis] * 2 ** zoom + [panel.width, panel.height][i] / 2);
  return <div className="viv-section-panel image-cursor-surface" ref={cursorHost} style={{ left: panel.x, top: panel.y, width: panel.width, height: panel.height }}>
    <SectionViewer views={[view]} viewStates={[state]} useDevicePixels={false} layerProps={[{
      loader: [raster], modelMatrix: matrix, selections: channels.map(c => ({ c: c.index })),
      channelsVisible: channels.map(() => true), colors: channels.map(c => [1,3,5].map(i => parseInt(c.color.slice(i,i+2),16))),
      contrastLimits: channels.map(c => [c.low, c.low + (c.high - c.low) / brightness]), extensions: [new ColorPaletteExtension()],
      onViewportLoad: () => window.setTimeout(onReady, 0), onTileError: (error: unknown) => onError(String(error)),
    }]} onViewStateChange={({ viewState }: any) => onNavigate(plane, viewState)}
      deckProps={{ deviceProps:{webgl:{preserveDrawingBuffer:true}}, onClick: (info: any) => {
        if (info.viewport) onSelect(plane, info.viewport.unproject([info.x, info.y]));
      } }} />
    <svg className="section-crosshair" width="100%" height="100%" aria-hidden="true">
      <line x1={cross[0]} x2={cross[0]} y1="0" y2="100%" stroke={axisColors[a]} />
      <line x1="0" x2="100%" y1={cross[1]} y2={cross[1]} stroke={axisColors[b]} />
      <circle cx={cross[0]} cy={cross[1]} r="4" fill="none" stroke="white" />
    </svg>
    {showScale && physicalUnit && <ScaleBar unitsPerPixel={physicalUnit.size / 2 ** zoom} unit={physicalUnit.unit} />}
  </div>;
}

export function VivSectionsCanvas({ props, renderVolume }: { props: VolumeCanvasProps; renderVolume: (width: number, height: number, camera: VolumeCameraState, onChange: (camera: VolumeCameraState) => void, onReady:()=>void) => ReactNode }) {
  const { width, height, loader, resolution, t, channels, camera, onCameraChange, onReady, onError } = props;
  const mode = props.view || "slice", plane = props.plane || "xy";
  const source = loader[resolution];
  const shape = ["x", "y", "z"].map(axis => Number(source.shape[source.labels.indexOf(axis)] || 1));
  const matrix = volumeModelMatrix(loader, resolution);
  const baseScale = matrix.getScale();
  const sizes = ["x", "y", "z"].map(axis => source.meta?.physicalSizes?.[axis]?.size || 1);
  const smallest = Math.min(...sizes);
  const extent = shape.map((size, axis) => size * baseScale[axis] * sizes[axis] / smallest);
  const indices = shape.map((size, axis) => sectionIndex(camera?.slicePosition?.[axis] ?? .5, size));
  const fractions = indices.map((index, axis) => (index + .5) / shape[axis]);
  const target = camera?.sliceTarget || [.5,.5,.5];
  const panels = vivVolumePanels(mode, plane, width, height);
  const frame=useMemo(()=>new Set<string>(),[source,t,mode,plane,channels.filter(c=>c.visible).map(c=>c.index).join(",")]);
  const liveFrame=useRef(frame);liveFrame.current=frame;
  const panelReady=(id:string)=>{if(liveFrame.current!==frame)return;frame.add(id);if(panels.every(panel=>frame.has(panel.id)))onReady();};
  const fit = sectionFitZoom(panels, extent), zoom = fit + (camera?.sliceZoom || 0);
  const unit = volumePhysicalScale(loader);
  const change = (values: Partial<NonNullable<typeof camera>>) => onCameraChange({ orbit:0, tilt:0, ...camera, zoom, slicePosition:fractions, ...values });
  const select = (plane: SlicePlane, point: number[]) => {
    const position = fractions.slice();
    planeAxes[plane].forEach((axis, i) => { position[axis] = Math.max(0, Math.min(1, point[i] / extent[axis])); });
    change({ slicePosition: position });
  };
  return <div className="volume-stage" style={{ backgroundColor: IMAGE_BACKGROUND }}>
    {panels.map(panel => panel.id === "3d" ? <div className="viv-section-panel" key="3d" style={{left:panel.x,top:panel.y,width:panel.width,height:panel.height}}>
      {renderVolume(panel.width,panel.height, { orbit:0, tilt:0, ...camera, zoom }, next => change({ ...next, sliceZoom:next.zoom-fit }),()=>panelReady("3d"))}
    </div> : <Section key={panel.id} panel={panel} source={source} plane={panel.id as SlicePlane} index={indices[sliceAxis[panel.id as SlicePlane]]} t={t}
      extent={extent} shape={shape} fractions={fractions} target={target} zoom={zoom} channels={activeVolumeChannels(channels)} brightness={props.brightness || 1}
      physicalUnit={unit} showScale={props.showScale !== false} onReady={()=>panelReady(panel.id)} onError={onError} onSelect={select}
      onNavigate={(plane: SlicePlane, next: any) => {
        const center = target.slice();
        planeAxes[plane].forEach((axis, i) => { center[axis] = next.target[i] / extent[axis]; });
        change({ sliceTarget: center, slicePosition: center, sliceZoom: next.zoom - fit });
      }} />)}
    <SliceControls view={mode} plane={plane} onPlane={value => props.onPlane?.(value)}
      source={{ shape:shape.slice().reverse(), resolution:extent.map((n,i)=>n/shape[i]),translation:[0,0,0],segmentation:false }}
      camera={{position:fractions.map((n,i)=>n*extent[i]),orientation:[0,0,0,1],scale:1}}
      onPosition={position=>change({slicePosition:position.map((n,i)=>n/extent[i])})} />
    {mode === "orthogonal" && <div className="orthogonal-panel-labels" aria-label="Orthogonal panels"><span>XY</span><span>XZ</span><span>3D</span><span>YZ</span></div>}
  </div>;
}

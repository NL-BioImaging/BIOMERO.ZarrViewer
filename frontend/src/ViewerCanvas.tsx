import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ColorPaletteExtension,
  MAX_CHANNELS,
  DETAIL_VIEW_ID,
  getDefaultInitialViewState,
  OVERVIEW_VIEW_ID,
  VivViewer,
} from "@hms-dbmi/viv";
import type { ChannelState, LabelState, ViewportState, ProjectionMode } from "./types";
import { CategoricalMultiscaleImageLayer } from "./categorical-image-layer";
import { InstanceColorExtension } from "./instance-color-extension";
import { inspectLabelPixel, type LabelHit, type LoadedLabel } from "./label-inspection";
import { previewLevel } from "./preview-resolution";
import { ScaleBar } from "./ScaleBar";
import { Matrix4 } from "@math.gl/core";
import { MultiplexDetailView as DetailView, MultiplexOverviewView as OverviewView } from "./multiplex-views";

interface LabelTooltip {
  screenX: number;
  screenY: number;
  imageX: number;
  imageY: number;
  hits: LabelHit[];
}

interface Props {
  width: number;
  height: number;
  loader: any[];
  labels: LoadedLabel[];
  channels: ChannelState[];
  labelStates: LabelState[];
  z: number;
  t: number;
  viewport?: ViewportState;
  projection?: ProjectionMode;
  showMinimap: boolean;
  showScale: boolean;
  physicalScale?: { size: number; unit: string };
  onViewportChange: (state: ViewportState) => void;
  onTileError: (message: string) => void;
  onTilesLoaded: () => void;
}

function hexToRgb(value: string): [number, number, number] {
  const hex = value.replace("#", "");
  return [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16)) as [number, number, number];
}

function selection(labels: string[], c: number, z: number, t: number): Record<string, number> {
  const values: Record<string, number> = {};
  if (labels.includes("c")) values.c = c;
  if (labels.includes("z")) values.z = z;
  if (labels.includes("t")) values.t = t;
  return values;
}

export function ViewerCanvas({
  width,
  height,
  loader,
  labels,
  channels,
  labelStates,
  z,
  t,
  viewport,
  projection = "slice",
  showMinimap,
  showScale,
  physicalScale,
  onViewportChange,
  onTileError,
  onTilesLoaded,
}: Props) {
  const loadingFrame=useMemo(()=>({ready:new Set<string>(),failed:new Set<string>(),expected:new Set([
    ...Array.from({length:Math.ceil(channels.filter(c=>c.visible).length/MAX_CHANNELS)},(_,i)=>`image:${i}`),
    ...labelStates.filter(state=>state.visible&&labels.some(label=>label.id===state.id)).map(state=>`label:${state.id}`),
  ])}),[loader,labels,z,t,JSON.stringify(channels.map(c=>c.visible)),JSON.stringify(labelStates.map(l=>[l.id,l.visible]))]);
  const liveFrame=useRef(loadingFrame);liveFrame.current=loadingFrame;
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hoverRequest = useRef(0);
  const hoverAbort=useRef<AbortController|undefined>(undefined);
  const [labelTooltip, setLabelTooltip] = useState<LabelTooltip | undefined>(undefined);
  const reportTileError = useCallback((layerId: string, error: unknown) => {
    if(liveFrame.current!==loadingFrame)return;
    if (error instanceof DOMException && error.name === "AbortError") return;
    loadingFrame.failed.add(layerId);
    onTileError(error instanceof Error ? error.message : "A tile failed to load");
  }, [onTileError,loadingFrame]);
  const reportViewportLoad = useCallback((layerId: string) => {
    if(liveFrame.current!==loadingFrame)return;
    loadingFrame.failed.delete(layerId);loadingFrame.ready.add(layerId);
    if (!loadingFrame.failed.size&&[...loadingFrame.expected].every(id=>loadingFrame.ready.has(id))) onTilesLoaded();
  }, [onTilesLoaded,loadingFrame]);
  useEffect(() => {
    if(!loadingFrame.expected.size)onTilesLoaded();
  }, [loadingFrame]);
  useEffect(() => () => {
    hoverAbort.current?.abort();
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverRequest.current += 1;
  }, []);
  useEffect(() => {
    hoverAbort.current?.abort();
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverRequest.current += 1;
    setLabelTooltip(undefined);
  }, [labels, labelStates, z, t]);
  const view = useMemo(() => new DetailView({ id: DETAIL_VIEW_ID, width, height }), [width, height]);
  const baseLabels = loader[0]?.labels || [];
  const baseSelections = channels.map((channel) => selection(baseLabels, channel.index, z, t));
  const spacingX=loader[0]?.meta?.physicalSizes?.x?.size||1;
  const aspect=(loader[0]?.meta?.physicalSizes?.y?.size||spacingX)/spacingX;
  const imageMatrix=useMemo(()=>new Matrix4().scale([1,aspect,1]),[aspect]);
  const baseView = useMemo(() => (getDefaultInitialViewState as any)(loader, { width, height }, 0.35,false,imageMatrix), [loader, width, height,imageMatrix]);
  const views: any[] = [view];
  const viewStates: any[] = [{
    ...baseView,
    ...(viewport ? { target: [viewport.x, viewport.y*aspect, 0], zoom: viewport.zoom } : {}),
    id: DETAIL_VIEW_ID,
  }];

  const labelById = new Map(labels.map((item) => [item.id, item]));
  const labelLayers = labelStates
    .filter((state) => state.visible && labelById.has(state.id))
    .map((state) => {
      const loaded = labelById.get(state.id)!;
      const sourceLabels = loaded.loader[0]?.labels || [];
      const fixedColor = state.color ? hexToRgb(state.color) : undefined;
      return new CategoricalMultiscaleImageLayer({
        id: `label-${state.id}-#${DETAIL_VIEW_ID}#`,
        viewportId: DETAIL_VIEW_ID,
        loader: loaded.loader,
        modelMatrix:new Matrix4().translate(["x","y","z"].map(axis=>((loaded.loader[0]?.meta?.physicalOrigin?.[axis]||0)-(loader[0]?.meta?.physicalOrigin?.[axis]||0))/spacingX)).scale(["x","y","z"].map(axis=>(loaded.loader[0]?.meta?.physicalSizes?.[axis]?.size||spacingX)/spacingX)),
        selections: [selection(sourceLabels, loaded.channelIndex || 0, z, t)],
        channelsVisible: [true],
        contrastLimits: [[0, 1]],
        extensions: [new InstanceColorExtension()],
        opacity: state.opacity,
        labelMode: state.mode,
        labelColor: fixedColor,
        highlightValues: state.highlightValues || (state.highlightValue ? [state.highlightValue] : []),
        outlineWidth: state.outlineWidth || 2,
        interpolation: "nearest",
        refinementStrategy: "no-overlap",
        excludeBackground: true,
        pickable: true,
        onTileError: (error: unknown) => reportTileError(`label:${state.id}`, error),
        onViewportLoad: () => reportViewportLoad(`label:${state.id}`),
      } as any);
    });

  const layerProps: any[] = [{
    loader,
    modelMatrix:imageMatrix,
    selections: baseSelections,
    channelsVisible: channels.map((channel) => channel.visible),
    colors: channels.map((channel) => hexToRgb(channel.color)),
    contrastLimits: channels.map((channel) => [channel.low, channel.high]),
    extensions: [new ColorPaletteExtension()],
    onBatchTileError: (index:number,error: unknown) => reportTileError(`image:${index}`, error),
    onBatchViewportLoad: (index:number) => reportViewportLoad(`image:${index}`),
  }];

  if (showMinimap) {
    const overviewLoader = loader.slice(0, previewLevel(loader, 160 * (window.devicePixelRatio || 1)) + 1);
    views.push(new OverviewView({ id: OVERVIEW_VIEW_ID, loader: overviewLoader, detailHeight: height, detailWidth: width, position: "bottom-left", margin: 16, minimumWidth: 120, maximumWidth: 160, minimumHeight: 90, maximumHeight: 160, clickCenter: true }));
    layerProps.push({ ...layerProps[0], loader: overviewLoader, onBatchViewportLoad:()=>{},onBatchTileError:()=>{} });
    viewStates.push({ id: OVERVIEW_VIEW_ID });
  }

  const zoom = Number(viewStates[0].zoom || 0);
  const inspectHover = useCallback((info: any) => {
    hoverAbort.current?.abort();
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    const coordinate = info.viewport?.id === DETAIL_VIEW_ID ? info.coordinate : undefined;
    if (!coordinate || coordinate.length < 2) {
      hoverRequest.current += 1;
      setLabelTooltip(undefined);
      return;
    }
    const imageX = Math.floor(Number(coordinate[0]));
    const imageY = Math.floor(Number(coordinate[1])/aspect);
    const request = ++hoverRequest.current;
    hoverTimer.current = setTimeout(() => {
      const controller=new AbortController();hoverAbort.current=controller;
      void inspectLabelPixel(labels, labelStates, imageX, imageY, z, t, loader[0],controller.signal).then((hits) => {
        if (request !== hoverRequest.current) return;
        setLabelTooltip(hits.length ? {
          screenX: Number(info.x),
          screenY: Number(info.y),
          imageX,
          imageY,
          hits,
        } : undefined);
      });
    }, 80);
  }, [labels, labelStates, z, t,aspect,loader]);

  return <>
    <VivViewer
      views={views}
      viewStates={viewStates}
      layerProps={layerProps}
      onViewStateChange={({ viewId, viewState }: any) => {
        if (viewId !== DETAIL_VIEW_ID) return;
        const target = viewState.target || baseView.target;
        onViewportChange({ x: Number(target[0]), y: Number(target[1])/aspect, zoom: Number(viewState.zoom) });
      }}
      deckProps={{
        layers: labelLayers,
        onHover: inspectHover,
      }}
    />
    {labelTooltip && <div
      className="label-tooltip"
      role="status"
      style={{
        left: labelTooltip.screenX + (labelTooltip.screenX > width - 240 ? -14 : 14),
        top: labelTooltip.screenY + (labelTooltip.screenY > height - 110 ? -14 : 14),
        transform: `translate(${labelTooltip.screenX > width - 240 ? "-100%" : "0"}, ${labelTooltip.screenY > height - 110 ? "-100%" : "0"})`,
      }}
    >
      {labelTooltip.hits.map((hit) => <div key={hit.id} title={hit.path}><strong>{hit.name}</strong><span>mask #{hit.value}</span></div>)}
      <small>x {labelTooltip.imageX} · y {labelTooltip.imageY} · {projection === "slice" ? `z ${z}` : "all Z (projected)"} · t {t}</small>
    </div>}
    {showScale && physicalScale && <ScaleBar unitsPerPixel={physicalScale.size / 2 ** zoom} unit={physicalScale.unit} />}
  </>;
}

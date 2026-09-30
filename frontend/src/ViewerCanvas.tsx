import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ColorPaletteExtension,
  DetailView,
  DETAIL_VIEW_ID,
  getDefaultInitialViewState,
  OverviewView,
  OVERVIEW_VIEW_ID,
  VivViewer,
} from "@hms-dbmi/viv";
import type { ChannelState, LabelState, ViewportState } from "./types";
import { CategoricalMultiscaleImageLayer } from "./categorical-image-layer";
import { InstanceColorExtension } from "./instance-color-extension";
import { inspectLabelPixel, type LabelHit, type LoadedLabel } from "./label-inspection";

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
  showMinimap,
  showScale,
  physicalScale,
  onViewportChange,
  onTileError,
  onTilesLoaded,
}: Props) {
  const failedLayers = useRef(new Set<string>());
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hoverRequest = useRef(0);
  const [labelTooltip, setLabelTooltip] = useState<LabelTooltip | undefined>(undefined);
  const reportTileError = useCallback((layerId: string, error: unknown) => {
    failedLayers.current.add(layerId);
    onTileError(error instanceof Error ? error.message : "A tile failed to load");
  }, [onTileError]);
  const reportViewportLoad = useCallback((layerId: string) => {
    failedLayers.current.delete(layerId);
    if (!failedLayers.current.size) onTilesLoaded();
  }, [onTilesLoaded]);
  useEffect(() => {
    failedLayers.current.clear();
  }, [loader, labels, z, t]);
  useEffect(() => () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverRequest.current += 1;
  }, []);
  useEffect(() => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverRequest.current += 1;
    setLabelTooltip(undefined);
  }, [labels, labelStates, z, t]);
  const view = useMemo(() => new DetailView({ id: DETAIL_VIEW_ID, width, height }), [width, height]);
  const baseLabels = loader[0]?.labels || [];
  const baseSelections = channels.map((channel) => selection(baseLabels, channel.index, z, t));
  const baseView = useMemo(() => getDefaultInitialViewState(loader, { width, height }, 0.35) as any, [loader, width, height]);
  const views: any[] = [view];
  const viewStates: any[] = [{
    ...baseView,
    ...(viewport ? { target: [viewport.x, viewport.y, 0], zoom: viewport.zoom } : {}),
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
    selections: baseSelections,
    channelsVisible: channels.map((channel) => channel.visible),
    colors: channels.map((channel) => hexToRgb(channel.color)),
    contrastLimits: channels.map((channel) => [channel.low, channel.high]),
    extensions: [new ColorPaletteExtension()],
    onTileError: (error: unknown) => reportTileError("image", error),
    onViewportLoad: () => reportViewportLoad("image"),
  }];

  if (showMinimap) {
    views.push(new OverviewView({ id: OVERVIEW_VIEW_ID, loader, detailHeight: height, detailWidth: width, position: "bottom-left", margin: 16, minimumWidth: 120, maximumWidth: 160, minimumHeight: 90, maximumHeight: 160, clickCenter: true }));
    layerProps.push(layerProps[0]);
    viewStates.push({ id: OVERVIEW_VIEW_ID });
  }

  const zoom = Number(viewStates[0].zoom || 0);
  const scaleBar = physicalScale ? scaleBarSize(physicalScale.size, zoom) : undefined;
  const inspectHover = useCallback((info: any) => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    const coordinate = info.viewport?.id === DETAIL_VIEW_ID ? info.coordinate : undefined;
    if (!coordinate || coordinate.length < 2) {
      hoverRequest.current += 1;
      setLabelTooltip(undefined);
      return;
    }
    const imageX = Math.floor(Number(coordinate[0]));
    const imageY = Math.floor(Number(coordinate[1]));
    const request = ++hoverRequest.current;
    hoverTimer.current = setTimeout(() => {
      void inspectLabelPixel(labels, labelStates, imageX, imageY, z, t).then((hits) => {
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
  }, [labels, labelStates, z, t]);

  return <>
    <VivViewer
      views={views}
      viewStates={viewStates}
      layerProps={layerProps}
      onViewStateChange={({ viewId, viewState }: any) => {
        if (viewId !== DETAIL_VIEW_ID) return;
        const target = viewState.target || baseView.target;
        onViewportChange({ x: Number(target[0]), y: Number(target[1]), zoom: Number(viewState.zoom) });
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
      <small>x {labelTooltip.imageX} · y {labelTooltip.imageY} · z {z} · t {t}</small>
    </div>}
    {showScale && scaleBar && <div className="physical-scale" aria-label={`Scale ${scaleBar.value} ${physicalScale!.unit}`}>
      <span style={{ width: `${scaleBar.pixels}px` }} />
      <strong>{scaleBar.value} {unitLabel(physicalScale!.unit)}</strong>
    </div>}
  </>;
}

function scaleBarSize(pixelSize: number, zoom: number): { value: number; pixels: number } {
  const unitsPerScreenPixel = pixelSize / Math.pow(2, zoom);
  const target = unitsPerScreenPixel * 110;
  const power = Math.pow(10, Math.floor(Math.log10(target)));
  const normalized = target / power;
  const nice = (normalized < 1.5 ? 1 : normalized < 3.5 ? 2 : normalized < 7.5 ? 5 : 10) * power;
  return { value: nice, pixels: Math.max(45, Math.min(180, nice / unitsPerScreenPixel)) };
}

function unitLabel(unit: string): string {
  return unit === "micrometer" || unit === "micrometre" || unit === "µm" ? "µm" : unit;
}

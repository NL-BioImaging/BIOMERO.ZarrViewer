import { useMemo } from "react";
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

interface LoadedLabel {
  id: string;
  loader: any[];
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
}: Props) {
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
        selections: [selection(sourceLabels, 0, z, t)],
        channelsVisible: [true],
        contrastLimits: [[0, 1]],
        extensions: [new InstanceColorExtension()],
        opacity: state.opacity,
        labelMode: state.mode,
        labelColor: fixedColor,
        interpolation: "nearest",
        refinementStrategy: "no-overlap",
        excludeBackground: true,
        onTileError: (error: unknown) => onTileError(error instanceof Error ? error.message : "A label tile failed to load"),
      } as any);
    });

  const layerProps: any[] = [{
    loader,
    selections: baseSelections,
    channelsVisible: channels.map((channel) => channel.visible),
    colors: channels.map((channel) => hexToRgb(channel.color)),
    contrastLimits: channels.map((channel) => [channel.low, channel.high]),
    extensions: [new ColorPaletteExtension()],
    onTileError: (error: unknown) => onTileError(error instanceof Error ? error.message : "An image tile failed to load"),
  }];

  if (showMinimap) {
    views.push(new OverviewView({ id: OVERVIEW_VIEW_ID, loader, detailHeight: height, detailWidth: width, position: "bottom-left", margin: 16, minimumWidth: 120, maximumWidth: 160, minimumHeight: 90, maximumHeight: 160, clickCenter: true }));
    layerProps.push(layerProps[0]);
    viewStates.push({ id: OVERVIEW_VIEW_ID });
  }

  const zoom = Number(viewStates[0].zoom || 0);
  const scaleBar = physicalScale ? scaleBarSize(physicalScale.size, zoom) : undefined;

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
      }}
    />
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

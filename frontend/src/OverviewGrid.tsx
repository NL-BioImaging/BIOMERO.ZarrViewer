import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import { loadOmeZarrFromStore } from "@hms-dbmi/viv";
import * as zarr from "zarrita";
import { PrefixStore } from "./authenticated-store";
import type { Capability, ChannelState, PlateWell } from "./types";

interface OverviewGridProps {
  capability: Capability;
  store: zarr.FetchStore;
  mode: "well" | "plate";
  selectedPath?: string;
  plateFieldIndex: number;
  channels: ChannelState[];
  z: number;
  t: number;
  onSelect: (path: string) => void;
  onOpen: (path: string) => void;
}

function wellName(capability: Capability, well: PlateWell): string {
  const plate = capability.plate!;
  return `${plate.rows[well.row_index]}${plate.columns[well.column_index]}`;
}

export interface OverviewTile {
  path: string;
  title: string;
  rowIndex?: number;
  columnIndex?: number;
}

interface LayoutTile extends OverviewTile {
  left: number;
  top: number;
}

const TILE_SIZE = 420;
const TILE_GAP = 12;
const WELL_COLUMNS = 3;

export function overviewTiles(capability: Capability, mode: "well" | "plate", selectedPath: string | undefined, plateFieldIndex: number): OverviewTile[] {
  const plate = capability.plate!;
  const selectedWell = plate.wells.find((well) => well.fields.some((field) => field.path === selectedPath)) || plate.wells.find((well) => well.fields.length);
  if (mode === "well") {
    return (selectedWell?.fields || []).map((field, index) => ({ path: field.path, title: `Well ${wellName(capability, selectedWell!)} · Field ${field.name || index}` }));
  }
  return plate.wells.filter((well) => well.fields.length).map((well) => {
    const fieldIndex = Math.min(Math.max(0, plateFieldIndex), well.fields.length - 1);
    const field = well.fields[fieldIndex];
    return { path: field.path, title: `Well ${wellName(capability, well)} · Field ${field.name || fieldIndex}`, rowIndex: well.row_index, columnIndex: well.column_index };
  });
}

export function overviewLayout(tiles: OverviewTile[], mode: "well" | "plate"): { tiles: LayoutTile[]; width: number; height: number } {
  if (mode === "well") {
    const columns = Math.min(WELL_COLUMNS, Math.max(1, tiles.length));
    const rows = Math.max(1, Math.ceil(tiles.length / columns));
    return {
      tiles: tiles.map((tile, index) => ({ ...tile, left: (index % columns) * (TILE_SIZE + TILE_GAP), top: Math.floor(index / columns) * (TILE_SIZE + TILE_GAP) })),
      width: columns * TILE_SIZE + (columns - 1) * TILE_GAP,
      height: rows * TILE_SIZE + (rows - 1) * TILE_GAP,
    };
  }
  const rows = [...new Set(tiles.map((tile) => tile.rowIndex).filter((value): value is number => value != null))].sort((a, b) => a - b);
  const columns = [...new Set(tiles.map((tile) => tile.columnIndex).filter((value): value is number => value != null))].sort((a, b) => a - b);
  return {
    tiles: tiles.map((tile) => ({ ...tile, left: columns.indexOf(tile.columnIndex!) * (TILE_SIZE + TILE_GAP), top: rows.indexOf(tile.rowIndex!) * (TILE_SIZE + TILE_GAP) })),
    width: Math.max(1, columns.length) * TILE_SIZE + Math.max(0, columns.length - 1) * TILE_GAP,
    height: Math.max(1, rows.length) * TILE_SIZE + Math.max(0, rows.length - 1) * TILE_GAP,
  };
}

export function OverviewGrid({ capability, store, mode, selectedPath, plateFieldIndex, channels, z, t, onSelect, onOpen }: OverviewGridProps) {
  const tiles = useMemo(() => overviewTiles(capability, mode, selectedPath, plateFieldIndex), [capability, mode, plateFieldIndex, selectedPath]);
  const layout = useMemo(() => overviewLayout(tiles, mode), [mode, tiles]);
  const viewport = useRef<HTMLDivElement>(null);
  const [viewportSize, setViewportSize] = useState({ width: 1, height: 1 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [fullWidth, setFullWidth] = useState<number>();
  const drag = useRef<{ x: number; y: number; panX: number; panY: number; moved: boolean } | undefined>(undefined);
  const suppressClick = useRef(false);
  const layoutKey = layout.tiles.map((tile) => tile.path).join("|");

  const fit = useCallback(() => {
    const next = Math.max(0.1, Math.min(4, Math.min((viewportSize.width - 32) / layout.width, (viewportSize.height - 32) / layout.height)));
    setZoom(next);
    setPan({ x: (viewportSize.width - layout.width * next) / 2, y: (viewportSize.height - layout.height * next) / 2 });
  }, [layout.height, layout.width, viewportSize.height, viewportSize.width]);

  useEffect(() => {
    if (!viewport.current) return;
    const observer = new ResizeObserver(([entry]) => setViewportSize({ width: Math.max(1, entry.contentRect.width), height: Math.max(1, entry.contentRect.height) }));
    observer.observe(viewport.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => { fit(); }, [fit, layoutKey]);

  const onWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const next = Math.max(0.1, Math.min(4, zoom * Math.exp(-event.deltaY * 0.0015)));
    const sceneX = (pointer.x - pan.x) / zoom;
    const sceneY = (pointer.y - pan.y) / zoom;
    setPan({ x: pointer.x - sceneX * next, y: pointer.y - sceneY * next });
    setZoom(next);
  };
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y, moved: false };
    setDragging(true);
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const dx = event.clientX - drag.current.x;
    const dy = event.clientY - drag.current.y;
    drag.current.moved ||= Math.abs(dx) + Math.abs(dy) > 4;
    setPan({ x: drag.current.panX + dx, y: drag.current.panY + dy });
  };
  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current?.moved) suppressClick.current = true;
    drag.current = undefined;
    setDragging(false);
    event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const onDoubleClick = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const sceneX = (event.clientX - rect.left - pan.x) / zoom;
    const sceneY = (event.clientY - rect.top - pan.y) / zoom;
    const tile = layout.tiles.find((item) => sceneX >= item.left && sceneX <= item.left + TILE_SIZE && sceneY >= item.top && sceneY <= item.top + TILE_SIZE);
    if (tile) onOpen(tile.path);
  };
  const handleRendered = useCallback((path: string, preview: string, width: number) => {
    setPreviews((current) => current[path] === preview ? current : { ...current, [path]: preview });
    setFullWidth((current) => current || width);
  }, []);

  const miniScale = Math.min(150 / layout.width, 120 / layout.height, 1);
  const visible = {
    left: Math.max(0, -pan.x / zoom),
    top: Math.max(0, -pan.y / zoom),
    right: Math.min(layout.width, (viewportSize.width - pan.x) / zoom),
    bottom: Math.min(layout.height, (viewportSize.height - pan.y) / zoom),
  };
  const pixelSize = physicalPixelSize(capability);
  const scaleBar = pixelSize && fullWidth ? scaleBarSize(pixelSize.size * fullWidth / ((TILE_SIZE - 16) * zoom)) : undefined;

  return <div className="overview-stage">
    <div
      ref={viewport}
      className={`overview-viewport ${dragging ? "dragging" : ""}`}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={onDoubleClick}
      onClickCapture={(event) => { if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; } }}
    >
      <div className="overview-scene" style={{ width: layout.width, height: layout.height, transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
      {layout.tiles.map((tile) => <ThumbnailTile
        key={tile.path}
        store={store}
        path={tile.path}
        title={tile.title}
        selected={tile.path === selectedPath}
        channels={channels}
        z={z}
        t={t}
        style={{ left: tile.left, top: tile.top, width: TILE_SIZE, height: TILE_SIZE }}
        onRendered={handleRendered}
        onSelect={() => onSelect(tile.path)}
        onOpen={() => onOpen(tile.path)}
      />)}
      </div>
    </div>
    <div className="overview-minimap" style={{ width: layout.width * miniScale, height: layout.height * miniScale }} aria-label="Overview minimap">
      {layout.tiles.map((tile) => previews[tile.path]
        ? <img key={tile.path} src={previews[tile.path]} alt="" style={{ left: tile.left * miniScale, top: tile.top * miniScale, width: TILE_SIZE * miniScale, height: TILE_SIZE * miniScale }} />
        : <i key={tile.path} style={{ left: tile.left * miniScale, top: tile.top * miniScale, width: TILE_SIZE * miniScale, height: TILE_SIZE * miniScale }} />)}
      <span className="minimap-window" style={{ left: visible.left * miniScale, top: visible.top * miniScale, width: Math.max(0, visible.right - visible.left) * miniScale, height: Math.max(0, visible.bottom - visible.top) * miniScale }} />
    </div>
    <div className="overview-camera-status">
      <button onClick={fit}>Fit</button><output>{Math.round(zoom * 100)}%</output><span>Wheel to zoom · drag to pan</span>
    </div>
    {scaleBar && <div className="physical-scale overview-scale" aria-label={`Scale ${scaleBar.value} ${pixelSize!.unit}`}><span style={{ width: `${scaleBar.pixels}px` }}/><strong>{scaleBar.value} {unitLabel(pixelSize!.unit)}</strong></div>}
  </div>;
}

function physicalPixelSize(capability: Capability): { size: number; unit: string } | undefined {
  const xIndex = capability.axes.findIndex((axis) => axis.name === "x");
  const transformations = capability.datasets?.[0]?.coordinate_transformations;
  if (xIndex < 0 || !Array.isArray(transformations)) return undefined;
  const scale = transformations.find((item: any) => item?.type === "scale" && Array.isArray(item.scale)) as any;
  const size = Number(scale?.scale?.[xIndex]);
  return Number.isFinite(size) && size > 0 ? { size, unit: capability.axes[xIndex].unit || "px" } : undefined;
}

function scaleBarSize(unitsPerScreenPixel: number): { value: number; pixels: number } {
  const target = unitsPerScreenPixel * 110;
  const power = Math.pow(10, Math.floor(Math.log10(target)));
  const normalized = target / power;
  const nice = (normalized < 1.5 ? 1 : normalized < 3.5 ? 2 : normalized < 7.5 ? 5 : 10) * power;
  return { value: nice, pixels: Math.max(45, Math.min(180, nice / unitsPerScreenPixel)) };
}

function unitLabel(unit: string): string {
  return unit === "micrometer" || unit === "micrometre" || unit === "µm" ? "µm" : unit;
}

function selection(source: any, channel: number, z: number, t: number): Record<string, number> {
  const labels: string[] = source.labels || [];
  const values: Record<string, number> = {};
  const clampAxis = (axis: string, value: number) => {
    const index = labels.indexOf(axis);
    return index < 0 ? 0 : Math.max(0, Math.min(Number(source.shape[index]) - 1, value));
  };
  if (labels.includes("c")) values.c = clampAxis("c", channel);
  if (labels.includes("z")) values.z = clampAxis("z", z);
  if (labels.includes("t")) values.t = clampAxis("t", t);
  return values;
}

function rgb(value: string): [number, number, number] {
  const hex = value.replace("#", "");
  return [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16)) as [number, number, number];
}

function ThumbnailTile({ store, path, title, selected, channels, z, t, style, onRendered, onSelect, onOpen }: {
  store: zarr.FetchStore;
  path: string;
  title: string;
  selected: boolean;
  channels: ChannelState[];
  z: number;
  t: number;
  style?: CSSProperties;
  onRendered: (path: string, preview: string, fullWidth: number) => void;
  onSelect: () => void;
  onOpen: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const clickTimer = useRef<number | undefined>(undefined);
  const [loader, setLoader] = useState<any[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoader(null);
    setError(false);
    loadOmeZarrFromStore(new PrefixStore(store, path) as any)
      .then((result) => { if (!cancelled) setLoader(result.data); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [path, store]);

  useEffect(() => {
    if (!loader || !canvas.current) return;
    let cancelled = false;
    const draw = async () => {
      const source = loader[loader.length - 1] || loader[0];
      const visible = channels.filter((channel) => channel.visible);
      if (!source || !visible.length) return;
      const rasters = await Promise.all(visible.map(async (channel) => ({ channel, raster: await source.getRaster({ selection: selection(source, channel.index, z, t) }) })));
      if (cancelled || !canvas.current || !rasters.length) return;
      const labels: string[] = source.labels || [];
      const width = Number(rasters[0].raster.width || source.shape[labels.indexOf("x")] || 1);
      const height = Number(rasters[0].raster.height || source.shape[labels.indexOf("y")] || 1);
      const output = new Uint8ClampedArray(width * height * 4);
      for (const { channel, raster } of rasters) {
        const color = rgb(channel.color);
        const span = Math.max(Number.EPSILON, channel.high - channel.low);
        const data = raster.data as ArrayLike<number>;
        for (let index = 0; index < width * height; index += 1) {
          const intensity = Math.max(0, Math.min(1, (Number(data[index]) - channel.low) / span));
          output[index * 4] = Math.min(255, output[index * 4] + intensity * color[0]);
          output[index * 4 + 1] = Math.min(255, output[index * 4 + 1] + intensity * color[1]);
          output[index * 4 + 2] = Math.min(255, output[index * 4 + 2] + intensity * color[2]);
          output[index * 4 + 3] = 255;
        }
      }
      canvas.current.width = width;
      canvas.current.height = height;
      canvas.current.getContext("2d")?.putImageData(new ImageData(output, width, height), 0, 0);
      const finest = loader[0];
      const finestLabels: string[] = finest?.labels || [];
      const xIndex = finestLabels.indexOf("x");
      onRendered(path, canvas.current.toDataURL("image/jpeg", 0.72), Number(xIndex >= 0 ? finest.shape[xIndex] : width));
    };
    void draw().catch(() => setError(true));
    return () => { cancelled = true; };
  }, [channels, loader, onRendered, path, t, z]);

  useEffect(() => () => window.clearTimeout(clickTimer.current), []);

  const handleClick = () => {
    if (clickTimer.current != null) {
      window.clearTimeout(clickTimer.current);
      clickTimer.current = undefined;
      onOpen();
    } else {
      clickTimer.current = window.setTimeout(() => {
        clickTimer.current = undefined;
        onSelect();
      }, 250);
    }
  };
  const handleDoubleClick = () => {
    window.clearTimeout(clickTimer.current);
    clickTimer.current = undefined;
    onOpen();
  };

  return <button className={`overview-tile ${selected ? "active" : ""}`} style={style} onClick={handleClick} onDoubleClick={handleDoubleClick}>
    <span className="thumbnail-frame">{error ? <span className="thumbnail-error">Unavailable</span> : <canvas ref={canvas} aria-label={`${title} thumbnail`} />}<strong className="overview-tile-label">{title}</strong></span>
  </button>;
}

import type { LabelState } from "./types";

export interface LoadedLabel {
  id: string;
  loader: any[];
  channelIndex?: number;
}

export interface LabelHit {
  id: string;
  name: string;
  path: string;
  value: number;
}

function selection(labels: string[], c: number, z: number, t: number): Record<string, number> {
  const values: Record<string, number> = {};
  if (labels.includes("c")) values.c = c;
  if (labels.includes("z")) values.z = z;
  if (labels.includes("t")) values.t = t;
  return values;
}

async function inspectLayer(
  loaded: LoadedLabel,
  state: LabelState,
  x: number,
  y: number,
  z: number,
  t: number,
): Promise<LabelHit | undefined> {
  const source = loaded.loader[0];
  if (!source) return undefined;
  const labels: string[] = source.labels || [];
  const xIndex = labels.indexOf("x");
  const yIndex = labels.indexOf("y");
  if (xIndex < 0 || yIndex < 0) return undefined;

  const pixelX = Math.floor(x);
  const pixelY = Math.floor(y);
  const width = Number(source.shape?.[xIndex]);
  const height = Number(source.shape?.[yIndex]);
  if (pixelX < 0 || pixelY < 0 || pixelX >= width || pixelY >= height) return undefined;

  const tileSize = Math.max(1, Number(source.tileSize) || 256);
  const tileX = Math.floor(pixelX / tileSize);
  const tileY = Math.floor(pixelY / tileSize);
  const tile = await source.getTile({
    x: tileX,
    y: tileY,
    selection: selection(labels, loaded.channelIndex || 0, z, t),
  });
  const tileWidth = Number(tile.width) || Math.min(tileSize, width - tileX * tileSize);
  const localX = pixelX - tileX * tileSize;
  const localY = pixelY - tileY * tileSize;
  const value = Math.round(Number(tile.data?.[localY * tileWidth + localX]));
  if (!Number.isFinite(value) || value <= 0) return undefined;
  const highlighted = state.highlightValues?.length
    ? state.highlightValues
    : state.highlightValue
      ? [state.highlightValue]
      : [];
  if (highlighted.length && !highlighted.includes(value)) return undefined;
  return { id: state.id, name: state.name, path: state.path, value };
}

export async function inspectLabelPixel(
  loadedLabels: LoadedLabel[],
  labelStates: LabelState[],
  x: number,
  y: number,
  z: number,
  t: number,
): Promise<LabelHit[]> {
  const loadedById = new Map(loadedLabels.map((label) => [label.id, label]));
  const results = await Promise.all(labelStates
    .filter((state) => state.visible && loadedById.has(state.id))
    .map(async (state) => {
      try {
        return await inspectLayer(loadedById.get(state.id)!, state, x, y, z, t);
      } catch {
        return undefined;
      }
    }));
  return results.filter((result): result is LabelHit => Boolean(result));
}

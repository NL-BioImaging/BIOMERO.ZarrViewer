import type { ProjectionMode } from "./types";

interface Raster { data: any; width: number; height: number }

/** Categorical Z union: retain the first non-background ID, never average IDs. */
export function projectLabelSource(source: any, values?: number[]): any {
  const zAxis = source.labels.indexOf("z");
  if (zAxis < 0) return source;
  const depth = Number(source.shape[zAxis]);
  const allowed = values?.length ? new Set(values.map(String)) : undefined;
  const tiles = new Map<string, Raster>();
  let cachedBytes = 0;
  const reduce = async (load: (z: number) => Promise<Raster>, signal?: AbortSignal): Promise<Raster> => {
    let result: Raster | undefined;
    for (let z = 0; z < depth; z++) {
      signal?.throwIfAborted();
      const plane = await load(z);
      signal?.throwIfAborted();
      if (!result) result = { ...plane, data: new plane.data.constructor(plane.data.length) };
      if (plane.width !== result.width || plane.height !== result.height || plane.data.length !== result.data.length)
        throw new Error("Label projection slices have inconsistent dimensions");
      for (let i = 0; i < plane.data.length; i++) {
        const value = plane.data[i];
        if (!result.data[i] && value > 0 && (!allowed || allowed.has(String(value)))) result.data[i] = value;
      }
    }
    if (!result) throw new Error("The label projection returned no planes");
    return result;
  };
  return {
    dtype: source.dtype,
    labels: source.labels.filter((_: string, index: number) => index !== zAxis),
    shape: source.shape.filter((_: number, index: number) => index !== zAxis),
    tileSize: source.tileSize,
    meta: source.meta,
    onTileError: (error: Error) => source.onTileError?.(error),
    getRaster: ({ selection, signal }: any) => reduce(z => source.getRaster({ selection: { ...selection, z }, signal }), signal),
    getTile: async ({ x, y, selection, signal }: any) => {
      signal?.throwIfAborted();
      const key = JSON.stringify([x, y, selection?.c || 0, selection?.t || 0]);
      const cached = tiles.get(key);
      if (cached) { tiles.delete(key); tiles.set(key, cached); return cached; }
      const result = await reduce(z => source.getTile({ x, y, selection: { ...selection, z }, signal }), signal);
      // Reuse projected tiles for hover inspection without retaining whole stacks.
      const bytes = result.data.byteLength;
      if (bytes <= 16 * 1024 * 1024) {
        if (tiles.has(key)) { cachedBytes -= tiles.get(key)!.data.byteLength; tiles.delete(key); }
        while (tiles.size && (tiles.size >= 32 || cachedBytes + bytes > 16 * 1024 * 1024)) {
          const oldest = tiles.keys().next().value!;
          cachedBytes -= tiles.get(oldest)!.data.byteLength; tiles.delete(oldest);
        }
        tiles.set(key, result); cachedBytes += bytes;
      }
      return result;
    },
  };
}

export function projectLabelLoader(loader: any[], projection: ProjectionMode, values?: number[]): any[] {
  return projection === "slice" ? loader : loader.map(source => projectLabelSource(source, values));
}

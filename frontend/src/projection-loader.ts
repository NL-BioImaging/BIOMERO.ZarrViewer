import type { ProjectionMode } from "./types";
const cachedProjections = new WeakMap<object, Map<string, Promise<PixelRaster>>>();

interface PixelRaster {
  data: any;
  width: number;
  height: number;
}

/** At most one decoded slice plus a floating-point accumulator is retained. */
async function project(
  depth: number,
  mode: Exclude<ProjectionMode, "slice">,
  load: (z: number) => Promise<PixelRaster>,
): Promise<PixelRaster> {
  let first: PixelRaster | undefined;
  let accumulator: Float64Array | undefined;
  for (let z = 0; z < depth; z++) {
    const raster = await load(z);
    if (!first) {
      first = { ...raster, data: new raster.data.constructor(0) };
      accumulator = Float64Array.from(raster.data);
    } else {
      if (raster.width !== first.width || raster.height !== first.height || raster.data.length !== accumulator!.length)
        throw new Error("Projection slices have inconsistent dimensions");
      for (let i = 0; i < accumulator!.length; i++) {
        const value = Number(raster.data[i]);
        accumulator![i] = mode === "mip" ? Math.max(accumulator![i], value)
          : mode === "min" ? Math.min(accumulator![i], value) : accumulator![i] + value;
      }
    }
  }
  if (!first || !accumulator) throw new Error("The Z projection returned no planes");
  const data = new first.data.constructor(accumulator.length);
  for (let i = 0; i < data.length; i++) data[i] = mode === "mean" ? accumulator[i] / depth : accumulator[i];
  return { ...first, data };
}

export function projectSource(source: any, mode: Exclude<ProjectionMode, "slice">): any {
  const labels: string[] = source.labels || [];
  const zIndex = labels.indexOf("z");
  if (zIndex < 0) return source;
  const depth = Math.max(1, Number(source.shape[zIndex]) || 1);
  const projectedLabels = labels.filter((_, index) => index !== zIndex);
  const projectedShape = source.shape.filter((_: number, index: number) => index !== zIndex);
  let cache = cachedProjections.get(source);
  if (!cache) { cache = new Map(); cachedProjections.set(source, cache); }
  const volumeProjection = (selection: any): Promise<PixelRaster> => {
    const key = JSON.stringify([mode, selection?.c || 0, selection?.t || 0]);
    let pending = cache!.get(key);
    if (!pending) {
      pending = source.getVolume(selection).then(async (volume: any) => {
        const size = volume.width * volume.height;
        return project(volume.depth, mode, async (z) => ({data: volume.data.subarray(z*size,(z+1)*size), width:volume.width, height:volume.height}));
      }).catch((error: unknown) => { cache!.delete(key); throw error; });
      cache!.set(key, pending!);
    }
    return pending!;
  };
  return {
    dtype: source.dtype,
    labels: projectedLabels,
    shape: projectedShape,
    tileSize: source.tileSize,
    meta: source.meta,
    onTileError: (error: Error) => source.onTileError?.(error),
    getRaster: async ({ selection, signal }: any) => {
      const result = source.getVolume ? await volumeProjection(selection) : await project(depth, mode, (z) => source.getRaster({ selection: { ...selection, z }, signal }));
      signal?.throwIfAborted(); return result;
    },
    getTile: async ({ x, y, selection, signal }: any) => {
      if (!source.getVolume) return project(depth, mode, (z) => source.getTile({ x, y, selection: { ...selection, z }, signal }));
      const raster = await volumeProjection(selection);
      signal?.throwIfAborted();
      const left = x * source.tileSize, top = y * source.tileSize;
      const width = Math.min(source.tileSize, raster.width-left), height = Math.min(source.tileSize, raster.height-top);
      const data = new raster.data.constructor(width*height);
      for (let row=0;row<height;row++) data.set(raster.data.subarray((top+row)*raster.width+left,(top+row)*raster.width+left+width),row*width);
      return {data,width,height};
    },
  };
}

export function projectLoader(loader: any[], mode: ProjectionMode): any[] {
  return mode === "slice" ? loader : loader.map((source) => projectSource(source, mode));
}

import type { ProjectionMode } from "./types";

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
  return {
    dtype: source.dtype,
    labels: projectedLabels,
    shape: projectedShape,
    tileSize: source.tileSize,
    meta: source.meta,
    onTileError: (error: Error) => source.onTileError?.(error),
    getRaster: ({ selection, signal }: any) => project(depth, mode, (z) => source.getRaster({ selection: { ...selection, z }, signal })),
    getTile: ({ x, y, selection, signal }: any) => project(depth, mode, (z) => source.getTile({ x, y, selection: { ...selection, z }, signal })),
  };
}

export function projectLoader(loader: any[], mode: ProjectionMode): any[] {
  return mode === "slice" ? loader : loader.map((source) => projectSource(source, mode));
}

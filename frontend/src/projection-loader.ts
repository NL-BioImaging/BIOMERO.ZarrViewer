import type { ProjectionMode } from "./types";

interface PixelRaster {
  data: any;
  width: number;
  height: number;
}

function aggregate(rasters: PixelRaster[], mode: Exclude<ProjectionMode, "slice">): PixelRaster {
  const first = rasters[0];
  if (!first) throw new Error("The Z projection returned no planes");
  const Output = first.data.constructor;
  const output = new Output(first.data.length);
  for (let index = 0; index < first.data.length; index += 1) {
    let value = Number(first.data[index]);
    for (let plane = 1; plane < rasters.length; plane += 1) {
      const candidate = Number(rasters[plane].data[index]);
      if (mode === "mip") value = Math.max(value, candidate);
      else if (mode === "min") value = Math.min(value, candidate);
      else value += candidate;
    }
    output[index] = mode === "mean" ? value / rasters.length : value;
  }
  return { data: output, width: first.width, height: first.height };
}

async function project(
  depth: number,
  mode: Exclude<ProjectionMode, "slice">,
  load: (z: number) => Promise<PixelRaster>,
): Promise<PixelRaster> {
  return aggregate(await Promise.all(Array.from({ length: depth }, (_, z) => load(z))), mode);
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

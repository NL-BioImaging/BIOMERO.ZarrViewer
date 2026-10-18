import type { ProjectionMode } from "./types";
import { SharedRequest } from "./shared-request";
export const PROJECTION_CACHE_BYTES = 64 * 1024 * 1024;
const cachedProjections = new WeakMap<object, Map<string, {task:SharedRequest<PixelRaster>;bytes:number}>>();
const retained=new Map<object,{bytes:number;remove:()=>void}>();

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
  signal?:AbortSignal,
): Promise<PixelRaster> {
  let first: PixelRaster | undefined;
  let accumulator: Float64Array | undefined;
  for (let z = 0; z < depth; z++) {
    signal?.throwIfAborted();
    const raster = await load(z);
    signal?.throwIfAborted();
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
  const volumeProjection = (selection: any,signal?:AbortSignal): Promise<PixelRaster> => {
    signal?.throwIfAborted();
    const key = JSON.stringify([mode, selection?.c || 0, selection?.t || 0]);
    let pending = cache!.get(key);
    if (!pending || pending.task.controller.signal.aborted) {
      const entry = {bytes:0,task:null as unknown as SharedRequest<PixelRaster>};
      entry.task = new SharedRequest(taskSignal=>source.getVolume(selection,{signal:taskSignal}).then(async (volume: any) => {
        const size = volume.width * volume.height;
        return project(volume.depth, mode, async (z) => ({data: volume.data.subarray(z*size,(z+1)*size), width:volume.width, height:volume.height}),taskSignal);
      }).then((raster:PixelRaster)=>{
        entry.bytes=raster.data.byteLength;
        retained.set(entry,{bytes:entry.bytes,remove:()=>{if(cache!.get(key)===entry)cache!.delete(key);}});
        let total=[...retained.values()].reduce((n,e)=>n+e.bytes,0);
        for(const [oldKey,old] of retained){if(total<=PROJECTION_CACHE_BYTES)break;old.remove();retained.delete(oldKey);total-=old.bytes;}
        return raster;
      }).catch((error: unknown) => { if(cache!.get(key)===entry)cache!.delete(key); throw error; }));
      pending=entry;cache!.set(key, entry);
    }
    cache!.delete(key);cache!.set(key,pending);
    const retainedEntry=retained.get(pending);if(retainedEntry){retained.delete(pending);retained.set(pending,retainedEntry);}
    return pending.task.consume(signal);
  };
  return {
    dtype: source.dtype,
    labels: projectedLabels,
    shape: projectedShape,
    tileSize: source.tileSize,
    meta: source.meta,
    onTileError: (error: Error) => source.onTileError?.(error),
    getRaster: async ({ selection, signal }: any) => {
      const result = source.getVolume ? await volumeProjection(selection,signal) : await project(depth, mode, (z) => source.getRaster({ selection: { ...selection, z }, signal }),signal);
      signal?.throwIfAborted(); return result;
    },
    getTile: async ({ x, y, selection, signal }: any) => {
      if (!source.getVolume) return project(depth, mode, (z) => source.getTile({ x, y, selection: { ...selection, z }, signal }),signal);
      const raster = await volumeProjection(selection,signal);
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

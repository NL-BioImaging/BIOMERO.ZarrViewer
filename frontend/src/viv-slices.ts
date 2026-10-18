import type { SlicePlane, VolumeView } from "./VolumeViewControls";
import { sliceAxis } from "./VolumeViewControls";
import { volumeSelection } from "./volume-utils";
import { SharedRequest } from "./shared-request";

export const planeAxes = { xy: [0, 1], xz: [0, 2], yz: [1, 2] } as const;

export function vivVolumePanels(mode: VolumeView, plane: SlicePlane, width: number, height: number) {
  if (mode === "3d") return [{ id: "3d", x: 0, y: 0, width, height }];
  if (mode === "slice") return [{ id: plane, x: 0, y: 0, width, height }];
  return ["xy", "xz", "3d", "yz"].map((id, index) => ({
    id, x: index % 2 ? width / 2 : 0, y: index > 1 ? height / 2 : 0,
    width: width / 2, height: height / 2,
  }));
}

/** Fit every section at one calibrated zoom, including anisotropic Z spacing. */
export function sectionFitZoom(panels: ReturnType<typeof vivVolumePanels>, extent: number[]) {
  return Math.log2(.85 * Math.min(...panels.filter(p => p.id !== "3d").flatMap(panel => {
    const [a, b] = planeAxes[panel.id as SlicePlane];
    return [panel.width / extent[a], panel.height / extent[b]];
  })));
}

export function sectionIndex(fraction: number, size: number) {
  return Math.max(0, Math.min(size - 1, Math.floor(fraction * size)));
}

/** Extract actual voxel planes, avoiding the ray-cast slab's projection and clipping. */
export function extractSection(data: any, shape: number[], plane: SlicePlane, index: number) {
  const [a, b] = planeAxes[plane], normal = sliceAxis[plane];
  const width = shape[a], height = shape[b];
  const output = new data.constructor(width * height);
  const xyz = [0, 0, 0]; xyz[normal] = index;
  for (let y = 0; y < height; y++) {
    xyz[b] = y;
    for (let x = 0; x < width; x++) {
      xyz[a] = x;
      output[y * width + x] = data[(xyz[2] * shape[1] + xyz[1]) * shape[0] + xyz[0]];
    }
  }
  return { data: output, width, height };
}

export function sectionSource(source: any, plane: SlicePlane, index: number, t: number) {
  const shape = ["x", "y", "z"].map(axis => source.shape[source.labels.indexOf(axis)] || 1);
  const [a, b] = planeAxes[plane];
  const count = source.shape[source.labels.indexOf("c")] || 1;
  const cache = new Map<number, SharedRequest<any>>();
  return {
    labels: ["c", "y", "x"], shape: [count, shape[b], shape[a]], dtype: source.dtype,
    async getRaster({ selection, signal }: any) {
      signal?.throwIfAborted();
      const c = selection?.c || 0;
      let pending = cache.get(c);
      if (!pending || pending.controller.signal.aborted) {
        pending = new SharedRequest(async taskSignal => {
          if (source.getVolume) {
            const volume = await source.getVolume(volumeSelection(source.labels, c, t),{signal:taskSignal});
            taskSignal.throwIfAborted();
            return extractSection(volume.data, shape, plane, index);
          }
          const selected = { ...volumeSelection(source.labels, c, t), z: plane === "xy" ? index : 0 };
          if (plane === "xy") return source.getRaster({ selection: selected, signal:taskSignal });
          let output: any;
          for (let z = 0; z < shape[2]; z++) {
            taskSignal.throwIfAborted();
            const row = await source.getRaster({ selection: { ...selected, z }, signal:taskSignal });
            output ??= new row.data.constructor(shape[a] * shape[b]);
            for (let x = 0; x < shape[a]; x++) output[z * shape[a] + x] = plane === "xz"
              ? row.data[index * shape[0] + x] : row.data[x * shape[0] + index];
          }
          return { data: output, width: shape[a], height: shape[b] };
        });
        cache.set(c, pending);
        const active=pending;
        void pending.promise.catch(() => {if(cache.get(c)===active)cache.delete(c);});
      }
      const result = await pending.consume(signal);
      signal?.throwIfAborted();
      return result;
    },
  };
}

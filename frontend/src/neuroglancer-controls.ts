/** Convert a wheel notch to ten calibrated Z slices, rather than a 1 nm world unit. */
export function depthWheelStep(deltaY: number, deltaMode: number, voxelDepthNm: number): number {
  if (!Number.isFinite(deltaY) || !deltaY || !Number.isFinite(voxelDepthNm) || voxelDepthNm <= 0) return 0;
  const notch = deltaMode === 1 ? 3 : deltaMode === 2 ? .1 : 100;
  const steps = Math.max(1, Math.min(20, Math.round(Math.abs(deltaY) / notch)));
  return Math.sign(deltaY) * steps * 10 * voxelDepthNm;
}

/** Gentle 12% zoom per notch, with smooth fractional trackpad movement. */
export function wheelZoomFactor(deltaY: number, deltaMode: number): number {
  if (!Number.isFinite(deltaY)) return 1;
  const notch = deltaMode === 1 ? 3 : deltaMode === 2 ? .1 : 100;
  return Math.pow(1.12, Math.max(-4, Math.min(4, deltaY / notch)));
}

export function configureVolumeWheel(bindings: { set: (key: string, action: { action: string; preventDefault: boolean }) => void }) {
  bindings.set("at:wheel", { action: "biomero-zoom-via-wheel", preventDefault: true });
  bindings.set("at:control+wheel", { action: "biomero-depth-via-wheel", preventDefault: true });
}

/** The embedded coordinate system uses nanometers, so one native step is not a source voxel. */
export function sliceWheelStep(normal: ArrayLike<number>, resolution: number[], delta: number, fast = false) {
  const axis = [0, 1, 2].reduce((largest, i) => Math.abs(normal[i]) > Math.abs(normal[largest]) ? i : largest, 0);
  return delta === 0 ? 0 : (delta > 0 ? -1 : 1) * resolution[axis] * (fast ? 10 : 1);
}

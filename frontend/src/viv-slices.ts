import { VolumeView } from "@hms-dbmi/viv";
import type { SlicePlane, VolumeView as ViewMode } from "./VolumeViewControls";
import { sliceAxis } from "./VolumeViewControls";

/** Axis-aligned Viv slabs reuse the selected intensity volume and its calibration. */
export function vivSliceProps(plane: SlicePlane, fractions: number[], extent: number[], shape: number[]) {
  const axis = sliceAxis[plane];
  const index = Math.min(shape[axis] - 1, Math.max(0, Math.floor(fractions[axis] * shape[axis])));
  return { [`${["x", "y", "z"][axis]}Slice`]: [index * extent[axis] / shape[axis], (index + 1) * extent[axis] / shape[axis]] };
}

export class VivSliceView extends VolumeView {
  getDeckGlView() {
    return super.getDeckGlView().clone({ orthographic: true, controller: { dragRotate: false, touchRotate: false, keyboard: false } });
  }
}

export function vivVolumePanels(mode: ViewMode, plane: SlicePlane, width: number, height: number) {
  if (mode === "3d") return [{ id: "3d", x: 0, y: 0, width, height }];
  if (mode === "slice") return [{ id: plane, x: 0, y: 0, width, height }];
  return ["xy", "xz", "3d", "yz"].map((id, index) => ({
    id, x: index % 2 ? width / 2 : 0, y: index > 1 ? height / 2 : 0,
    width: width / 2, height: height / 2,
  }));
}

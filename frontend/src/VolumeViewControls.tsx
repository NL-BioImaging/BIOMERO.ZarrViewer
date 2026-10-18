import type { NeuroglancerCamera, NeuroglancerSource } from "./neuroglancer-state";

export type VolumeView = "3d" | "slice" | "orthogonal";
export type SlicePlane = "xy" | "xz" | "yz";
export const sliceAxis = { xy: 2, xz: 1, yz: 0 } as const;

export function volumeLayout(view: VolumeView, plane: SlicePlane) {
  return view === "orthogonal" ? "4panel" : view === "slice" ? plane : "3d";
}

export function sliceIndex(source: NeuroglancerSource, position: number[] | undefined, axis: number) {
  const size = source.shape[2 - axis];
  const physical = position?.[axis] ?? source.translation[axis] + size * source.resolution[axis] / 2;
  return Math.max(0, Math.min(size - 1, Math.floor((physical - source.translation[axis]) / source.resolution[axis])));
}

export function SliceControls({ view, plane, onPlane, source, camera, onPosition }: {
  view: VolumeView; plane: SlicePlane; onPlane: (plane: SlicePlane) => void;
  source: NeuroglancerSource; camera?: NeuroglancerCamera; onPosition: (position: number[]) => void;
}) {
  if (view === "3d") return null;
  const axes = view === "orthogonal" ? [0, 1, 2] : [sliceAxis[plane]];
  return <div className="slice-controls" role="group" aria-label="Slice controls">
    {view === "slice" && <label>Plane <select aria-label="Slice plane" value={plane} onChange={event => onPlane(event.target.value as SlicePlane)}>
      <option value="xy">XY · top</option><option value="xz">XZ · front</option><option value="yz">YZ · side</option>
    </select></label>}
    {axes.map(axis => {
      const name = ["X", "Y", "Z"][axis];
      const index = sliceIndex(source, camera?.position, axis);
      const size = source.shape[2 - axis];
      return <label className="slice-position" key={axis}>{name}
        <input aria-label={`${name} slice position`} type="range" min="0" max={size - 1} step="1" value={index}
          onChange={event => {
            const position = source.resolution.map((spacing, i) => camera?.position[i] ?? source.translation[i] + source.shape[2 - i] * spacing / 2);
            position[axis] = source.translation[axis] + (Number(event.target.value) + .5) * source.resolution[axis];
            onPosition(position);
          }} /><output>{index + 1} / {size}</output>
      </label>;
    })}
  </div>;
}

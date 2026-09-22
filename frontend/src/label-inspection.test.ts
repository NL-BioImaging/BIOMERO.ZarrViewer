import { inspectLabelPixel } from "./label-inspection";
import type { LabelState } from "./types";

function loaded(id: string, data: number[], channelIndex = 0) {
  return {
    id,
    channelIndex,
    loader: [{
      labels: ["t", "c", "z", "y", "x"],
      shape: [2, 2, 3, 2, 3],
      tileSize: 3,
      getTile: vi.fn(async () => ({ width: 3, height: 2, data: new Uint16Array(data) })),
    }],
  };
}

const states: LabelState[] = [
  { id: "cellpose", name: "Cellpose", path: "labels/cellpose", visible: true, opacity: 0.4, mode: "fill" },
  { id: "stardist", name: "StarDist", path: "labels/stardist", visible: true, opacity: 0.4, mode: "outline" },
  { id: "hidden", name: "Hidden", path: "labels/hidden", visible: false, opacity: 0.4, mode: "fill" },
];

test("reports overlapping instance IDs from every visible label layer", async () => {
  const cellpose = loaded("cellpose", [0, 0, 0, 0, 52, 0], 1);
  const stardist = loaded("stardist", [0, 0, 0, 0, 17, 0]);
  const hidden = loaded("hidden", [0, 0, 0, 0, 99, 0]);

  await expect(inspectLabelPixel([cellpose, stardist, hidden], states, 1, 1, 2, 1)).resolves.toEqual([
    { id: "cellpose", name: "Cellpose", path: "labels/cellpose", value: 52 },
    { id: "stardist", name: "StarDist", path: "labels/stardist", value: 17 },
  ]);
  expect(cellpose.loader[0].getTile).toHaveBeenCalledWith({ x: 0, y: 0, selection: { t: 1, c: 1, z: 2 } });
  expect(hidden.loader[0].getTile).not.toHaveBeenCalled();
});

test("omits background, out-of-bounds coordinates, and failed layers", async () => {
  const background = loaded("cellpose", [0, 0, 0, 0, 0, 0]);
  const failed = loaded("stardist", []);
  failed.loader[0].getTile = vi.fn(async () => { throw new Error("unavailable"); });

  await expect(inspectLabelPixel([background, failed], states, 1, 1, 0, 0)).resolves.toEqual([]);
  await expect(inspectLabelPixel([background], states, -1, 1, 0, 0)).resolves.toEqual([]);
});

test("does not report instances hidden by a focused-value filter", async () => {
  const focused = loaded("cellpose", [0, 0, 0, 0, 52, 0]);
  await expect(inspectLabelPixel([focused], [{ ...states[0], highlightValues: [17] }], 1, 1, 0, 0)).resolves.toEqual([]);
});

import { fieldLabelPath, labelStates } from "./App";
import { overviewLayout, overviewTiles } from "./OverviewGrid";
import type { Capability } from "./types";

const plateCapability = {
  schema_version: 1,
  supported: true,
  image: { id: 1, name: "plate" },
  store: { url: "/data/", context: "signed", expires_at: "later" },
  kind: "plate",
  ngff_version: "0.4",
  zarr_format: 2,
  initial_path: "A/1/0",
  axes: [],
  channels: [],
  labels: [],
  plate: {
    name: "plate",
    rows: ["A", "B"],
    columns: ["1"],
    acquisitions: [],
    initial_path: "A/1/0",
    wells: [
      { path: "A/1", row_index: 0, column_index: 0, fields: [{ path: "A/1/0", name: "0" }, { path: "A/1/1", name: "1" }] },
      { path: "B/1", row_index: 1, column_index: 0, fields: [{ path: "B/1/0", name: "0" }] },
    ],
  },
} satisfies Capability;

test("label paths follow the selected plate field", () => {
  expect(fieldLabelPath("A/1/0/labels/nuclei", "A/1/0", "B/2/3")).toBe("B/2/3/labels/nuclei");
});

test("well and plate overviews choose the expected fields", () => {
  expect(overviewTiles(plateCapability, "well", "A/1/1", 0).map((tile) => tile.path)).toEqual(["A/1/0", "A/1/1"]);
  const plateTiles = overviewTiles(plateCapability, "plate", "A/1/0", 1);
  expect(plateTiles.map((tile) => tile.path)).toEqual(["A/1/1", "B/1/0"]);
  expect(plateTiles.map((tile) => [tile.rowIndex, tile.columnIndex])).toEqual([[0, 0], [1, 0]]);
  expect(plateTiles.map((tile) => tile.title)).toEqual(["Well A1 · Field 1", "Well B1 · Field 0"]);
  expect(overviewLayout(plateTiles, "plate").tiles.map((tile) => [tile.left, tile.top])).toEqual([[0, 0], [0, 432]]);
  expect(overviewLayout(overviewTiles(plateCapability, "well", "A/1/0", 0), "well").tiles.map((tile) => [tile.left, tile.top])).toEqual([[0, 0], [432, 0]]);
});

test("NGFF labels default to fifteen percent opacity", () => {
  const capability = { ...plateCapability, labels: [{ id: "nuclei", name: "Nuclei", path: "labels/nuclei", axes: [], datasets: [] }] };
  expect(labelStates(capability)[0].opacity).toBe(0.15);
});

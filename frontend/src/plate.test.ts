import { defaultZIndex, fieldLabelPath, labelStates } from "./App";
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

test("plate field label defaults use the selected field dimensionality", () => {
  const capability = { ...plateCapability, labels: [{ id: "nuclei", name: "Nuclei", path: "labels/nuclei", axes: [], datasets: [] }] };
  expect(labelStates(capability)[0].opacity).toBe(0.15);
  expect(labelStates(capability, 12)[0].opacity).toBe(0.55);
});

test("Z stacks start at the middle unless a deep link requests a slice", () => {
  expect(defaultZIndex(25)).toBe(12);
  expect(defaultZIndex(25, 0)).toBe(0);
  expect(defaultZIndex(25, 99)).toBe(24);
});


test.each([
  [0, 1, 1],
  [1, 1, 1],
  [2, 2, 1],
  [10, 4, 3],
  [36, 6, 6],
  [37, 7, 6],
  [81, 9, 9],
])("well overview packs %i fields into a %i by %i grid", (count, columns, rows) => {
  const tiles = Array.from({ length: count }, (_, index) => ({ path: `C/6/${index}`, title: `Field ${index}` }));
  const layout = overviewLayout(tiles, "well");
  expect(layout.tiles.map(tile => tile.path)).toEqual(tiles.map(tile => tile.path));
  expect(new Set(layout.tiles.map(tile => tile.left)).size).toBe(count ? columns : 0);
  expect(new Set(layout.tiles.map(tile => tile.top)).size).toBe(count ? rows : 0);
  expect(layout.width).toBe(columns * 420 + (columns - 1) * 12);
  expect(layout.height).toBe(rows * 420 + (rows - 1) * 12);
  expect(new Set(layout.tiles.map(tile => `${tile.left},${tile.top}`)).size).toBe(count);
  for (const tile of layout.tiles) {
    expect(tile.left).toBeGreaterThanOrEqual(0);
    expect(tile.top).toBeGreaterThanOrEqual(0);
    expect(tile.left + 420).toBeLessThanOrEqual(layout.width);
    expect(tile.top + 420).toBeLessThanOrEqual(layout.height);
  }
});

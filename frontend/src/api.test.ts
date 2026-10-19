import { fetchCapabilities } from "./api";
import { overviewTiles } from "./OverviewGrid";
import type { Capability, PlateField } from "./types";

const originalConfig = window.BIOMERO_ZARR_VIEWER;

beforeEach(() => {
  window.BIOMERO_ZARR_VIEWER = { capabilitiesTemplate: "/api/images/0/capabilities/" };
});
afterEach(() => {
  window.BIOMERO_ZARR_VIEWER = originalConfig;
  vi.unstubAllGlobals();
});

function capability(fields: PlateField[]): Capability {
  return {
    schema_version: 1, supported: true, kind: "plate",
    image: { id: 42, name: "Plate" },
    store: { url: "/data/", context: "signed", expires_at: "later" },
    ngff_version: "0.4", zarr_format: 2, initial_path: "A/1/10",
    axes: [], channels: [], labels: [],
    plate: {
      name: "Plate", rows: ["A"], columns: ["1"], acquisitions: [], initial_path: "A/1/10",
      wells: [{ path: "A/1", row_index: 0, column_index: 0, fields }],
    },
  };
}

function serve(payload: Capability) {
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: true, status: 200, redirected: false, json: async () => payload,
  })));
}

test.each([
  { names: ["0", "1", "10", "11", "2", "3"], expected: ["0", "1", "2", "3", "10", "11"] },
  { names: ["Field 10", "Field 2", "Field 1"], expected: ["Field 1", "Field 2", "Field 10"] },
])("loaded fields use numeric order for $names", async ({ names, expected }) => {
  const fields = names.map(name => ({ name, path: `A/1/${name}`, acquisition: 7 }));
  const payload = capability(fields);
  serve(payload);
  const loaded = await fetchCapabilities(42);
  expect(loaded.plate!.wells[0].fields.map(field => field.name)).toEqual(expected);
  expect(overviewTiles(loaded, "well", fields[0].path, 0).map(tile => tile.path)).toEqual(expected.map(name => `A/1/${name}`));
  expect(payload.plate!.wells[0].fields.map(field => field.name)).toEqual(names);
  expect(loaded.initial_path).toBe("A/1/10");
  expect(loaded.plate!.initial_path).toBe("A/1/10");
  expect(loaded.plate!.wells[0].fields.every(field => field.acquisition === 7)).toBe(true);
});

test("fields without display names sort by their numeric paths", async () => {
  serve(capability(["10", "2", "1"].map(index => ({ name: "", path: `A/1/${index}` }))));
  const loaded = await fetchCapabilities(42);
  expect(loaded.plate!.wells[0].fields.map(field => field.path)).toEqual(["A/1/1", "A/1/2", "A/1/10"]);
});

test("all 36 fields sort consistently for well and plate navigation", async () => {
  const names = Array.from({ length: 36 }, (_, index) => String(index));
  const payload = capability([...names].sort().map(name => ({ name, path: `A/1/${name}` })));
  serve(payload);
  const loaded = await fetchCapabilities(42);
  expect(loaded.plate!.wells[0].fields.map(field => field.name)).toEqual(names);
  expect(overviewTiles(loaded, "well", "A/1/24", 17).map(tile => tile.path)).toEqual(names.map(name => `A/1/${name}`));
  expect(overviewTiles(loaded, "plate", "A/1/24", 17)[0].path).toBe("A/1/17");
});

test("ordinary images without a plate keep their capability response", async () => {
  const { plate, ...image } = capability([]);
  image.kind = "image";
  serve(image);
  expect(await fetchCapabilities(42)).toEqual(image);
});

import { projectLoader, projectSource } from "./projection-loader";

function source() {
  return {
    dtype: "Uint16",
    labels: ["c", "z", "y", "x"],
    shape: [1, 3, 1, 2],
    tileSize: 2,
    getRaster: vi.fn(async ({ selection }: any) => ({ data: new Uint16Array([selection.z + 1, (selection.z + 1) * 10]), width: 2, height: 1 })),
    getTile: vi.fn(async ({ selection }: any) => ({ data: new Uint16Array([selection.z + 1, (selection.z + 1) * 10]), width: 2, height: 1 })),
  };
}

test.each([
  ["mip", [3, 30]],
  ["mean", [2, 20]],
  ["min", [1, 10]],
] as const)("computes a %s projection across the Z axis", async (mode, expected) => {
  const input = source();
  const projected = projectSource(input, mode);
  const raster = await projected.getRaster({ selection: { c: 0 } });
  expect(projected.labels).toEqual(["c", "y", "x"]);
  expect(projected.shape).toEqual([1, 1, 2]);
  expect(Array.from(raster.data)).toEqual(expected);
  expect(input.getRaster.mock.calls.map(([request]) => request.selection.z)).toEqual([0, 1, 2]);
});

test("slice mode keeps the original loader", () => {
  const input = [source()];
  expect(projectLoader(input, "slice")).toBe(input);
});

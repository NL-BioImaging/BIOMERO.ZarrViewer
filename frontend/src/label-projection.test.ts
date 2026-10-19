import { projectLabelLoader, projectLabelSource } from "./label-projection";
import { inspectLabelPixel } from "./label-inspection";

function source() {
  const planes = [[0, 7, 0, 0], [5, 19, 0, 0], [9, 0, 23, 0]];
  const load = vi.fn(async ({ selection }: any) => ({ data: new Uint32Array(planes[selection.z]), width: 4, height: 1 }));
  return { labels: ["t", "c", "z", "y", "x"], shape: [2, 1, 3, 1, 4], tileSize: 4, dtype: "Uint32", getRaster: load, getTile: load };
}

test.each(["mip", "mean", "min"] as const)("%s projects every label slice without arithmetic on object IDs", async mode => {
  const input = source();
  const projected = projectLabelLoader([input], mode)[0];
  const result = await projected.getTile({ x: 0, y: 0, selection: { z: 2, t: 1, c: 0 } });
  expect(Array.from(result.data)).toEqual([5, 7, 23, 0]);
  expect(projected.labels).toEqual(["t", "c", "y", "x"]);
  expect(input.getTile.mock.calls.map(([request]) => request.selection)).toEqual([0, 1, 2].map(z => ({ z, t: 1, c: 0 })));
  const state = { id: "cells", name: "Cells", path: "labels/cells", visible: true, opacity: 1, mode: "fill" as const };
  expect(await inspectLabelPixel([{ id: "cells", loader: [projected] }], [state], 2, 0, 0, 1)).toEqual([expect.objectContaining({ value: 23 })]);
  expect(input.getTile).toHaveBeenCalledTimes(3); // Hover reuses the projected tile.
  await projected.getTile({ x: 0, y: 0, selection: { t: 0 } });
  expect(input.getTile).toHaveBeenCalledTimes(6); // Timepoints do not share pixels.
});

test("slice mode and 2D label data remain unchanged", () => {
  const loader = [source()];
  expect(projectLabelLoader(loader, "slice")).toBe(loader);
  const flat = { labels: ["y", "x"], shape: [1, 4] };
  expect(projectLabelSource(flat)).toBe(flat);
});

test("focused IDs are selected before reduction so other objects cannot occlude them", async () => {
  const result = await projectLabelSource(source(), [19, 23]).getRaster({ selection: {} });
  expect(Array.from(result.data)).toEqual([0, 19, 23, 0]);
});

test("categorical projection preserves 64-bit labels exactly and never changes source pixels", async () => {
  const id = 2n ** 53n + 17n;
  const input = source();
  const data = new BigUint64Array([0n, id]);
  input.getRaster = vi.fn(async () => ({ data, width: 2, height: 1 })) as any;
  const result = await projectLabelSource(input).getRaster({ selection: {} });
  expect(result.data).toEqual(data);
  expect(result.data).not.toBe(data);
});

test("cancelled projections stop loading and do not poison later reads", async () => {
  const input = source(), controller = new AbortController();
  const projected = projectLabelSource(input);
  controller.abort();
  await expect(projected.getTile({ x: 0, y: 0, selection: {}, signal: controller.signal })).rejects.toThrow();
  expect(input.getTile).not.toHaveBeenCalled();
  expect(Array.from((await projected.getTile({ x: 0, y: 0, selection: {} })).data)).toEqual([5, 7, 23, 0]);
});

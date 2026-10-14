import { createPreviewQueue, previewLevel } from "./preview-resolution";
import { plateGeometry } from "./plate-geometry";

const pyramid = [2008, 1004, 502, 251, 125, 62, 31].map((size) => ({ labels: ["y", "x"], shape: [size, size] }));

test("previews gain detail as their displayed size increases", () => {
  expect(previewLevel(pyramid, 80)).toBe(4);
  expect(previewLevel(pyramid, 400)).toBe(2);
  expect(previewLevel(pyramid, 800)).toBe(1);
  expect(previewLevel(pyramid, 50000)).toBe(0);
});

test("a navigator excludes tiny pyramid levels", () => {
  expect(pyramid[previewLevel(pyramid, 160)].shape).toEqual([251, 251]);
});

test("preview jobs bound concurrent loads and release slots on failure", async () => {
  const queue = createPreviewQueue(2);
  let active = 0;
  let peak = 0;
  const jobs = Array.from({ length: 8 }, (_, i) => queue(async () => {
    active++; peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 1));
    active--;
    if (i === 2) throw new Error("failed field");
    return i;
  }));
  const results = await Promise.allSettled(jobs);
  expect(peak).toBe(2);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(7);
});

test.each([[2, 2, 6], [3, 2, 12], [4, 5, 24], [6, 7, 48], [8, 10, 96], [16, 2, 384], [32, 2, 1536]])(
  "cropped %i by %i metadata uses the enclosing %i-well plate", (rows, columns, size) => {
    const plate = plateGeometry({ name: "subset", rows: Array.from({length: rows}, (_, i) => String(i)), columns: Array.from({length: columns}, (_, i) => String(i+1)), wells: [], acquisitions: [], initial_path: "" });
    expect(plate.rows.length * plate.columns.length).toBe(size);
  },
);

test("sparse named rows retain physical well coordinates", () => {
  const plate = plateGeometry({ name: "subset", rows: ["B", "P"], columns: ["1", "2"], wells: [{path: "P/2", row_index: 1, column_index: 1, fields: []}], acquisitions: [], initial_path: "" });
  expect(plate.rows).toHaveLength(16);
  expect(plate.columns).toHaveLength(24);
  expect(plate.wells[0]).toMatchObject({row_index: 15, column_index: 1});
});

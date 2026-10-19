import { loadPreviewPyramid } from "./preview-source";

test("previews open only native metadata and the requested pyramid array", async () => {
  const files = new Map<string, Uint8Array>();
  const put = (path: string, value: unknown) => files.set(path, new TextEncoder().encode(JSON.stringify(value)));
  put("/.zgroup", {zarr_format: 2});
  put("/.zattrs", {multiscales: [{axes: [{name: "c"}, {name: "y"}, {name: "x"}], datasets: [0, 1, 2].map(level => ({path: String(level), coordinateTransformations: [{type: "scale", scale: [1, 2 ** level, 2 ** level]}]}))}]});
  for (const level of [0, 1, 2]) {
    const side = 8 / 2 ** level;
    put(`/${level}/.zarray`, {zarr_format: 2, shape: [1, side, side], chunks: [1, side, side], dtype: "<u2", compressor: null, filters: null, order: "C", fill_value: 0});
    files.set(`/${level}/0.0.0`, new Uint8Array(new Uint16Array(side * side).fill(123).buffer));
  }
  const get = vi.fn(async (key: string) => files.get(key));
  const pyramid = await loadPreviewPyramid({get});
  expect(pyramid.map(source => source.shape)).toEqual([[1, 8, 8], [1, 4, 4], [1, 2, 2]]);
  expect(get.mock.calls.some(([key]) => key.includes("/1/") || key.includes("/2/"))).toBe(false);
  const raster = await pyramid[2].getRaster({selection: {c: 0}});
  expect(raster.width).toBe(2);
  expect([...raster.data]).toEqual([123, 123, 123, 123]);
  expect(get.mock.calls.some(([key]) => key.includes("/1/"))).toBe(false);
});

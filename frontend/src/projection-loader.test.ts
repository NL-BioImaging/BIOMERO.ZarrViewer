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

test("projection cache has a shared 64 MiB LRU budget across sources and separates C/T/modes",async()=>{
  // Each result is 24 MiB; three sources exceed the single shared budget.
  const getVolume=vi.fn(async()=>({data:new Uint8Array(24*1024*1024),width:24*1024,height:1024,depth:1}));
  const make=()=>projectSource({labels:["c","z","y","x"],shape:[2,1,1024,24*1024],dtype:"Uint8",getVolume},"mip");
  const a=make(),b=make(),c=make();
  await a.getRaster({selection:{c:0,t:0}});await b.getRaster({selection:{c:0,t:0}});
  await a.getRaster({selection:{c:0,t:0}});expect(getVolume).toHaveBeenCalledTimes(2);
  await c.getRaster({selection:{c:0,t:0}}); // B is least recently used.
  await a.getRaster({selection:{c:0,t:0}});expect(getVolume).toHaveBeenCalledTimes(3);
  await b.getRaster({selection:{c:0,t:0}});expect(getVolume).toHaveBeenCalledTimes(4);
  await b.getRaster({selection:{c:1,t:0}});await b.getRaster({selection:{c:1,t:1}});expect(getVolume).toHaveBeenCalledTimes(6);
},15000);

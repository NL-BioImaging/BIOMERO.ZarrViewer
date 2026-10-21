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

test("uncached HTTP raster and navigator share one exact projection with intermediate progress",async()=>{
  const input=source(),progress=vi.fn();
  const [projected]=projectLoader([input],"mip",progress);
  const [main,navigator]=await Promise.all([
    projected.getRaster({selection:{c:0,t:0}}),
    projected.getTile({x:0,y:0,selection:{c:0,t:0}}),
  ]);
  expect(Array.from(main.data)).toEqual([3,30]);
  expect(Array.from(navigator.data)).toEqual([3,30]);
  expect(input.getRaster).toHaveBeenCalledTimes(3);
  expect(input.getTile).not.toHaveBeenCalled();
  expect(progress.mock.calls.some(([p])=>p.busy&&p.fraction>0&&p.fraction<1)).toBe(true);
  expect(progress.mock.lastCall?.[0]).toMatchObject({busy:false,fraction:1});
});

test("failed projections clear progress and can be retried",async()=>{
  const input=source(),progress=vi.fn();
  input.getRaster.mockRejectedValueOnce(new Error("read failed"));
  const projected=projectSource(input,"mip",progress);
  await expect(projected.getRaster({selection:{c:0}})).rejects.toThrow("read failed");
  expect(progress.mock.lastCall?.[0].busy).toBe(false);
  expect(Array.from((await projected.getRaster({selection:{c:0}})).data)).toEqual([3,30]);
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

test('min/max preserve uint32 extremes and input buffers; means still accumulate without integer overflow',async()=>{
  const planes=[new Uint32Array([4294967295,2]),new Uint32Array([1,4294967293])];
  const source={labels:['z','y','x'],shape:[2,1,2],dtype:'Uint32',getRaster:async({selection}:any)=>({data:planes[selection.z],width:2,height:1})};
  const mip=await projectSource(source,'mip').getRaster({selection:{}});
  expect(mip.data).toBeInstanceOf(Uint32Array);expect(Array.from(mip.data)).toEqual([4294967295,4294967293]);
  expect(Array.from((await projectSource(source,'min').getRaster({selection:{}})).data)).toEqual([1,2]);
  expect(Array.from((await projectSource(source,'mean').getRaster({selection:{}})).data)).toEqual([2147483648,2147483647]);
  expect(Array.from(planes[0])).toEqual([4294967295,2]);
});

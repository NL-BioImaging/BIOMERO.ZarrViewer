import { extractSection, sectionFitZoom, sectionSource, vivVolumePanels } from "./viv-slices";

const shape = [3,2,4];
const volume = Uint16Array.from({length:24}, (_, i) => Math.floor(i/6)*100 + Math.floor(i%6/3)*10 + i%3);

test("all planes expose identical voxels at their common intersection without transposing or cropping", () => {
  const xy = extractSection(volume,shape,"xy",2), xz = extractSection(volume,shape,"xz",1), yz = extractSection(volume,shape,"yz",1);
  expect([...xy.data]).toEqual([200,201,202,210,211,212]);
  expect([...xz.data]).toEqual([10,11,12,110,111,112,210,211,212,310,311,312]);
  expect([...yz.data]).toEqual([1,11,101,111,201,211,301,311]);
  expect(xy.data[xy.width+1]).toBe(211);
  expect(xz.data[2*xz.width+1]).toBe(211);
  expect(yz.data[2*yz.width+1]).toBe(211);
});

test("section loaders select one channel/time and reuse cached planes", async () => {
  const getVolume = vi.fn(async () => ({data:volume}));
  const source = {labels:["t","c","z","y","x"],shape:[10,3,4,2,3],dtype:"Uint16",getVolume};
  const section = sectionSource(source,"yz",1,7);
  expect(section.shape).toEqual([3,4,2]);
  const first = await section.getRaster({selection:{c:2}});
  expect(await section.getRaster({selection:{c:2}})).toBe(first);
  expect(getVolume).toHaveBeenCalledExactlyOnceWith({c:2,t:7},{signal:expect.any(AbortSignal)});
  expect([...first.data]).toEqual([1,11,101,111,201,211,301,311]);
});

test("the raster fallback produces the same sections as cached volumes", async () => {
  const source = {labels:["c","z","y","x"],shape:[1,4,2,3],dtype:"Uint16",
    getRaster:vi.fn(async ({selection}: any) => ({data:volume.subarray(selection.z*6,(selection.z+1)*6),width:3,height:2}))};
  for (const plane of ["xy","xz","yz"] as const) {
    const index = plane === "xy" ? 2 : 1;
    const actual = await sectionSource(source,plane,index,0).getRaster({selection:{c:0}});
    expect([...actual.data]).toEqual([...extractSection(volume,shape,plane,index).data]);
  }
});

test("anisotropic sections fit every edge at the same physical zoom", () => {
  const panels = vivVolumePanels("orthogonal","xy",1000,700);
  const extent = [100,200,600];
  const zoom = sectionFitZoom(panels,extent), pixelsPerUnit = 2 ** zoom;
  for (const [width,height] of [[100,200],[100,600],[200,600]]) {
    expect(width*pixelsPerUnit).toBeLessThanOrEqual(500*.85);
    expect(height*pixelsPerUnit).toBeLessThanOrEqual(350*.85+1e-9);
  }
});

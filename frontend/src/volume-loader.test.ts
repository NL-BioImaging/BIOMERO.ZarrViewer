import { withVolumeCache } from "./volume-loader";
import { projectSource } from "./projection-loader";

test("one packed download serves slices and all projection modes", async () => {
  const values = new Uint16Array([1,10,2,20,3,30]);
  const fetch = vi.fn(async (url: string) => url.includes("download=1")
    ? new Response(values.buffer.slice(0))
    : new Response(JSON.stringify({status:"ready",key:"job",shape:[3,1,2],dtype:"<u2",bytes:12})));
  const auth = {volumeUrl:"/volume/",volumeIdentity:"one",fetch} as any;
  const raw = {labels:["c","z","y","x"],shape:[1,3,1,2],dtype:"Uint16",tileSize:2,getRaster:vi.fn()};
  const progress=vi.fn();
  const [source]=withVolumeCache([raw],auth,".",progress);
  await Promise.all([source.getVolume({c:0}),source.getVolume({c:0})]);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(Array.from((await source.getRaster({selection:{c:0,z:1}})).data)).toEqual([2,20]);
  for (const [mode,expected] of [["mip",[3,30]],["mean",[2,20]],["min",[1,10]]] as const) {
    const projected=projectSource(source,mode);
    const raster=await projected.getRaster({selection:{c:0}});
    const tile=await projected.getTile({x:0,y:0,selection:{c:0}});
    expect(Array.from(raster.data)).toEqual(expected);
    expect(Array.from(tile.data)).toEqual(expected);
  }
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(raw.getRaster).not.toHaveBeenCalled();
  expect(progress).toHaveBeenLastCalledWith(expect.objectContaining({busy:false,fraction:1}));
});

test("changed source binding does not reuse the old in-memory volume", async () => {
  const auth={volumeUrl:"/volume/",volumeIdentity:"one",fetch:vi.fn(async (url:string) => url.includes('download=1') ? new Response(new Uint16Array(8).buffer) : new Response(JSON.stringify({status:'ready',key:'job',shape:[2,2,2],dtype:'<u2',bytes:16})))};
  const raw={labels:['z','y','x'],shape:[2,2,2],dtype:'Uint16'};
  const [source]=withVolumeCache([raw],auth as any,'.',()=>{});
  await source.getVolume({});auth.volumeIdentity='two';await source.getVolume({});
  expect(auth.fetch).toHaveBeenCalledTimes(4);
});

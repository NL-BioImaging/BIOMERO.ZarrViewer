import { withVolumeCache } from "./volume-loader";
import { projectSource } from "./projection-loader";

test("3D and projections request only the selected time and reuse it without prefetching neighbours", async () => {
  const auth={volumeUrl:"/volume/",volumeIdentity:"temporal",fetch:vi.fn(async (url:string) => url.includes('download=1') ? new Response(new Uint16Array(8).buffer) : new Response(JSON.stringify({status:'ready',key:'job',shape:[2,2,2],dtype:'<u2',bytes:16})))};
  const [source]=withVolumeCache([{labels:['t','c','z','y','x'],shape:[40,3,2,2,2],dtype:'Uint16'}],auth as any,'.',()=>{});
  await source.getVolume({c:1,t:17});
  await projectSource(source,'mip').getRaster({selection:{c:1,t:17}});
  await projectSource(source,'mean').getRaster({selection:{c:1,t:18}});
  const prepares=auth.fetch.mock.calls.map(([url])=>new URL(url,'http://localhost')).filter(url=>!url.searchParams.has('job'));
  expect(prepares.map(url=>[url.searchParams.get('c'),url.searchParams.get('t')])).toEqual([['1','17'],['1','18']]);
});

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

test("an aborted download cannot remove its immediate replacement; failed jobs retry only explicitly",async()=>{
  let first=true;
  const fetch=vi.fn((url:string,{signal}:any)=>{
    if(first){first=false;return new Promise<Response>((_,reject)=>signal.addEventListener("abort",()=>reject(signal.reason)));}
    return Promise.resolve(url.includes("download=1")?new Response(new Uint16Array(8).buffer):new Response(JSON.stringify({status:"ready",key:"replacement",shape:[2,2,2],dtype:"<u2",bytes:16})));
  });
  const [source]=withVolumeCache([{labels:["z","y","x"],shape:[2,2,2],dtype:"Uint16"}],{volumeUrl:"/volume/",volumeIdentity:"cancel",fetch} as any,".",()=>{});
  const controller=new AbortController(),firstLoad=source.getVolume({},{signal:controller.signal});
  await Promise.resolve();controller.abort();
  const replacement=source.getVolume({},{retryFailed:true});
  await expect(firstLoad).rejects.toMatchObject({name:"AbortError"});
  expect((await replacement).data).toHaveLength(8);
  await source.getVolume({});expect(fetch).toHaveBeenCalledTimes(3);
  expect(fetch.mock.calls[1][0]).toContain("retryFailed=1");
});

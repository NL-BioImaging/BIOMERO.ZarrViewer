import { DecodedReadCache,withImageReadCache } from './http-read-cache';

test('decoded reads share in-flight work, respect cancellation, expire and isolate bindings',async()=>{
  let now=0;const cache=new DecodedReadCache(16,()=>now),abort=new AbortController();
  let release!:()=>void;
  const read=vi.fn(async()=>{await new Promise<void>(resolve=>release=resolve);return {data:new Uint8Array([1,2,3])};});
  const a=cache.read('image-a','tile',read,abort.signal),b=cache.read('image-a','tile',read);
  const rejected=expect(a).rejects.toMatchObject({name:'AbortError'});
  await Promise.resolve();abort.abort();release();await rejected;expect((await b).data).toEqual(new Uint8Array([1,2,3]));
  await cache.read('image-a','tile',read);expect(read).toHaveBeenCalledOnce();
  const fresh=vi.fn(async()=>({data:new Uint8Array([4])}));
  now=60001;await cache.read('image-a','tile',fresh);await cache.read('image-b','tile',fresh);expect(fresh).toHaveBeenCalledTimes(2);
});

test('LRU and errors cannot retain more decoded bytes or poison retries',async()=>{
  const cache=new DecodedReadCache(4),a=vi.fn(async()=>({data:new Uint8Array(4)}));
  await cache.read('a','1',a);await cache.read('a','2',a);await cache.read('a','1',a);expect(a).toHaveBeenCalledTimes(3);
  await expect(cache.read('a','bad',async()=>{throw Error('bad');})).rejects.toThrow('bad');
  expect((await cache.read('a','bad',async()=>({data:new Uint8Array([3])}))).data[0]).toBe(3);
});

test('HTTP complete stacks read all Z together, keep C/T and exclude unsafe or physical sources',async()=>{
  const auth={isHttp:true,readIdentity:'one'} as any;
  const chunk=vi.fn(async(_coords?:number[])=>({data:new Uint8Array([1,2,3,4])}));
  const source={_data:{getChunk:chunk},labels:['t','c','z','y','x'],shape:[2,2,2,1,2],dtype:'Uint8',tileSize:2,
    getRaster:vi.fn(async({selection}:any)=>{expect(selection).toEqual({c:1,t:1,z:null});return {data:new Uint8Array([1,2,3,4])};})};
  const [wrapped]=withImageReadCache([source],auth);
  const volume=await wrapped.getVolume({c:1,t:1});expect(volume).toMatchObject({width:2,height:1,depth:2});
  await wrapped.getVolume({c:1,t:1});expect(source.getRaster).toHaveBeenCalledOnce();
  expect(Array.from((await wrapped.getRaster({selection:{c:1,t:1,z:1}})).data)).toEqual([3,4]);expect(source.getRaster).toHaveBeenCalledOnce();
  expect(Array.from((await wrapped.getRaster({selection:{c:1,t:1,z:null}})).data)).toEqual([1,2,3,4]);expect(source.getRaster).toHaveBeenCalledTimes(2);
  await source._data.getChunk([0,0,0]);await source._data.getChunk([0,0,0]);expect(chunk).toHaveBeenCalledOnce();
  const physical=[source];expect(withImageReadCache(physical,{isHttp:false} as any)).toBe(physical);
  const huge={...source,_data:{getChunk:chunk},shape:[1,2,100,4096,4096]};
  expect(withImageReadCache([huge],auth)[0].getVolume).toBeUndefined();
});

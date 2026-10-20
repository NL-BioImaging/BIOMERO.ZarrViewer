import {VirtualChunkCache} from './virtual-chunk-cache';
import {AuthenticatedZarrStore} from './authenticated-store';

test('cancelling one chunk consumer leaves another reader and its cached bytes intact',async()=>{
  const cache=new VirtualChunkCache(),controller=new AbortController();
  let finish!:(response:Response)=>void;
  const load=vi.fn(()=>new Promise<Response>(resolve=>{finish=resolve;}));
  const first=cache.fetch(new Request('https://example.test/chunk',{signal:controller.signal}),load);
  const rejected=expect(first).rejects.toMatchObject({name:'AbortError'});
  const second=cache.fetch(new Request('https://example.test/chunk'),load);
  await vi.waitFor(()=>expect(load).toHaveBeenCalledOnce());
  controller.abort();await rejected;
  finish(new Response(new Uint8Array([7,8,9])));
  expect(new Uint8Array(await (await second).arrayBuffer())).toEqual(new Uint8Array([7,8,9]));
  await cache.fetch(new Request('https://example.test/chunk'),load);
  expect(load).toHaveBeenCalledOnce();
});

test('byte cache has a shared budget and never retains failed responses',async()=>{
  const cache=new VirtualChunkCache(4),load=vi.fn(async()=>new Response(new Uint8Array([1,2,3])));
  const request=(key:string)=>new Request(`https://example.test/${key}`);
  await cache.fetch(request('a'),load);await cache.fetch(request('b'),load);await cache.fetch(request('a'),load);
  expect(load).toHaveBeenCalledTimes(3);
  const denied=vi.fn(async()=>new Response('denied',{status:403}));
  await cache.fetch(request('no'),denied);await cache.fetch(request('no'),denied);
  expect(denied).toHaveBeenCalledTimes(2);
});

test('only virtual numeric chunks are shared; metadata and physical stores stay fresh',async()=>{
  const cap:any={image:{id:1},store:{transport:'http',url:'/data/',context:'signed',binding_digest:'a'}};
  const fetchMock=vi.fn(async()=>new Response(new Uint8Array([1,2,3])));
  vi.stubGlobal('fetch',fetchMock);
  try{
    const auth=new AuthenticatedZarrStore(cap,async()=>cap);
    const [a,b]=await Promise.all([auth.store.get('/0/0/0'),auth.store.get('/0/0/0')]);
    expect(fetchMock).toHaveBeenCalledTimes(1);expect(a).toEqual(b);
    await auth.store.get('/.zattrs');await auth.store.get('/.zattrs');expect(fetchMock).toHaveBeenCalledTimes(3);
    auth.update({...cap,store:{...cap.store,binding_digest:'b'}});
    await auth.store.get('/0/0/0');expect(fetchMock).toHaveBeenCalledTimes(4);
    const physical=new AuthenticatedZarrStore({...cap,store:{...cap.store,transport:'filesystem'}},async()=>cap);
    await physical.store.get('/0/0/0');await physical.store.get('/0/0/0');expect(fetchMock).toHaveBeenCalledTimes(6);
  }finally{vi.unstubAllGlobals();}
});

import {StoreReadGate} from './store-read-gate';
import {PrefixStore} from './authenticated-store';

test('encoded reads hold permits until bodies finish, skipping aborted queued work',async()=>{
  const gate=new StoreReadGate(1);let finish!:()=>void;
  const stream=new ReadableStream({start(controller){finish=()=>{controller.enqueue(new Uint8Array([1]));controller.close();};}});
  const load=vi.fn(async()=>new Response(stream));
  const a=gate.fetch(new Request('https://example.test/a'),load);
  await vi.waitFor(()=>expect(load).toHaveBeenCalledOnce());
  const abort=new AbortController(),cancelled=vi.fn(async()=>new Response('bad'));
  const b=gate.fetch(new Request('https://example.test/b',{signal:abort.signal}),cancelled);
  const rejected=expect(b).rejects.toMatchObject({name:'AbortError'});
  const next=vi.fn(async()=>new Response('ok'));
  const c=gate.fetch(new Request('https://example.test/c'),next);
  await Promise.resolve();expect(next).not.toHaveBeenCalled();abort.abort();await rejected;
  finish();await a;expect(await (await c).text()).toBe('ok');expect(cancelled).not.toHaveBeenCalled();
});

test('shared shard index survives tile cancellation but stops with the image lifetime',async()=>{
  const lifetime=new AbortController(),tile=new AbortController();
  const inner={getRange:vi.fn(async(_key:any,_range:any,options:any)=>{await Promise.resolve();options.signal?.throwIfAborted();return new Uint8Array([7]);})};
  const store=new PrefixStore(inner as any,'.',lifetime.signal);
  const index=store.getRange('/shard',{suffixLength:32},{signal:tile.signal});tile.abort();
  expect(await index).toEqual(new Uint8Array([7]));
  await expect(store.getRange('/shard',{offset:0,length:4},{signal:tile.signal})).rejects.toMatchObject({name:'AbortError'});
  lifetime.abort();await expect(store.getRange('/shard',{suffixLength:32})).rejects.toMatchObject({name:'AbortError'});
});

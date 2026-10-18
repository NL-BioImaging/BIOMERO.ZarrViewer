import { SharedRequest, abortableDelay } from "./shared-request";

test("cancelling one consumer preserves a shared download; cancelling the last stops it", async()=>{
  let underlying!:AbortSignal, resolve!:(value:number)=>void;
  const task=new SharedRequest<number>(signal=>{underlying=signal;return new Promise(r=>{resolve=r;});});
  const first=new AbortController(), second=new AbortController();
  const a=task.consume(first.signal), b=task.consume(second.signal);
  await Promise.resolve();first.abort();
  await expect(a).rejects.toMatchObject({name:"AbortError"});
  expect(underlying.aborted).toBe(false);
  resolve(42);await expect(b).resolves.toBe(42);
  expect(underlying.aborted).toBe(false);
  const next=new SharedRequest<number>(signal=>new Promise((_,reject)=>signal.addEventListener("abort",()=>reject(signal.reason))));
  const controller=new AbortController(), pending=next.consume(controller.signal);
  await Promise.resolve();controller.abort();
  await expect(pending).rejects.toMatchObject({name:"AbortError"});
  expect(next.controller.signal.aborted).toBe(true);
});

test("polling delay stops immediately on cancellation",async()=>{
  vi.useFakeTimers();
  try {const controller=new AbortController(), pending=abortableDelay(300,controller.signal);controller.abort();await expect(pending).rejects.toMatchObject({name:"AbortError"});expect(vi.getTimerCount()).toBe(0);}
  finally {vi.useRealTimers();}
});

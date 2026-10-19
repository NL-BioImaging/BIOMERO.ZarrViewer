import { captureNeuroglancer, waitForVolumeFrame } from './volume-movie';

test('volume frame waits are cancellable and never advance before rendering',async()=>{
  vi.useFakeTimers();
  try{
    let ready=false,finished=false;const abort=new AbortController();
    const waiting=waitForVolumeFrame(()=>ready,abort.signal).then(()=>{finished=true;});
    await vi.advanceTimersByTimeAsync(150);expect(finished).toBe(false);
    ready=true;await vi.advanceTimersByTimeAsync(50);await waiting;expect(finished).toBe(true);
    const stopped=new AbortController(),promise=waitForVolumeFrame(()=>false,stopped.signal);const failure=expect(promise).rejects.toMatchObject({name:'AbortError'});
    stopped.abort();await failure;
    const timed=waitForVolumeFrame(()=>false,new AbortController().signal,100);const timeout=expect(timed).rejects.toThrow('did not finish');
    await vi.advanceTimersByTimeAsync(150);await timeout;
  }finally{vi.useRealTimers();}
});

test('3D capture accepts only the requested same-origin renderer frame',async()=>{
  const frame=document.createElement('iframe');document.body.append(frame);
  const posted=vi.spyOn(frame.contentWindow!,'postMessage');
  const controller=new AbortController();const result=captureNeuroglancer(frame,controller.signal);
  const request=posted.mock.calls[0][0];
  const pixels=new Uint8ClampedArray([20,30,40,255]);
  const original=globalThis.ImageData;
  vi.stubGlobal('ImageData',class{constructor(public data:Uint8ClampedArray,public width:number,public height:number){}});
  const message={type:'biomero-ng-capture',id:request.id,width:1,height:1,data:pixels.buffer};
  window.dispatchEvent(new MessageEvent('message',{source:frame.contentWindow,origin:'https://unrelated.test',data:message}));
  let done=false;void result.then(()=>{done=true;});await Promise.resolve();expect(done).toBe(false);
  window.dispatchEvent(new MessageEvent('message',{source:frame.contentWindow,origin:location.origin,data:message}));
  expect((await result).data).toEqual(pixels);
  vi.stubGlobal('ImageData',original);frame.remove();
});

test('an abandoned renderer capture stops immediately',async()=>{
  const frame=document.createElement('iframe');document.body.append(frame);
  const controller=new AbortController(),capture=captureNeuroglancer(frame,controller.signal);
  controller.abort();await expect(capture).rejects.toMatchObject({name:'AbortError'});frame.remove();
});

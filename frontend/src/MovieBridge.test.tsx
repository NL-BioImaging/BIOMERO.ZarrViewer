import { render, waitFor } from '@testing-library/react';
import { MovieBridge } from './MovieBridge';
import { exportMovie } from './movie-renderer';
vi.mock('./movie-renderer',()=>({exportMovie:vi.fn()}));
vi.mock('./api',()=>({selectedImageId:()=>14153}));

afterEach(()=>{ delete (window as any).opener; vi.restoreAllMocks(); });

it('returns a popup export only to the verified opener and nonce',async()=>{
  history.replaceState({},'', '/?image=14153&nonce=test-export');
  const host={postMessage:vi.fn()}; Object.defineProperty(window,'opener',{configurable:true,value:host});
  const result={data:new ArrayBuffer(4),poster:new ArrayBuffer(2),provenance:{frameCount:2}};
  vi.mocked(exportMovie).mockResolvedValue(result);
  const view=render(<MovieBridge/>);
  expect(host.postMessage).toHaveBeenCalledWith({source:'zarr-movie',nonce:'test-export',type:'ready',value:undefined},location.origin,[]);
  const data={source:'analysis-movie',nonce:'test-export',type:'render',recipe:{sequence:{start:0,end:1}}};
  window.dispatchEvent(new MessageEvent('message',{source:window,origin:location.origin,data}));
  window.dispatchEvent(new MessageEvent('message',{source:host as any,origin:'https://wrong.example',data}));
  window.dispatchEvent(new MessageEvent('message',{source:host as any,origin:location.origin,data:{...data,nonce:'wrong'}}));
  expect(exportMovie).not.toHaveBeenCalled();
  window.dispatchEvent(new MessageEvent('message',{source:host as any,origin:location.origin,data}));
  await waitFor(()=>expect(host.postMessage).toHaveBeenCalledWith({source:'zarr-movie',nonce:'test-export',type:'complete',value:result},location.origin,[result.data,result.poster]));
  expect(exportMovie).toHaveBeenCalledTimes(1); view.unmount();
});

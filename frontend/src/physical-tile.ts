import type {AuthenticatedZarrStore} from './authenticated-store';
import {StoreReadGate} from './store-read-gate';
const gates=new WeakMap<AuthenticatedZarrStore,StoreReadGate>();
const types:Record<string,any>={Uint8:Uint8Array,Int8:Int8Array,Uint16:Uint16Array,Int16:Int16Array,Uint32:Uint32Array,Int32:Int32Array,Float32:Float32Array,Float64:Float64Array};
export async function physicalTile(auth:AuthenticatedZarrStore,source:any,field:string,options:any,signal:AbortSignal){
  const array=[field==='.'?'':field,source._data.path.replace(/^\//,'')].filter(Boolean).join('/');
  const query=new URLSearchParams({array,axes:source.labels.join(','),size:String(source.tileSize),x:String(options.x),y:String(options.y),c:String(options.selection?.c||0),z:String(options.selection?.z||0),t:String(options.selection?.t||0)});
  const url=new URL(auth.rasterUrl!,window.location.href);url.search=query.toString();
  let gate=gates.get(auth);if(!gate){gate=new StoreReadGate(4);gates.set(auth,gate);}
  const response=await gate.fetch(new Request(url,{signal,cache:'no-store'}),()=>auth.fetch(url.href,{signal}));
  if(!response.ok)throw Error((await response.json().catch(()=>({}))).error?.message||`Pixel tile failed (${response.status})`);
  const Type=types[source.dtype];
  const width=Number(response.headers.get('X-Zarr-Width')),height=Number(response.headers.get('X-Zarr-Height'));
  const data=new Type(await response.arrayBuffer());
  if(!width||!height||data.length!==width*height)throw Error('Invalid pixel tile shape');
  return {data,width,height};
}

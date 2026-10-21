import type { AuthenticatedZarrStore } from './authenticated-store';
const types:Record<string,any>={u1:Uint8Array,i1:Int8Array,u2:Uint16Array,i2:Int16Array,u4:Uint32Array,i4:Int32Array,f4:Float32Array,f8:Float64Array};
export async function nativeSamples(auth:AuthenticatedZarrStore,channels:number[],t:number,tile:number,signal?:AbortSignal):Promise<Map<number,Float64Array>>{
  const query=new URLSearchParams({channels:JSON.stringify(channels),t:String(t),tile_size:String(tile)});
  const response=await auth.fetch(`${auth.nativeSamplesUrl}?${query}`,{signal});
  if(!response.ok)throw Error(`Native samples failed (${response.status})`);
  const buffer=await response.arrayBuffer();signal?.throwIfAborted();
  if(buffer.byteLength<4||buffer.byteLength>9*1024*1024)throw Error('Invalid native sample response size');
  const length=new DataView(buffer).getUint32(0,true);
  if(length>4096||length+4>buffer.byteLength)throw Error('Invalid native sample header');
  const header=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,4,length)));
  const Type=types[String(header.dtype).replace(/[<>=|]/g,'')];
  if(!Type||!Array.isArray(header.channels)||header.channels.length!==channels.length)throw Error('Invalid native sample description');
  const bytes=buffer.slice(4+length);
  if(bytes.byteLength%Type.BYTES_PER_ELEMENT)throw Error('Invalid native sample pixels');
  const values=new Type(bytes),result=new Map<number,Float64Array>();let offset=0;
  for(const [i,item] of header.channels.entries()){
    if(item.index!==channels[i]||!Number.isInteger(item.count)||item.count<0||item.count>262144||offset+item.count>values.length)throw Error('Invalid native sample channel');
    result.set(item.index,Float64Array.from(values.subarray(offset,offset+item.count)));offset+=item.count;
  }
  if(offset!==values.length)throw Error('Unexpected trailing native sample pixels');
  return result;
}

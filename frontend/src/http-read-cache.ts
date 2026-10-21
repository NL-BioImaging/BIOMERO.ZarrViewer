import { SharedRequest } from './shared-request';
import type { AuthenticatedZarrStore } from './authenticated-store';
import { dtypeBytes } from './volume-utils';
import {physicalTile} from './physical-tile';
import { nativeSamples } from './native-samples';

export const HTTP_DECODED_BUDGET = 64*1024*1024;
const TTL=60_000;
interface Entry {task:SharedRequest<any>;bytes:number;created:number;value?:any}
/** Private to one authenticated viewer; never a cross-image or cross-user cache. */
export class DecodedReadCache {
  private entries=new Map<string,Entry>();
  private identity='';
  constructor(private budget=HTTP_DECODED_BUDGET,private now=()=>Date.now()){}
  peek(identity:string,key:string):any {
    const entry=identity===this.identity?this.entries.get(key):undefined;
    return entry&&!entry.task.controller.signal.aborted&&this.now()-entry.created<=TTL?entry.value:undefined;
  }
  read(identity:string,key:string,load:(signal:AbortSignal)=>Promise<any>,signal?:AbortSignal):Promise<any>{
    signal?.throwIfAborted();
    if(identity!==this.identity){this.entries.clear();this.identity=identity;}
    let entry=this.entries.get(key);
    if(entry&&(entry.task.controller.signal.aborted||this.now()-entry.created>TTL)){this.entries.delete(key);entry=undefined;}
    if(!entry){
      const next:Entry={task:null as unknown as SharedRequest<any>,bytes:0,created:this.now()};
      next.task=new SharedRequest(async taskSignal=>{
        try{
          const value=await load(taskSignal);taskSignal.throwIfAborted();
          if(this.entries.get(key)===next){
            next.bytes=Number(value.data?.byteLength)||0;next.created=this.now();
            next.value=value;
            if(!next.bytes||next.bytes>this.budget)this.entries.delete(key);
            let total=[...this.entries.values()].reduce((sum,item)=>sum+item.bytes,0);
            for(const [oldKey,old] of this.entries){if(total<=this.budget)break;if(old.bytes){this.entries.delete(oldKey);total-=old.bytes;}}
          }
          return value;
        }catch(error){if(this.entries.get(key)===next)this.entries.delete(key);throw error;}
      });
      entry=next;this.entries.set(key,entry);
    }
    this.entries.delete(key);this.entries.set(key,entry);
    return entry.task.consume(signal);
  }
}

const caches=new WeakMap<AuthenticatedZarrStore,DecodedReadCache>();
const wrapped=new WeakSet<object>();
let serial=0;
/** Coalesce decoded intensity chunks for both routes. HTTP alone gains bulk Z
 * reads; physical stores retain their existing quota-managed volume service.
 */
export function withImageReadCache(loader:any[],auth:AuthenticatedZarrStore,field='.'):any[]{
  let cache=caches.get(auth);if(!cache){cache=new DecodedReadCache();caches.set(auth,cache);}
  // Small logical 3D chunks are storage units, not useful screen tiles. Group
  // them into 256px tiles while keeping the original chunks/pixels unchanged.
  const base=loader[0],large=base&&['x','y'].some(axis=>Number(base.shape?.[base.labels?.indexOf(axis)])>=512);
  const retile=!auth.isHttp&&large&&base.tileSize>=16&&base.tileSize<256;
  let accelerated=false;
  const result=loader.map(source=>{
    const array=source._data;
    if(!array?.getChunk)return source;
    if(retile){
      // Contrast sampling must keep its native-sized reads. Enlarging screen
      // tiles must not multiply the bounded sampling download by 64.
      source.statisticsSource=Object.assign(Object.create(Object.getPrototypeOf(source)),source);
      source.tileSize=256;
    }
    const id=++serial;
    if(!wrapped.has(array)){
      const original=array.getChunk.bind(array);
      array.getChunk=(coords:number[],options?:any)=>cache!.read(auth.readIdentity,JSON.stringify([id,'chunk',coords]),
        signal=>original(coords,{...options,signal}),options?.signal);
      wrapped.add(array);
    }
    if(!auth.isHttp){
      if(!retile||!auth.rasterUrl||typeof array.path!=='string'||!source.labels.every((a:string)=>'tczyx'.includes(a))||!/^(Uint(8|16|32)|Int(8|16|32)|Float(32|64))$/.test(source.dtype))return source;
      accelerated=true;
      const read=(target:any,options:any)=>cache!.read(auth.readIdentity,JSON.stringify([id,'plane',target.tileSize,options.x,options.y,options.selection]),signal=>physicalTile(auth,target,field,options,signal),options.signal);
      if(source.statisticsSource)source.statisticsSource.getTile=(options:any)=>read(source.statisticsSource,options);
      return new Proxy(source,{get(target,key,receiver){
        if(key==='getTile')return (options:any)=>read(target,options);
        const value=Reflect.get(target,key,receiver);return typeof value==='function'?value.bind(target):value;
      }});
    }
    const labels:string[]=source.labels;
    const size=(axis:string)=>labels.includes(axis)?source.shape[labels.indexOf(axis)]:1;
    const bytes=size('x')*size('y')*size('z')*size('c')*dtypeBytes(source.dtype);
    const volumeSafe=size('z')>1&&bytes<=HTTP_DECODED_BUDGET&&labels.filter(a=>'zyx'.includes(a)).join('')==='zyx';
    const volumeKey=(selection:any)=>JSON.stringify([id,'volume',selection?.c||0,selection?.t||0]);
    const load=(selection:any,options?:{signal?:AbortSignal})=>cache!.read(auth.readIdentity,
      volumeKey(selection),async signal=>{
        // Use named spatial axes rather than Viv's XY helper: widths of 3/4
        // pixels otherwise look like interleaved RGB/RGBA to that helper.
        const raster=source._getRaw
          ? await source._getRaw(labels.map(axis=>'zyx'.includes(axis)?null:axis==='c'?(selection?.c||0):axis==='t'?(selection?.t||0):0),{storeOptions:{signal}})
          : await source.getRaster({selection:{...selection,z:null},signal});
        signal.throwIfAborted();
        if(raster.data.length!==size('x')*size('y')*size('z'))throw Error('Unexpected HTTP volume shape');
        return {data:raster.data,width:size('x'),height:size('y'),depth:size('z')};
      },options?.signal);
    return new Proxy(source,{get(target,key,receiver){
      if(key==='getVolume'&&volumeSafe)return load;
      if(key==='getRaster'&&volumeSafe)return (options:any)=>{
        options.signal?.throwIfAborted();
        const volume=cache!.peek(auth.readIdentity,volumeKey(options.selection)),z=options.selection?.z===null?NaN:(options.selection?.z??0);
        if(!volume||!Number.isInteger(z)||z<0||z>=volume.depth)return target.getRaster(options);
        const size=volume.width*volume.height;
        return Promise.resolve({data:volume.data.subarray(z*size,(z+1)*size),width:volume.width,height:volume.height});
      };
      if(key==='getNativeSamples'&&auth.nativeSamplesUrl&&source.tileSize>0&&source.tileSize<=1024)return (channels:number[],z:number,t:number,signal?:AbortSignal)=>nativeSamples(auth,channels,t,source.tileSize,signal);
      const value=Reflect.get(target,key,receiver);return typeof value==='function'?value.bind(target):value;
    }});
  });
  return auth.isHttp||accelerated?result:loader;
}

import type { ProjectionMode } from "./types";
import type { LoadProgress } from "./volume-loader";
import { SharedRequest } from "./shared-request";
export const PROJECTION_CACHE_BYTES = 64 * 1024 * 1024;
interface PixelRaster { data: any; width: number; height: number }
interface Entry {
  task: SharedRequest<PixelRaster>; bytes: number; done: number; total: number;
  listeners: Set<(done:number,total:number)=>void>;
}
const cachedProjections = new WeakMap<object, Map<string, Entry>>();
const retained = new Map<object,{bytes:number;remove:()=>void}>();
type ProgressSink = (key:object,done:number,total:number)=>void;

function progressSink(mode:ProjectionMode,onProgress?: (value:LoadProgress)=>void):ProgressSink|undefined {
  if (!onProgress) return undefined;
  const values=new Map<object,[number,number]>();
  let previous="";
  return (key,done,total)=>{
    if(!values.has(key)&&[...values.values()].every(([n,d])=>n>=d))values.clear();
    if(total)values.set(key,[done,total]);else values.delete(key);
    let completed=0,count=0;for(const [n,d] of values.values()){completed+=n;count+=d;}
    const fraction=count?completed/count:0,busy=completed<count,signature=`${busy}:${fraction}`;
    if(signature===previous)return;previous=signature;
    onProgress({busy,fraction,
      phase:`Calculating ${mode==="mip"?"maximum":mode==="min"?"minimum":"mean"} projection`});
  };
}

/** One decoded plane and one accumulator; projection pixels stay exact. */
async function project(depth:number,mode:Exclude<ProjectionMode,"slice">,
  load:(z:number)=>Promise<PixelRaster>,signal:AbortSignal,
  step:(done:number,total:number)=>void,yieldForProgress:boolean):Promise<PixelRaster> {
  let first:PixelRaster|undefined,accumulator:Float64Array|undefined;
  for(let z=0;z<depth;z++){
    signal.throwIfAborted();const raster=await load(z);signal.throwIfAborted();
    if(!first){first={...raster,data:new raster.data.constructor(0)};accumulator=Float64Array.from(raster.data);}
    else {
      if(raster.width!==first.width||raster.height!==first.height||raster.data.length!==accumulator!.length)
        throw new Error("Projection slices have inconsistent dimensions");
      for(let i=0;i<accumulator!.length;i++){
        const value=Number(raster.data[i]);
        accumulator![i]=mode==="mip"?Math.max(accumulator![i],value):mode==="min"?Math.min(accumulator![i],value):accumulator![i]+value;
      }
    }
    step(z+1,depth);
    if(yieldForProgress&&z%8===7)await new Promise<void>(resolve=>setTimeout(resolve,0));
  }
  if(!first||!accumulator)throw new Error("The Z projection returned no planes");
  const data=new first.data.constructor(accumulator.length);
  for(let i=0;i<data.length;i++)data[i]=mode==="mean"?accumulator[i]/depth:accumulator[i];
  return {...first,data};
}

function projectedSource(source:any,mode:Exclude<ProjectionMode,"slice">,progress?:ProgressSink):any {
  const labels:string[]=source.labels||[],zIndex=labels.indexOf("z");
  if(zIndex<0)return source;
  const depth=Math.max(1,Number(source.shape[zIndex])||1);
  let cache=cachedProjections.get(source);
  if(!cache){cache=new Map();cachedProjections.set(source,cache);}
  const obtain=(kind:unknown,selection:any,load:(signal:AbortSignal,step:(done:number,total:number)=>void)=>Promise<PixelRaster>,signal?:AbortSignal):Promise<PixelRaster>=>{
    signal?.throwIfAborted();const key=JSON.stringify([mode,kind,selection?.c||0,selection?.t||0]);
    let entry=cache!.get(key);
    if(!entry||entry.task.controller.signal.aborted){
      const next:Entry={bytes:0,done:0,total:depth,listeners:new Set(),task:null as unknown as SharedRequest<PixelRaster>};
      const step=(done:number,total:number)=>{next.done=done;next.total=total;for(const listener of next.listeners)listener(done,total);};
      next.task=new SharedRequest(taskSignal=>load(taskSignal,step).then(raster=>{
        next.bytes=raster.data.byteLength;
        retained.set(next,{bytes:next.bytes,remove:()=>{if(cache!.get(key)===next)cache!.delete(key);}});
        let bytes=[...retained.values()].reduce((n,item)=>n+item.bytes,0);
        for(const [oldKey,old] of retained){if(bytes<=PROJECTION_CACHE_BYTES)break;old.remove();retained.delete(oldKey);bytes-=old.bytes;}
        return raster;
      }).catch(error=>{if(cache!.get(key)===next)cache!.delete(key);step(next.done,0);throw error;}));
      entry=next;cache!.set(key,entry);
    }
    cache!.delete(key);cache!.set(key,entry);
    const held=retained.get(entry);if(held){retained.delete(entry);retained.set(entry,held);}
    const current=entry,listener=(done:number,total:number)=>progress?.(current,done,total);
    current.listeners.add(listener);listener(current.done,current.total);
    return current.task.consume(signal).finally(()=>{
      current.listeners.delete(listener);
      if(!current.listeners.size&&current.task.controller.signal.aborted)progress?.(current,current.done,0);
    });
  };
  const raster=(selection:any,signal?:AbortSignal)=>obtain("raster",selection,async(taskSignal,step)=>{
    if(source.getVolume){
      const volume=await source.getVolume(selection,{signal:taskSignal}),size=volume.width*volume.height;
      return project(volume.depth,mode,async z=>({data:volume.data.subarray(z*size,(z+1)*size),width:volume.width,height:volume.height}),taskSignal,step,!!progress);
    }
    return project(depth,mode,z=>source.getRaster({selection:{...selection,z},signal:taskSignal}),taskSignal,step,!!progress);
  },signal);
  return {
    dtype:source.dtype,labels:labels.filter((_,i)=>i!==zIndex),shape:source.shape.filter((_:number,i:number)=>i!==zIndex),
    tileSize:source.tileSize,meta:source.meta,onTileError:(error:Error)=>source.onTileError?.(error),
    getRaster:({selection,signal}:any)=>raster(selection,signal),
    getTile:async({x,y,selection,signal}:any)=>{
      const width=Number(source.shape[labels.indexOf("x")]),height=Number(source.shape[labels.indexOf("y")]);
      if(!source.getVolume&&!(x===0&&y===0&&width<=source.tileSize&&height<=source.tileSize&&source.getRaster))
        return obtain(["tile",x,y],selection,(taskSignal,step)=>project(depth,mode,z=>source.getTile({x,y,selection:{...selection,z},signal:taskSignal}),taskSignal,step,!!progress),signal);
      const full=await raster(selection,signal);signal?.throwIfAborted();
      const left=x*source.tileSize,top=y*source.tileSize,w=Math.min(source.tileSize,full.width-left),h=Math.min(source.tileSize,full.height-top);
      const data=new full.data.constructor(w*h);
      for(let row=0;row<h;row++)data.set(full.data.subarray((top+row)*full.width+left,(top+row)*full.width+left+w),row*w);
      return {data,width:w,height:h};
    },
  };
}

export function projectSource(source:any,mode:Exclude<ProjectionMode,"slice">,onProgress?:(value:LoadProgress)=>void):any {
  return projectedSource(source,mode,progressSink(mode,onProgress));
}
export function projectLoader(loader:any[],mode:ProjectionMode,onProgress?:(value:LoadProgress)=>void):any[] {
  const progress=progressSink(mode,onProgress);
  return mode==="slice"?loader:loader.map(source=>projectedSource(source,mode,progress));
}

import type { AuthenticatedZarrStore } from "./authenticated-store";

export interface MosaicInfo {
  key: string; status: string; progress: number; error?: string;
  width: number; height: number; factor: number; levels: number; tile_size: number; full_width: number;
}
export interface MosaicOptions {
  width: number; height: number; tiles: {path:string;left:number;top:number}[];
  channels: {index:number;color:string;low:number;high:number}[]; z:number;t:number;
}
type TileEntry = {promise:Promise<string>;resolve:(url:string)=>void;reject:(error:unknown)=>void;url?:string;signal:AbortSignal;key:string;query:string};

export class MosaicClient {
  private tiles = new Map<string,TileEntry>();
  private pending: TileEntry[] = [];
  private active = 0;
  constructor(private auth:AuthenticatedZarrStore) {}

  async prepare(options:MosaicOptions, progress:(value:MosaicInfo)=>void, signal:AbortSignal, rebuild=false):Promise<MosaicInfo> {
    const response = await this.auth.fetch(this.auth.mosaicUrl!, {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...options,rebuild})});
    let result = await response.json();
    if (!response.ok) throw new Error(result.error?.message || "Unable to prepare plate overview");
    if (rebuild) this.clear();
    while (true) {
      if (signal.aborted) throw new DOMException("Mosaic cancelled","AbortError");
      progress(result);
      if (result.status === "ready") return result;
      if (result.status === "error") throw new Error(result.error || "Plate overview could not be built");
      await new Promise(resolve=>window.setTimeout(resolve,750));
      if (signal.aborted) throw new DOMException("Mosaic cancelled","AbortError");
      const update = await this.auth.fetch(`${this.auth.mosaicUrl}?job=${result.key}`);
      result = await update.json();
      if (!update.ok) throw new Error(result.error?.message || "Plate overview unavailable");
    }
  }

  tile(info:MosaicInfo,level:number,x:number,y:number,signal:AbortSignal):Promise<string> {
    const query=new URLSearchParams({job:info.key,level:String(level),x:String(x),y:String(y)}).toString();
    const key=`${this.auth.volumeIdentity}:${query}`;
    const hit=this.tiles.get(key);
    if(hit){hit.signal=signal;this.tiles.delete(key);this.tiles.set(key,hit);return hit.promise;}
    let resolve!:(url:string)=>void,reject!:(error:unknown)=>void;
    const promise=new Promise<string>((a,b)=>{resolve=a;reject=b;});
    const entry={key,query,signal,promise,resolve,reject};
    this.tiles.set(key,entry);this.pending.push(entry);this.flush();
    return promise;
  }

  private flush() {
    while(this.active<6 && this.pending.length){
      const entry=this.pending.shift()!;
      if(entry.signal.aborted){this.tiles.delete(entry.key);entry.reject(new DOMException("Tile cancelled","AbortError"));continue;}
      this.active++;
      void this.load(entry).finally(()=>{this.active--;this.flush();});
    }
  }
  private async load(entry:TileEntry) {
    try{
      const response=await this.auth.fetch(`${this.auth.mosaicUrl}?${entry.query}`);
      if(!response.ok)throw new Error("Mosaic tile unavailable; rebuild the overview if it was evicted");
      entry.url=URL.createObjectURL(await response.blob());entry.resolve(entry.url);
      // At most 128 decoded 512-square tiles (~128 MiB), including zoom history.
      const ready=[...this.tiles.values()].filter(value=>value.url);
      for(const old of ready.slice(0,Math.max(0,ready.length-128))){URL.revokeObjectURL(old.url!);this.tiles.delete(old.key);}
    }catch(error){this.tiles.delete(entry.key);entry.reject(error);}
  }
  clear(){
    for(const entry of this.tiles.values())if(entry.url)URL.revokeObjectURL(entry.url);
    this.tiles.clear();
  }
}

export function mosaicLevel(info:MosaicInfo,zoom:number,dpr=1):number {
  return Math.max(0,Math.min(info.levels-1,Math.floor(Math.log2(info.factor/Math.max(.0001,zoom*dpr)))));
}

export function mosaicVisibleTiles(info:MosaicInfo,level:number,visible:{left:number;top:number;right:number;bottom:number}) {
  const step=info.tile_size*2**level/info.factor;
  const columns=Math.ceil(info.width/(info.tile_size*2**level)),rows=Math.ceil(info.height/(info.tile_size*2**level));
  const result:{x:number;y:number;left:number;top:number;width:number;height:number}[]=[];
  for(let y=Math.max(0,Math.floor(visible.top/step));y<Math.min(rows,Math.ceil(visible.bottom/step));y++)
    for(let x=Math.max(0,Math.floor(visible.left/step));x<Math.min(columns,Math.ceil(visible.right/step));x++)
      result.push({x,y,left:x*step,top:y*step,width:Math.min(step,info.width/info.factor-x*step),height:Math.min(step,info.height/info.factor-y*step)});
  return result;
}

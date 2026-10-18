import type { AuthenticatedZarrStore } from "./authenticated-store";
import type { ChannelState } from "./types";
import { SharedRequest } from "./shared-request";

export interface PreviewImage {field:string;url:string;width:number;height:number;full_width:number;level:number;physical_size_x?:number;physical_unit?:string;error?:string}
interface Entry { key:string;group:string;field:string;options:any;signal:AbortSignal;task:SharedRequest<PreviewImage>;promise:Promise<PreviewImage>;resolve:(image:PreviewImage)=>void;reject:(error:unknown)=>void;bytes:number }
const clients=new WeakMap<AuthenticatedZarrStore, PreviewClient>();
class PreviewClient {
  private entries=new Map<string,Entry>();
  private pending:Entry[]=[];
  private active=0;
  private scheduled=false;
  constructor(private auth:AuthenticatedZarrStore) {}
  request(field:string,size:number,channels:ChannelState[],z:number,t:number,signal:AbortSignal) {
    signal.throwIfAborted();
    const options={size:Math.max(32,Math.min(2048,Math.ceil(size))),z,t,channels:channels.filter(c=>c.visible).map(({index,color,low,high})=>({index,color,low,high}))};
    const group=JSON.stringify(options),key=JSON.stringify([this.auth.volumeIdentity,field,group]);
    const existing=this.entries.get(key);
    if(existing&&!existing.task.controller.signal.aborted){this.entries.delete(key);this.entries.set(key,existing);return existing.task.consume(signal);}
    let resolve!:(image:PreviewImage)=>void,reject!:(error:unknown)=>void;
    const promise=new Promise<PreviewImage>((a,b)=>{resolve=a;reject=b;});
    const entry:Entry={key,group,field,options,signal:new AbortController().signal,promise,resolve,reject,bytes:0,task:null as unknown as SharedRequest<PreviewImage>};
    entry.task=new SharedRequest(taskSignal=>{
      entry.signal=taskSignal;this.pending.push(entry);
      if(!this.scheduled){this.scheduled=true;window.setTimeout(()=>{this.scheduled=false;this.flush();},0);}
      return promise;
    });
    void entry.task.promise.catch(()=>{if(this.entries.get(key)===entry)this.entries.delete(key);});
    this.entries.set(key,entry);
    return entry.task.consume(signal);
  }
  private flush() {
    this.pending=this.pending.filter(entry=>{if(!entry.signal.aborted)return true;if(this.entries.get(entry.key)===entry)this.entries.delete(entry.key);entry.reject(new DOMException("Preview cancelled","AbortError"));return false;});
    while(this.active<3 && this.pending.length){
      const first=this.pending[0], batch:Entry[]=[];
      const limit=first.options.size>=1024?2:first.options.size>=512?4:16;
      this.pending=this.pending.filter(entry=>{if(entry.group===first.group&&batch.length<limit){batch.push(entry);return false;}return true;});
      this.active++;
      void this.fetch(batch).finally(()=>{this.active--;this.flush();});
    }
  }
  private async fetch(batch:Entry[]) {
    const controller=new AbortController();
    const abort=()=>{if(batch.every(entry=>entry.signal.aborted))controller.abort();};
    batch.forEach(entry=>entry.signal.addEventListener("abort",abort));abort();
    try {
      const {size,z,t,channels}=batch[0].options;
      const query=new URLSearchParams({fields:JSON.stringify(batch.map(e=>e.field)),size:String(size),z:String(z),t:String(t),channels:JSON.stringify(channels)});
      const response=await this.auth.fetch(`${this.auth.previewUrl}?${query}`,{signal:controller.signal});
      const body=await response.json();
      if(!response.ok)throw new Error(body.error?.message||"Preview batch failed");
      for(const entry of batch){
        if(entry.signal.aborted){if(this.entries.get(entry.key)===entry)this.entries.delete(entry.key);entry.reject(new DOMException("Preview cancelled","AbortError"));continue;}
        const value=body.previews.find((p:PreviewImage)=>p.field===entry.field);
        if(!value||value.error){if(this.entries.get(entry.key)===entry)this.entries.delete(entry.key);entry.reject(new Error(value?.error||"Preview missing"));continue;}
        entry.bytes=value.url.length*2;entry.resolve(value);
      }
      let bytes=[...this.entries.values()].reduce((n,e)=>n+e.bytes,0);
      for(const [key,entry] of this.entries){if(bytes<=64*1024*1024)break;if(entry.bytes){this.entries.delete(key);bytes-=entry.bytes;}}
    } catch(error){for(const entry of batch){if(this.entries.get(entry.key)===entry)this.entries.delete(entry.key);entry.reject(error);}}
    finally {batch.forEach(entry=>entry.signal.removeEventListener("abort",abort));}
  }
}
export function requestPreview(auth:AuthenticatedZarrStore,field:string,size:number,channels:ChannelState[],z:number,t:number,signal:AbortSignal) {
  let client=clients.get(auth);if(!client){client=new PreviewClient(auth);clients.set(auth,client);}
  return client.request(field,size,channels,z,t,signal);
}

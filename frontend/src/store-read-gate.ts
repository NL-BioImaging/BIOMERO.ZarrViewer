import {abortableDelay} from "./shared-request";
/** Bound encoded Zarr reads through body consumption, not just HTTP headers.
 * API volume downloads deliberately bypass this gate and retain streaming.
 */
export class StoreReadGate {
  private active=0;
  private queue:Array<()=>void>=[];
  constructor(private limit=12){}
  async fetch(request:Request,load:()=>Promise<Response>):Promise<Response>{
    const signal=request.signal;signal.throwIfAborted();
    await new Promise<void>((resolve,reject)=>{
      const start=()=>{signal.removeEventListener('abort',abort);this.active++;resolve();};
      const abort=()=>{this.queue=this.queue.filter(item=>item!==start);reject(signal.reason);};
      if(this.active<this.limit)start();else{this.queue.push(start);signal.addEventListener('abort',abort,{once:true});}
    });
    try{
      signal.throwIfAborted();
      let response!:Response,bytes!:ArrayBuffer;
      for(let attempt=0;;attempt++){
        response=await load();
        if(!response.body)return response;
        try{bytes=await response.arrayBuffer();break;}
        catch(error){
          signal.throwIfAborted();
          if(!(error instanceof TypeError)||attempt>=2)throw error;
          await abortableDelay(100*(attempt+1),signal);
        }
      }
      signal.throwIfAborted();
      const headers=new Headers(response.headers);headers.delete('Content-Encoding');headers.set('Content-Length',String(bytes.byteLength));
      return new Response(bytes,{status:response.status,statusText:response.statusText,headers});
    }finally{this.active--;this.queue.shift()?.();}
  }
}

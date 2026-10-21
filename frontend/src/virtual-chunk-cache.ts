import { SharedRequest } from "./shared-request";

interface Snapshot { bytes: Uint8Array; status: number; headers: Headers }
interface Entry { task: SharedRequest<Snapshot>; bytes: number; created: number }

/** Per-viewer encoded chunks only; never shared across users or image bindings. */
export class VirtualChunkCache {
  private entries = new Map<string, Entry>();
  constructor(private budget = 32 * 1024 * 1024, private ttl = 60_000) {}
  clear(): void { this.entries.clear(); }

  async fetch(request: Request, load: (signal: AbortSignal) => Promise<Response>): Promise<Response> {
    request.signal.throwIfAborted();
    const range=request.headers.get('Range');
    const key = request.url+'\n'+(range||'');
    let entry = this.entries.get(key);
    if (entry && (entry.task.controller.signal.aborted || (entry.bytes > 0 && Date.now()-entry.created > this.ttl))) {
      this.entries.delete(key); entry = undefined;
    }
    if (!entry) {
      const next = {bytes:0,created:Date.now(),task:null as unknown as SharedRequest<Snapshot>};
      next.task = new SharedRequest(async signal => {
        try {
          const response = await load(signal);
          const bytes = new Uint8Array(await response.arrayBuffer());
          const headers = new Headers(response.headers);
          headers.delete("Content-Encoding"); headers.set("Content-Length",String(bytes.length));
          if (this.entries.get(key) === next) {
            next.bytes = bytes.length;
            next.created = Date.now();
            if ((response.status !== 200 && !(range&&response.status===206)) || bytes.length > this.budget || headers.get("Content-Type")?.includes("text/html")) this.entries.delete(key);
            let total = [...this.entries.values()].reduce((n,item)=>n+item.bytes,0);
            for (const [oldKey,old] of this.entries) {
              if (total <= this.budget) break;
              if (old.bytes) {this.entries.delete(oldKey);total-=old.bytes;}
            }
          }
          return {bytes,status:response.status,headers};
        } catch (error) {
          if(this.entries.get(key)===next)this.entries.delete(key);
          throw error;
        }
      });
      entry=next;this.entries.set(key,entry);
    }
    this.entries.delete(key);this.entries.set(key,entry);
    const value = await entry.task.consume(request.signal);
    return new Response(value.bytes.slice(),{status:value.status,headers:value.headers});
  }
}

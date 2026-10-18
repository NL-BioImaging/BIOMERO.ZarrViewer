/** A cancelled consumer must not cancel another view using the same request. */
export class SharedRequest<T> {
  readonly controller = new AbortController();
  readonly promise: Promise<T>;
  private users = 0;
  private settled = false;
  constructor(load:(signal:AbortSignal)=>Promise<T>) {
    this.promise = Promise.resolve().then(()=>load(this.controller.signal)).finally(()=>{this.settled=true;});
    // Consumers own rejection handling, including cancellation before attachment.
    void this.promise.catch(()=>{});
  }
  consume(signal?:AbortSignal):Promise<T> {
    if(signal?.aborted) return Promise.reject(signal.reason || new DOMException("Cancelled","AbortError"));
    this.users++;
    return new Promise<T>((resolve,reject)=>{
      let finished=false;
      const finish=(action:()=>void)=>{
        if(finished)return;finished=true;signal?.removeEventListener("abort",abort);this.users--;
        action();if(!this.users&&!this.settled)this.controller.abort();
      };
      const abort=()=>finish(()=>reject(signal?.reason || new DOMException("Cancelled","AbortError")));
      signal?.addEventListener("abort",abort,{once:true});
      this.promise.then(value=>finish(()=>resolve(value)),error=>finish(()=>reject(error)));
    });
  }
}

export function abortableDelay(ms:number,signal:AbortSignal):Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve,reject)=>{
    const abort=()=>{clearTimeout(timer);reject(signal.reason);};
    const timer=setTimeout(()=>{signal.removeEventListener("abort",abort);resolve();},ms);
    signal.addEventListener("abort",abort,{once:true});
  });
}

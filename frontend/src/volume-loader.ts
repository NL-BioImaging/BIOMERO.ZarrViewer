import type { AuthenticatedZarrStore } from "./authenticated-store";
import { dtypeBytes, VOLUME_RAW_BUDGET_BYTES } from "./volume-utils";

export interface LoadProgress { busy: boolean; fraction: number; phase: string }
export interface CachedVolume { data: any; width: number; height: number; depth: number }
const clients = new WeakMap<AuthenticatedZarrStore, VolumeClient>();

class VolumeClient {
  private entries = new Map<string, { promise: Promise<CachedVolume>; value?: CachedVolume; bytes: number }>();
  private progress = new Map<string, number>();
  private lastUpdate = 0;
  constructor(private auth: AuthenticatedZarrStore, public onProgress: (value: LoadProgress) => void) {}

  key(field: string, level: number, selection: any) {
    return JSON.stringify([this.auth.volumeIdentity, field, level, selection?.c || 0, selection?.t || 0]);
  }
  peek(field: string, level: number, selection: any) { return this.entries.get(this.key(field, level, selection))?.value; }
  private update(key: string, fraction: number, phase: string) {
    this.progress.set(key, fraction);
    if (fraction > 0 && fraction < 1 && Date.now() - this.lastUpdate < 80) return;
    this.lastUpdate = Date.now();
    const values = [...this.progress.values()];
    this.onProgress({ busy: values.some(v => v < 1), fraction: values.reduce((a,b) => a+b,0)/values.length, phase });
  }
  async load(field: string, level: number, selection: any): Promise<CachedVolume> {
    const key = this.key(field, level, selection);
    const existing = this.entries.get(key);
    if (existing) {
      this.entries.delete(key); this.entries.set(key, existing);
      return existing.promise;
    }
    if ([...this.progress.values()].every(v => v >= 1)) this.progress.clear();
    this.update(key, 0, "Preparing volume");
    const entry: { promise: Promise<CachedVolume>; value?: CachedVolume; bytes: number } = { promise: Promise.resolve(null as any), bytes: 0 };
    entry.promise = this.download(field, level, selection, key).then(value => {
      entry.value = value; entry.bytes = value.data.byteLength;
      let total = [...this.entries.values()].reduce((sum,e) => sum + e.bytes,0);
      for (const [oldKey, old] of this.entries) {
        if (total <= VOLUME_RAW_BUDGET_BYTES) break;
        if (oldKey !== key && old.value) { this.entries.delete(oldKey); total -= old.bytes; }
      }
      this.update(key, 1, "Volume ready");
      return value;
    }).catch(error => { this.entries.delete(key); this.update(key, 1, "Volume load failed"); throw error; });
    this.entries.set(key, entry);
    return entry.promise;
  }
  private async checked(url: string) {
    const response = await this.auth.fetch(url);
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `Volume request failed (${response.status})`);
    }
    return response;
  }
  private async download(field: string, level: number, selection: any, key: string): Promise<CachedVolume> {
    const base = this.auth.volumeUrl!;
    const query = new URLSearchParams({ field, level: String(level), c: String(selection?.c || 0), t: String(selection?.t || 0) });
    let result = await (await this.checked(`${base}?${query}`)).json();
    while (result.status === "queued" || result.status === "building") {
      this.update(key, result.progress * .8, "Preparing volume");
      await new Promise(resolve => window.setTimeout(resolve, 300));
      result = await (await this.checked(`${base}?job=${result.key}`)).json();
    }
    if (result.status !== "ready") throw new Error(result.error || "Volume preparation failed");
    const response = await this.checked(`${base}?job=${result.key}&download=1`);
    const bytes = new Uint8Array(result.bytes);
    const reader = response.body?.getReader();
    let offset = 0;
    if (reader) {
      while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        bytes.set(value, offset); offset += value.length;
        this.update(key, .8 + .2 * offset / bytes.length, "Downloading volume");
      }
    } else {
      bytes.set(new Uint8Array(await response.arrayBuffer())); offset = bytes.length;
    }
    if (offset !== bytes.length) throw new Error("Incomplete volume download");
    const types: Record<string, any> = {u1: Uint8Array, i1: Int8Array, u2: Uint16Array, i2: Int16Array, u4: Uint32Array, i4: Int32Array, f4: Float32Array, f8: Float64Array};
    const Type = types[String(result.dtype).replace(/[<>=|]/g, "")];
    if (!Type) throw new Error(`Unsupported cached volume dtype: ${result.dtype}`);
    const [depth, height, width] = result.shape;
    return {data: new Type(bytes.buffer), width, height, depth};
  }
}

export function withVolumeCache(loader: any[], auth: AuthenticatedZarrStore, field: string, onProgress: (progress: LoadProgress) => void): any[] {
  if (!auth.volumeUrl) return loader;
  let client = clients.get(auth);
  if (!client) { client = new VolumeClient(auth, onProgress); clients.set(auth, client); }
  client.onProgress = onProgress;
  return loader.map((source, level) => {
    const labels: string[] = source.labels;
    const extent = (axis: string) => labels.includes(axis) ? Number(source.shape[labels.indexOf(axis)]) : 1;
    const safe = extent("z") > 1 && extent("x") * extent("y") * extent("z") * dtypeBytes(source.dtype) <= VOLUME_RAW_BUDGET_BYTES;
    if (!safe) return source;
    return new Proxy(source, {
      get(target, property, receiver) {
        if (property === "getVolume") return (selection: any) => client!.load(field, level, selection);
        if (property === "getRaster") return async (options: any) => {
          const volume = client!.peek(field, level, options.selection);
          if (!volume) return target.getRaster(options);
          options.signal?.throwIfAborted();
          const z = Number(options.selection?.z || 0), size = volume.width * volume.height;
          return {data: volume.data.subarray(z * size, (z+1) * size), width: volume.width, height: volume.height};
        };
        const value = Reflect.get(target, property, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  });
}

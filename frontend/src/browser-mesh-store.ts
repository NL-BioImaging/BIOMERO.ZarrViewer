import { frontendBackendIsomorphicKvStoreProviderRegistry } from "neuroglancer/unstable/kvstore/register.js";
import type { DriverReadOptions, KvStore } from "neuroglancer/unstable/kvstore/index.js";
import { interactiveMesh, type MeshInput } from "./browser-mesh";

/** The renderer uses this provider in its chunk worker; no meshes are uploaded. */
frontendBackendIsomorphicKvStoreProviderRegistry.registerBaseKvStoreProvider(() => ({
  scheme: "biomeromesh", description: "BIOMERO interactive label preview",
  getKvStore(url) {
    const match = /^biomeromesh:\/\/([^/]+)\/([^/]*)\/(.*)$/.exec(url.url);
    if (!match) throw new Error("Invalid interactive mesh URL");
    const base = new URL(decodeURIComponent(match[1]));
    if (base.origin !== globalThis.origin) throw new Error("Interactive meshes require the same origin");
    const selected = match[2].split(",");
    if (selected.length > 3 || selected.some(id => !/^[1-9][0-9]{0,19}$/.test(id))) throw new Error("Invalid interactive selection");
    const memo = new Map<string, Promise<Uint8Array>>();
    async function bytes(key: string, options: DriverReadOptions): Promise<Uint8Array | undefined> {
      if (key === "info") return new TextEncoder().encode(JSON.stringify({ "@type": "neuroglancer_legacy_mesh" }));
      if (/^[1-9][0-9]*:0$/.test(key)) return new TextEncoder().encode(JSON.stringify({ fragments: [key.split(":")[0]] }));
      if (!/^[1-9][0-9]*$/.test(key)) return undefined;
      const browser = selected.includes(key);
      const load = async () => {
        const response = await fetch(new URL(`${browser ? "mesh-input" : "mesh"}/${key}`, base), { credentials: "same-origin", cache: "no-store", signal: options.signal });
        if (!response.ok) throw new Error(`Label surface unavailable (${response.status})`);
        const content = new Uint8Array(await response.arrayBuffer());
        if (!browser) return content;
        const length = new DataView(content.buffer).getUint32(0,true);
        if (length > 4096 || 4+length > content.length) throw new Error("Invalid interactive mesh input");
        const input: MeshInput = JSON.parse(new TextDecoder().decode(content.subarray(4,4+length)));
        return interactiveMesh(content.subarray(4+length),input);
      };
      if (!browser) return load();
      if (!memo.has(key)) memo.set(key, load().catch(error => { memo.delete(key); throw error; }));
      return memo.get(key)!;
    }
    const store: KvStore = {
      supportsOffsetReads: false, supportsSuffixReads: false,
      getUrl: key => `biomeromesh://${match[1]}/${match[2]}/${key}`,
      async stat(key,options) { const value=await bytes(key,options); return value ? {totalSize:value.length} : undefined; },
      async read(key,options) {
        const value=await bytes(key,options);
        return value ? {response:new Response(value as Uint8Array<ArrayBuffer>),offset:0,length:value.length,totalSize:value.length} : undefined;
      },
    };
    return {store,path:match[3]};
  },
}));

import * as zarr from "zarrita";
import type { Capability } from "./types";

type RefreshCapability = () => Promise<Capability>;

export class AuthenticatedZarrStore {
  private capability: Capability;
  private refreshCapability: RefreshCapability;
  private refreshing: Promise<Capability> | null = null;
  readonly store: zarr.FetchStore;

  constructor(capability: Capability, refreshCapability: RefreshCapability) {
    this.capability = capability;
    this.refreshCapability = refreshCapability;
    const storeUrl = new URL(capability.store.url, window.location.href).href;
    this.store = new zarr.FetchStore(storeUrl, {
      fetch: async (request) => this.authorizedFetch(request),
    });
  }

  update(capability: Capability): void {
    this.capability = capability;
  }

  private async refresh(): Promise<Capability> {
    if (!this.refreshing) {
      this.refreshing = this.refreshCapability().finally(() => { this.refreshing = null; });
    }
    const capability = await this.refreshing;
    this.update(capability);
    return capability;
  }

  private requestWithContext(request: Request): Request {
    const headers = new Headers(request.headers);
    headers.set("X-OMERO-Zarr-Context", this.capability.store.context);
    return new Request(request, { headers, credentials: "same-origin" });
  }

  private async authorizedFetch(request: Request): Promise<Response> {
    let response = await fetch(this.requestWithContext(request));
    if (response.status === 401 || response.status === 403) {
      await this.refresh();
      response = await fetch(this.requestWithContext(request));
    } else if (response.status >= 500 && response.status <= 504) {
      // Docker/NFS-backed read-only mounts can occasionally return a transient
      // I/O error for a chunk that is immediately readable on the next call.
      response = await fetch(this.requestWithContext(request));
    }
    return response;
  }
}

export class PrefixStore {
  private inner: zarr.FetchStore;
  private prefix: string;

  constructor(inner: zarr.FetchStore, prefix: string) {
    this.inner = inner;
    this.prefix = prefix === "." ? "" : prefix.replace(/^\/+|\/+$/g, "");
  }

  private key(key: string): `/${string}` {
    const clean = key.replace(/^\/+/, "");
    return `/${[this.prefix, clean].filter(Boolean).join("/")}`;
  }

  get(key: string, options?: Parameters<zarr.FetchStore["get"]>[1]) {
    return this.inner.get(this.key(key), options);
  }

  getRange(key: string, range: Parameters<zarr.FetchStore["getRange"]>[1], options?: Parameters<zarr.FetchStore["getRange"]>[2]) {
    return this.inner.getRange(this.key(key), range, options);
  }
}

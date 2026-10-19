import * as zarr from "zarrita";
import type { Capability, ChannelState } from "./types";
import { requestPreview } from "./preview-client";
import { abortableDelay } from "./shared-request";

type RefreshCapability = () => Promise<Capability>;

const SERVER_RETRY_DELAYS_MS = [75, 200, 500];

function isRetryableServerError(response: Response): boolean {
  return response.status >= 500 && response.status <= 504;
}

async function discard(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // A response body may already be closed by the browser. Retrying the
    // authorized request remains safe and bounded.
  }
}

function waitBeforeRetry(baseDelayMs: number,signal:AbortSignal): Promise<void> {
  // Jitter prevents a viewport full of failed chunks from retrying in lockstep
  // against Docker Desktop, NFS, or another busy shared filesystem.
  const delayMs = baseDelayMs + Math.floor(Math.random() * baseDelayMs);
  return abortableDelay(delayMs,signal);
}

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
    if (capability.store.preview_url) Object.assign(this.store, { getPreview: (field: string, size: number, channels: ChannelState[], z: number, t: number, signal: AbortSignal) => requestPreview(this, field, size, channels, z, t, signal) });
  }

  update(capability: Capability): void {
    this.capability = capability;
  }

  fetch(url: string, options?: { signal?: AbortSignal }): Promise<Response> {
    return this.authorizedFetch(new Request(new URL(url, window.location.href), { cache: "no-store", signal: options?.signal }));
  }

  get volumeUrl(): string | undefined { return this.capability.store.volume_url; }
  get neuroglancerUrl(): string | undefined { return this.capability.store.neuroglancer_url; }
  get previewUrl(): string | undefined { return this.capability.store.preview_url; }
  get volumeIdentity(): string { return `${this.capability.store.binding_digest || ""}:${this.capability.store.uuid || ""}`; }

  private async refresh(): Promise<Capability> {
    if (!this.refreshing) {
      this.refreshing = this.refreshCapability().finally(() => { this.refreshing = null; });
    }
    const capability = await this.refreshing;
    this.update(capability);
    return capability;
  }

  private requestWithContext(request: Request, bypassCache = false): Request {
    const headers = new Headers(request.headers);
    headers.set("X-OMERO-Zarr-Context", this.capability.store.context);
    return new Request(request, {
      headers,
      credentials: "same-origin",
      cache: bypassCache ? "no-store" : request.cache,
    });
  }

  private async authorizedFetch(request: Request): Promise<Response> {
    let refreshed = false;
    let serverRetries = 0;

    while (true) {
      request.signal.throwIfAborted();
      // A browser may reuse an error response for an identical request. Force
      // attempts after the first 5xx back to Nginx so each retry can recover
      // from a transient shared-filesystem read error.
      const response = await fetch(this.requestWithContext(request, serverRetries > 0));
      if ((response.status === 401 || response.status === 403) && !refreshed) {
        await discard(response);
        await this.refresh();
        refreshed = true;
        continue;
      }
      if (isRetryableServerError(response) && serverRetries < SERVER_RETRY_DELAYS_MS.length) {
        await discard(response);
        await waitBeforeRetry(SERVER_RETRY_DELAYS_MS[serverRetries],request.signal);
        serverRetries += 1;
        continue;
      }
      if (isRetryableServerError(response)) {
        const path = new URL(request.url).pathname;
        await discard(response);
        throw new Error(
          `Tile request failed after ${serverRetries + 1} attempts: ${response.status} ${response.statusText} (${path})`,
        );
      }
      return response;
    }
  }
}

export class PrefixStore {
  private inner: zarr.FetchStore;
  private prefix: string;
  private signal?: AbortSignal;

  constructor(inner: zarr.FetchStore, prefix: string, signal?: AbortSignal) {
    this.inner = inner;
    this.prefix = prefix === "." ? "" : prefix.replace(/^\/+|\/+$/g, "");
    this.signal = signal;
  }

  private key(key: string): `/${string}` {
    const clean = key.replace(/^\/+/, "");
    return `/${[this.prefix, clean].filter(Boolean).join("/")}`;
  }

  get(key: string, options?: Parameters<zarr.FetchStore["get"]>[1]) {
    return this.inner.get(this.key(key), {...options, signal: options?.signal || this.signal});
  }

  getRange(key: string, range: Parameters<zarr.FetchStore["getRange"]>[1], options?: Parameters<zarr.FetchStore["getRange"]>[2]) {
    return this.inner.getRange(this.key(key), range, {...options, signal: options?.signal || this.signal});
  }
}

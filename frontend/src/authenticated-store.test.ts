import { AuthenticatedZarrStore } from "./authenticated-store";
import type { Capability } from "./types";

test("virtual tile reads bound concurrency and discard cancelled queued requests", async () => {
  const virtual = capability("context");
  virtual.store.transport = "http";
  const releases: Array<() => void> = [];
  let active = 0, maximum = 0;
  const fetchMock = vi.fn(async () => {
    active++; maximum = Math.max(maximum, active);
    await new Promise<void>(resolve => releases.push(resolve));
    active--;
    return new Response(new Uint8Array([1]));
  });
  vi.stubGlobal("fetch", fetchMock);
  try {
    const auth = new AuthenticatedZarrStore(virtual, async () => virtual);
    const controller = new AbortController();
    const first = Array.from({length: 6}, (_, i) => auth.fetch(`/data/${i}`));
    const cancelled = auth.fetch("/data/cancelled", {signal: controller.signal});
    const rejected = expect(cancelled).rejects.toMatchObject({name: "AbortError"});
    const last = auth.fetch("/data/last");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(6));
    controller.abort();
    await rejected;
    releases.shift()!();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(7));
    releases.splice(0).forEach(release => release());
    await Promise.all([...first, last]);
    expect(maximum).toBe(6);
  } finally {
    vi.unstubAllGlobals();
  }
});

function capability(context: string): Capability {
  return {
    schema_version: 1,
    supported: true,
    image: { id: 42, name: "sample.zarr" },
    store: { url: "https://example.test/data/", context, expires_at: "2030-01-01T00:00:00Z" },
    kind: "image",
    ngff_version: "0.5",
    zarr_format: 3,
    initial_path: ".",
    axes: [], channels: [], labels: [],
  };
}

test("a rejected data request refreshes its context exactly once", async () => {
  const seen: string[] = [];
  const fetchMock = vi.fn(async (request: Request) => {
    seen.push(request.headers.get("X-OMERO-Zarr-Context") || "");
    return seen.length === 1 ? new Response(null, { status: 403 }) : new Response(new Uint8Array([1, 2]), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  const refresh = vi.fn(async () => capability("fresh"));
  const auth = new AuthenticatedZarrStore(capability("expired"), refresh);
  await auth.store.get("/zarr.json");
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(seen).toEqual(["expired", "fresh"]);
  vi.unstubAllGlobals();
});

test("resolves a same-origin relative data gateway URL", async () => {
  const relative = capability("context");
  relative.store.url = "/biomero_zarr_viewer/data/images/42/";
  const seen: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (request: Request) => {
    seen.push(request.url);
    return new Response(new Uint8Array([1]), { status: 200 });
  }));

  const auth = new AuthenticatedZarrStore(relative, async () => relative);
  await auth.store.get("/.zattrs");

  expect(seen).toEqual([
    new URL("/biomero_zarr_viewer/data/images/42/.zattrs", window.location.href).href,
  ]);
  vi.unstubAllGlobals();
});

test("retries transient server errors with bounded backoff without refreshing context", async () => {
  vi.useFakeTimers();
  vi.spyOn(Math, "random").mockReturnValue(0);
  const statuses = [500, 502, 504, 200];
  const caches: RequestCache[] = [];
  const fetchMock = vi.fn(async (request: Request) => {
    caches.push(request.cache);
    return new Response(new Uint8Array([1]), { status: statuses.shift() });
  });
  vi.stubGlobal("fetch", fetchMock);
  const refresh = vi.fn(async () => capability("fresh"));

  const auth = new AuthenticatedZarrStore(capability("current"), refresh);
  const result = auth.store.get("/0/0.0.0");
  await vi.runAllTimersAsync();
  await result;

  expect(fetchMock).toHaveBeenCalledTimes(4);
  expect(caches).toEqual(["default", "no-store", "no-store", "no-store"]);
  expect(refresh).not.toHaveBeenCalled();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test("returns a persistent server error after three retries", async () => {
  vi.useFakeTimers();
  vi.spyOn(Math, "random").mockReturnValue(0);
  const fetchMock = vi.fn(async () => new Response(
    new Uint8Array([1]), { status: 500 },
  ));
  vi.stubGlobal("fetch", fetchMock);
  const auth = new AuthenticatedZarrStore(capability("current"), async () => capability("fresh"));

  const result = auth.store.get("/0/0.0.0");
  const rejection = expect(result).rejects.toThrow(
    "Tile request failed after 4 attempts: 500  (/data/0/0.0.0)",
  );
  await vi.runAllTimersAsync();
  await rejection;

  expect(fetchMock).toHaveBeenCalledTimes(4);
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

import { AuthenticatedZarrStore } from "./authenticated-store";
import type { Capability } from "./types";

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
  const fetchMock = vi.fn(async () => new Response(
    new Uint8Array([1]), { status: statuses.shift() },
  ));
  vi.stubGlobal("fetch", fetchMock);
  const refresh = vi.fn(async () => capability("fresh"));

  const auth = new AuthenticatedZarrStore(capability("current"), refresh);
  const result = auth.store.get("/0/0.0.0");
  await vi.runAllTimersAsync();
  await result;

  expect(fetchMock).toHaveBeenCalledTimes(4);
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

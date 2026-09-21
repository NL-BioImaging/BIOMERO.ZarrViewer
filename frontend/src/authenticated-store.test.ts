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

test("retries one transient server error without refreshing context", async () => {
  const statuses = [500, 200];
  const fetchMock = vi.fn(async () => new Response(
    new Uint8Array([1]), { status: statuses.shift() },
  ));
  vi.stubGlobal("fetch", fetchMock);
  const refresh = vi.fn(async () => capability("fresh"));

  const auth = new AuthenticatedZarrStore(capability("current"), refresh);
  await auth.store.get("/0/0.0.0");

  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(refresh).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

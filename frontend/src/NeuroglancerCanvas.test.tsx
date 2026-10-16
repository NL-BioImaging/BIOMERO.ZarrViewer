import { render, waitFor } from "@testing-library/react";
import { NeuroglancerCanvas } from "./NeuroglancerCanvas";

test("changing time cancels the old preparation and requests only the new selected time", async () => {
  const original = window.BIOMERO_ZARR_VIEWER;
  window.BIOMERO_ZARR_VIEWER = { neuroglancerUrl: "/static/ng/index.html" } as any;
  vi.stubGlobal("fetch", vi.fn(async () => new Response("<html><head></head></html>")));
  const fetch = vi.fn((_url: string, _options?: { signal?: AbortSignal }) => new Promise<Response>(() => {}));
  const props = { auth: { neuroglancerUrl: "/ng/", fetch } as any, field: ".", t: 0, resolution: 0,
    channels: [{ index: 0, label: "DNA", color: "#FFFFFF", visible: true, low: 0, high: 255, domainMin: 0, domainMax: 255 }],
    labels: [], blendMode: "maximum" as const, showScale: true, resetKey: 0, brightness: 1, background: "#030406", gain: -3, height: 600,
    onCameraChange: vi.fn(), onError: vi.fn(), onReady: vi.fn(), onCancel: vi.fn() };
  try {
    const view = render(<NeuroglancerCanvas {...props} />);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const firstSignal = fetch.mock.calls[0][1]!.signal!;
    view.rerender(<NeuroglancerCanvas {...props} t={39} />);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(firstSignal.aborted).toBe(true);
    expect(fetch.mock.calls.map(([url]) => new URL(url, "http://localhost").searchParams.get("t"))).toEqual(["0", "39"]);
    view.unmount();
    expect(fetch.mock.calls[1][1]!.signal!.aborted).toBe(true);
  } finally { window.BIOMERO_ZARR_VIEWER = original; vi.unstubAllGlobals(); }
});

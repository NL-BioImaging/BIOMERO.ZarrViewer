import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NeuroglancerCanvas } from "./NeuroglancerCanvas";

test("layout and slice position changes use the existing authorized scene without preparing a new volume", async () => {
  const original = window.BIOMERO_ZARR_VIEWER;
  window.BIOMERO_ZARR_VIEWER = { neuroglancerUrl: "/static/ng/index.html" } as any;
  vi.stubGlobal("fetch", vi.fn(async () => new Response("<html><head></head></html>")));
  const prepared = { status:"ready", url:"/ng/context/", sources:{"image-0":{ shape:[5,20,30], resolution:[300,400,1500], translation:[100,200,900], segmentation:false }} };
  const fetch = vi.fn(async () => new Response(JSON.stringify(prepared)));
  const props = { auth:{neuroglancerUrl:"/ng/",fetch} as any, field:".",t:0,resolution:0,
    channels:[{index:0,label:"DNA",color:"#FFFFFF",visible:true,low:0,high:255,domainMin:0,domainMax:255}], labels:[],
    blendMode:"maximum" as const,showScale:true,resetKey:0,brightness:1,gain:-3,height:600,
    onCameraChange:vi.fn(),onPlane:vi.fn(),onError:vi.fn(),onReady:vi.fn(),onCancel:vi.fn() };
  try {
    const rendered = render(<NeuroglancerCanvas {...props} view="3d" />);
    const frame = await screen.findByTitle("Volume image and segmentation") as HTMLIFrameElement;
    const post = vi.spyOn(frame.contentWindow!, "postMessage");
    window.dispatchEvent(new MessageEvent("message", { source:frame.contentWindow,origin:window.location.origin,data:{type:"biomero-ng-initialized"} }));
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(post.mock.calls.at(-1)![0].state.layout).toBe("3d");
    rendered.rerender(<NeuroglancerCanvas {...props} view="slice" plane="yz" />);
    await waitFor(() => expect(post.mock.calls.at(-1)![0].state.layout).toBe("yz"));
    fireEvent.change(screen.getByRole("slider", {name:"X slice position"}), {target:{value:"4"}});
    await waitFor(() => expect(post.mock.calls.at(-1)![0].positionCommand.position[0]).toBe(1450));
    rendered.rerender(<NeuroglancerCanvas {...props} view="orthogonal" />);
    await waitFor(() => expect(post.mock.calls.at(-1)![0].state.layout).toBe("4panel"));
    expect(post.mock.calls.at(-1)![0].state.showSlices).toBe(true);
    expect(post.mock.calls.at(-1)![0].state.showScaleBar).toBe(false);
    fireEvent(window, new MessageEvent("message", {source:frame.contentWindow,origin:window.location.origin,data:{type:"biomero-ng-panels",
      panels:[0,1,2,3].map(index=>({left:index%2*400,top:Math.floor(index/2)*300,width:400,height:300,unitsPerPixel:100,perspective:index===2}))}}));
    expect(document.querySelectorAll(".physical-scale")).toHaveLength(4);
    expect(screen.getAllByText("10 µm")).toHaveLength(4);
    rendered.rerender(<NeuroglancerCanvas {...props} view="orthogonal" showScale={false} />);
    expect(document.querySelectorAll(".physical-scale")).toHaveLength(0);
    expect(fetch).toHaveBeenCalledTimes(1);
    rendered.unmount();
  } finally { window.BIOMERO_ZARR_VIEWER = original; vi.unstubAllGlobals(); }
});

test("changing time cancels the old preparation and requests only the new selected time", async () => {
  const original = window.BIOMERO_ZARR_VIEWER;
  window.BIOMERO_ZARR_VIEWER = { neuroglancerUrl: "/static/ng/index.html" } as any;
  vi.stubGlobal("fetch", vi.fn(async () => new Response("<html><head></head></html>")));
  const fetch = vi.fn((_url: string, _options?: { signal?: AbortSignal }) => new Promise<Response>(() => {}));
  const props = { auth: { neuroglancerUrl: "/ng/", fetch } as any, field: ".", t: 0, resolution: 0,
    channels: [{ index: 0, label: "DNA", color: "#FFFFFF", visible: true, low: 0, high: 255, domainMin: 0, domainMax: 255 }],
    labels: [], blendMode: "maximum" as const, showScale: true, resetKey: 0, brightness: 1, gain: -3, height: 600,
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

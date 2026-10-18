import { act, render, screen } from "@testing-library/react";
import type { ChannelState } from "./types";

const viv = vi.hoisted(() => ({ props: undefined as any, panels: new Map<string, any>() }));

vi.mock("@hms-dbmi/viv", () => ({
  MAX_CHANNELS: 10,
  ColorPalette3DExtensions: {
    AdditiveBlendExtension: class { mode = "additive"; },
    MaximumIntensityProjectionExtension: class { mode = "maximum"; },
    MinimumIntensityProjectionExtension: class { mode = "minimum"; },
  },
  getDefaultInitialViewState: () => ({ target: [10, 20, 30], zoom: -2 }),
  VolumeView: class { id = "3d"; },
  DetailView: class { constructor(args: any) { Object.assign(this,args); } },
  ColorPaletteExtension: class {},
  VivViewer: (props: any) => {
    viv.props = props; viv.panels.set(props.viewStates[0].id, props);
    return null;
  },
}));

import { VolumeCanvas } from "./VolumeCanvas";

const channels: ChannelState[] = [
  { index: 0, label: "DNA", visible: true, color: "#00FF00", low: 10, high: 200, domainMin: 0, domainMax: 255 },
  { index: 1, label: "RNA", visible: false, color: "#FF0000", low: 20, high: 180, domainMin: 0, domainMax: 255 },
];

function loader() {
  return [{
    labels: ["t", "c", "z", "y", "x"],
    shape: [3, 2, 4, 8, 8],
    dtype: "Uint16",
    getRaster: vi.fn(async () => ({ data: new Uint16Array(64) })),
  }];
}

test("the volume renderer selects visible channels and one time without fixing Z", () => {
  render(<VolumeCanvas width={800} height={600} loader={loader()} channels={channels} t={2} resolution={0}
    onCameraChange={() => {}} onCancel={() => {}} onError={() => {}} onReady={() => {}} />);
  expect(viv.props.layerProps[0].selections).toEqual([{ c: 0, t: 2 }]);
  expect(viv.props.layerProps[0].colors).toEqual([[0, 255, 0]]);
  expect(viv.props.layerProps[0].contrastLimits).toEqual([[10, 200]]);
  expect(screen.getByText("Loading 3D volume…")).toBeInTheDocument();
});

test("loader failures are surfaced with a return-to-2D action", async () => {
  const failing = loader();
  failing[0].getRaster = vi.fn(async () => { throw new Error("chunk denied"); });
  const onError = vi.fn();
  render(<VolumeCanvas width={800} height={600} loader={failing} channels={channels} t={0} resolution={0}
    onCameraChange={() => {}} onCancel={() => {}} onError={onError} onReady={() => {}} />);

  await act(async () => {
    await expect(viv.props.layerProps[0].loader[0].getRaster({})).rejects.toThrow("chunk denied");
  });
  expect(onError).toHaveBeenCalledWith("chunk denied");
  expect(screen.getByText("Unable to load this volume")).toBeInTheDocument();
});

test("viewport changes report a compact camera state", () => {
  const onCameraChange = vi.fn();
  render(<VolumeCanvas width={800} height={600} loader={loader()} channels={channels} t={0} resolution={0}
    onCameraChange={onCameraChange} onCancel={() => {}} onError={() => {}} onReady={() => {}} />);
  viv.props.onViewStateChange({ viewId: "3d", viewState: { rotationOrbit: 45, rotationX: -20, zoom: -1 } });
  expect(onCameraChange).toHaveBeenCalledWith({ orbit: 45, tilt: -20, zoom: -1 });
});

test("Viv sections share calibrated zoom and linked navigation, with scale bars before rendering completes", () => {
  const source = loader().map(item=>({...item,meta:{physicalSizes:{x:{size:.5,unit:"micrometer"},y:{size:.5,unit:"micrometer"},z:{size:2,unit:"micrometer"}}}}));
  const change = vi.fn();
  const camera = {orbit:0,tilt:0,zoom:0,slicePosition:[.5,.5,.5],sliceTarget:[.4,.3,.6]};
  const props = {width:800,height:600,loader:source,channels,t:0,resolution:0,camera,onCameraChange:change,onCancel:vi.fn(),onError:vi.fn(),onReady:vi.fn()};
  const {container,rerender} = render(<VolumeCanvas {...props} view="orthogonal" />);
  expect(container.querySelectorAll(".physical-scale")).toHaveLength(4);
  expect(viv.panels.get("xy").viewStates[0].target).toEqual([3.2,2.4,0]);
  expect(viv.panels.get("xz").viewStates[0].target).toEqual([3.2,9.6,0]);
  expect(viv.panels.get("yz").viewStates[0].zoom).toBe(viv.panels.get("xy").viewStates[0].zoom);
  expect(viv.panels.get("xz").layerProps[0].modelMatrix.getScale()).toEqual([1,4,1]);
  const xz = viv.panels.get("xz");
  xz.onViewStateChange({viewState:{target:[2,8,0],zoom:xz.viewStates[0].zoom+1}});
  expect(change).toHaveBeenLastCalledWith(expect.objectContaining({sliceTarget:[.25,.3,.5],sliceZoom:1}));
  xz.deckProps.onClick({viewport:{unproject:()=>[3,12]},x:10,y:10});
  expect(change).toHaveBeenLastCalledWith(expect.objectContaining({slicePosition:[.375,.5625,.75]}));
  rerender(<VolumeCanvas {...props} view="slice" plane="yz" />);
  expect(container.querySelectorAll(".physical-scale")).toHaveLength(1);
  rerender(<VolumeCanvas {...props} view="slice" plane="yz" showScale={false} />);
  expect(container.querySelectorAll(".physical-scale")).toHaveLength(0);
});

test("a selected standalone level restores XY scale without resampling Z again", () => {
  const levels = [loader()[0], { ...loader()[0], shape: [3, 2, 4, 2, 2] }];
  render(<VolumeCanvas width={800} height={600} loader={levels} channels={channels} t={0} resolution={1}
    onCameraChange={() => {}} onCancel={() => {}} onError={() => {}} onReady={() => {}} />);
  const layer = viv.props.layerProps[0];
  expect(layer.loader).toHaveLength(1);
  expect(layer.loader[0].shape).toEqual([3, 2, 4, 2, 2]);
  expect(layer.resolution).toBe(0);
  expect(layer.modelMatrix.getScale()).toEqual([4, 4, 1]);
});

test("contrast changes update rendering without changing the volume selections", () => {
  const source = loader();
  const props = {
    width: 800,
    height: 600,
    loader: source,
    t: 0,
    resolution: 0,
    onCameraChange: () => {},
    onCancel: () => {},
    onError: () => {},
    onReady: () => {},
  };
  const { rerender } = render(<VolumeCanvas {...props} channels={channels} />);
  const initialSelections = viv.props.layerProps[0].selections;
  const adjusted = channels.map((item) => ({ ...item, low: item.low + 5 }));
  rerender(<VolumeCanvas {...props} channels={adjusted} />);
  expect(viv.props.layerProps[0].selections).toBe(initialSelections);
  expect(viv.props.layerProps[0].contrastLimits).toEqual([[15, 200]]);
});

test("3D display modes default to additive and change without reloading the selected volume", () => {
  const props = {
    width: 800, height: 600, loader: loader(), channels, t: 0, resolution: 0,
    onCameraChange: () => {}, onCancel: () => {}, onError: () => {}, onReady: () => {},
  };
  const { rerender } = render(<VolumeCanvas {...props} />);
  const initialLoader = viv.props.layerProps[0].loader;
  const initialSelections = viv.props.layerProps[0].selections;
  expect(viv.props.layerProps[0].extensions[0].mode).toBe("additive");
  for (const blendMode of ["maximum", "minimum", "additive"] as const) {
    rerender(<VolumeCanvas {...props} blendMode={blendMode} />);
    expect(viv.props.layerProps[0].extensions[0].mode).toBe(blendMode);
    expect(viv.props.layerProps[0].loader).toBe(initialLoader);
    expect(viv.props.layerProps[0].selections).toBe(initialSelections);
  }
});

test("the calibrated 3D scale bar follows zoom and can be hidden", async () => {
  vi.useFakeTimers();
  try {
    const source = loader().map(item => ({ ...item, meta: { physicalSizes: {
      x: { size: 0.5, unit: "micrometer" }, y: { size: 0.5, unit: "micrometer" }, z: { size: 2, unit: "micrometer" },
    } } }));
    const props = {
      width: 800, height: 600, loader: source, channels, t: 0, resolution: 0,
      onCameraChange: () => {}, onCancel: () => {}, onError: () => {}, onReady: () => {},
    };
    const { rerender } = render(<VolumeCanvas {...props} camera={{ orbit: 30, tilt: -45, zoom: 0 }} />);
    await act(async () => { viv.props.layerProps[0].onViewportLoad(); vi.runAllTimers(); });
    expect(screen.getByLabelText("Scale 50 micrometer at volume center")).toBeInTheDocument();
    rerender(<VolumeCanvas {...props} camera={{ orbit: 30, tilt: -45, zoom: 1 }} />);
    expect(screen.getByLabelText("Scale 20 micrometer at volume center")).toBeInTheDocument();
    rerender(<VolumeCanvas {...props} showScale={false} />);
    expect(screen.queryByText("at volume center")).not.toBeInTheDocument();
  } finally {
    vi.useRealTimers();
  }
});

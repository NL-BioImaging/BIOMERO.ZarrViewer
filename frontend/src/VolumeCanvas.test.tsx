import { act, render, screen } from "@testing-library/react";
import type { ChannelState } from "./types";

const viv = vi.hoisted(() => ({ props: undefined as any }));

vi.mock("@hms-dbmi/viv", () => ({
  MAX_CHANNELS: 10,
  ColorPalette3DExtensions: { AdditiveBlendExtension: class {} },
  getDefaultInitialViewState: () => ({ target: [10, 20, 30], zoom: -2 }),
  VolumeView: class {
    id = "3d";
  },
  VivViewer: (props: any) => {
    viv.props = props;
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

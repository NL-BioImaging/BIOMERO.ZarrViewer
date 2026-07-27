import {
  applyChannelDeepLink,
  applyLabelDeepLink,
  applySourceChannels,
  fitRoiViewport,
  parseDeepLink,
  writeDeepLink,
} from "./viewer-state";
import type { ChannelState, LabelState } from "./types";

const channels: ChannelState[] = [{ index: 0, label: "DNA", visible: true, color: "#00FF00", low: 10, high: 200, domainMin: 0, domainMax: 255 }];
const labels: LabelState[] = [
  { id: "a", name: "Nuclei", path: "labels/a", visible: true, opacity: 0.5, mode: "fill" },
  { id: "b", name: "Cells", path: "labels/b", visible: false, opacity: 0.7, mode: "outline" },
];

beforeEach(() => window.history.replaceState(null, "", "/viewer/?image=42"));

test("deep-link state round trips", () => {
  const url = writeDeepLink(42, {
    viewport: { x: 12.25, y: 8.5, zoom: -1.25 },
    z: 3,
    t: 2,
    projection: "mean",
    renderMode: "3d",
    volumeLevel: 2,
    volumeCamera: { orbit: 45, tilt: -20, zoom: -1.5 },
    field: "A/1/0",
    roi: { x0: 10, y0: 20, x1: 110, y1: 70 },
    sourceChannels: [1],
    labelPath: "A/1/0/labels/cells",
    labelValue: 42,
    storeUuid: "3935615d-a18d-41d8-af04-e63cfec3a46c",
    channels,
    labels,
  });
  const parsed = parseDeepLink(url.slice(url.indexOf("?")));
  expect(parsed.viewport).toEqual({ x: 12.25, y: 8.5, zoom: -1.25 });
  expect(parsed.field).toBe("A/1/0");
  expect(parsed.roi).toEqual({ x0: 10, y0: 20, x1: 110, y1: 70 });
  expect(parsed.sourceChannels).toEqual([1]);
  expect(parsed.labelPath).toBe("A/1/0/labels/cells");
  expect(parsed.labelValue).toBe(42);
  expect(parsed.storeUuid).toBe("3935615d-a18d-41d8-af04-e63cfec3a46c");
  expect(parsed.projection).toBe("mean");
  expect(parsed.renderMode).toBe("3d");
  expect(parsed.volumeLevel).toBe(2);
  expect(parsed.volumeCamera).toEqual({ orbit: 45, tilt: -20, zoom: -1.5 });
  expect(parsed.channels?.[0]).toMatchObject({ index: 0, color: "#00FF00" });
  expect(parsed.labels?.[1]).toMatchObject({ id: "b", mode: "outline" });
});

test("invalid optional state is ignored and numeric state is clamped", () => {
  const parsed = parseDeepLink("?v=1&zoom=900&z=-3&projection=median&channels=not-json&render=3d&volumeLevel=-2&orbit=999&tilt=-999&zoom3d=99");
  expect(parsed.viewport?.zoom).toBe(30);
  expect(parsed.z).toBe(0);
  expect(parsed.channels).toBeUndefined();
  expect(parsed.projection).toBeUndefined();
  expect(parsed.volumeLevel).toBe(0);
  expect(parsed.volumeCamera).toEqual({ orbit: 360, tilt: -90, zoom: 30 });
});

test("saved channels are constrained to their domain", () => {
  const result = applyChannelDeepLink(channels, [{ index: 0, visible: false, color: "bad", low: -50, high: 999 }]);
  expect(result[0]).toMatchObject({ visible: false, color: "#00FF00", low: 0, high: 255 });
});

test("one-based source channels select viewer channels", () => {
  const result = applySourceChannels([
    channels[0],
    { ...channels[0], index: 1, label: "RNA" },
  ], [2]);
  expect(result.map((item) => item.visible)).toEqual([false, true]);
});

test("ROI fitting centers and contains the requested bounds", () => {
  const result = fitRoiViewport({ x0: 10, y0: 20, x1: 110, y1: 70 }, 1000, 500);
  expect(result.x).toBe(60);
  expect(result.y).toBe(45);
  expect(result.zoom).toBeCloseTo(Math.log2(9));
});

test("saved label order is restored without losing new layers", () => {
  const result = applyLabelDeepLink(labels, [{ id: "b", visible: true, opacity: 2, mode: "outline" }]);
  expect(result.map((item) => item.id)).toEqual(["b", "a"]);
  expect(result[0].opacity).toBe(1);
});

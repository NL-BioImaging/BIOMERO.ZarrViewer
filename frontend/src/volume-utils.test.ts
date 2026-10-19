import type { ChannelState } from "./types";
import {
  VOLUME_RAW_BUDGET_BYTES,
  activeVolumeChannels,
  chooseVolumeLevel,
  dtypeBytes,
  safeVolumeLevels,
  volumeLevels,
  volumeModelMatrix,
  volumePhysicalScale,
  volumeSelection,
} from "./volume-utils";
import { attachNgffPhysicalSizes } from "./ngff-physical-sizes";
import { getPhysicalSizeScalingMatrix } from "@vivjs/layers";
import { getDefaultInitialViewState } from "@hms-dbmi/viv";
import { scaleBarSize } from "./physical-scale";
import { OrbitViewport } from "@deck.gl/core";

function source(shape: number[], dtype = "Uint16") {
  return { labels: ["t", "c", "z", "y", "x"], shape, dtype };
}

const channel = (index: number, visible = true): ChannelState => ({
  index,
  label: `C${index}`,
  visible,
  color: "#FFFFFF",
  low: 0,
  high: 255,
  domainMin: 0,
  domainMax: 255,
});

test.each([false, true])("3D extents and camera stay consistent across levels (Z downsampled: %s)", (downsampleZ) => {
  const loader = [1, 2, 4].map(factor => source([1, 1, 240 / (downsampleZ ? factor : 1), 280 / factor, 272 / factor]));
  attachNgffPhysicalSizes(loader, { multiscales: [{
    axes: ["t", "c", "z", "y", "x"],
    datasets: [1, 2, 4].map(factor => ({ coordinateTransformations: [{
      type: "scale", scale: [1, 1, 0.5 * (downsampleZ ? factor : 1), 0.36 * factor, 0.36 * factor],
    }] })),
  }] });
  const baseView = getDefaultInitialViewState(loader, { width: 800, height: 600 }, 1, true) as any;
  loader.forEach((level, index) => {
    const matrix = volumeModelMatrix(loader, index);
    const extents = matrix.transformPoint(getPhysicalSizeScalingMatrix(level).transformPoint([
      level.shape[4], level.shape[3], level.shape[2],
    ]));
    expect(extents[0]).toBeCloseTo(272);
    expect(extents[1]).toBeCloseTo(280);
    expect(extents[2]).toBeCloseTo(240 * 0.5 / 0.36);
    const view = (getDefaultInitialViewState as any)([level], { width: 800, height: 600 }, 1, true, matrix);
    expect(view.zoom).toBeCloseTo(baseView.zoom);
    view.target.forEach((value: number, axis: number) => expect(value).toBeCloseTo(baseView.target[axis]));
  });
});

test("declared scales win over rounded array dimensions, with per-axis shape fallback", () => {
  const base = source([1, 1, 236, 275, 271]);
  const coarse = { ...source([1, 1, 236, 68, 67]), meta: { volumeScale: { x: 4, y: 4, z: 1 } } };
  expect(volumeModelMatrix([base, coarse], 1).getScale()).toEqual([4, 4, 1]);
  expect(volumeModelMatrix([base, source([1, 1, 118, 55, 271])], 1).getScale()).toEqual([1, 5, 2]);
});

test("3D scale uses Viv's smallest calibrated base axis and matches projection at the camera target", () => {
  const loader = [{ meta: { physicalSizes: {
    x: { size: 0.36, unit: "micrometer" }, y: { size: 0.36, unit: "micrometer" }, z: { size: 0.2, unit: "micrometer" },
  } } }];
  const scale = volumePhysicalScale(loader)!;
  expect(scale).toEqual({ size: 0.2, unit: "micrometer" });
  for (const zoom of [-2, 0, 2]) {
    const viewport = new OrbitViewport({ width: 800, height: 600, target: [10, 20, 30], rotationOrbit: 35, rotationX: -50, zoom, orbitAxis: "Y" });
    const center = viewport.project([10, 20, 30]);
    const bar = scaleBarSize(scale.size, zoom);
    const left = viewport.unproject(center);
    const right = viewport.unproject([center[0] + bar.pixels, center[1], center[2]]);
    const distance = Math.hypot(...right.map((value, axis) => value - left[axis]));
    expect(distance * scale.size).toBeCloseTo(bar.value, 6);
  }
  expect(volumePhysicalScale([{}])).toBeUndefined();
  expect(volumePhysicalScale([{meta:{physicalSizes:Object.fromEntries(["x","y","z"].map(axis=>[axis,{size:1,unit:"pixel"}]))}}])).toEqual({size:1,unit:"pixel"});
  expect(volumePhysicalScale([{ meta: { physicalSizes: { ...loader[0].meta.physicalSizes, z: { size: 1, unit: "pixel" } } } }])).toBeUndefined();
});

test("volume selections include channel and time but never fix Z", () => {
  expect(volumeSelection(["t", "c", "z", "y", "x"], 3, 7)).toEqual({ c: 3, t: 7 });
  expect(volumeSelection(["z", "y", "x"], 0, 0)).toEqual({});
});

test("dtype byte widths are conservative", () => {
  expect(dtypeBytes("Uint8")).toBe(1);
  expect(dtypeBytes("Int16")).toBe(2);
  expect(dtypeBytes("Float32")).toBe(4);
  expect(dtypeBytes("Float64")).toBe(8);
});

test("volume levels enforce memory, texture, and 3D constraints", () => {
  const levels = volumeLevels([
    source([1, 2, 64, 1024, 1024]),
    source([1, 2, 32, 256, 256]),
    source([1, 2, 1, 128, 128]),
  ], 2, 512, VOLUME_RAW_BUDGET_BYTES);

  expect(levels[0]).toMatchObject({ safe: false, reason: "texture" });
  expect(levels[1]).toMatchObject({ safe: true, width: 256, height: 256, depth: 32 });
  expect(levels[1].rawBytes).toBe(32 * 256 * 256 * 2 * 2);
  expect(levels[2]).toMatchObject({ safe: false, reason: "not-3d" });
  expect(safeVolumeLevels(levels).map((level) => level.index)).toEqual([1]);
});

test("all volume layouts share a 200 MiB limit across visible channels, including the boundary", () => {
  const levels = volumeLevels([source([1,1,100,1024,1024]),source([1,1,101,1024,1024])],1,2048);
  expect(levels[0]).toMatchObject({safe:true,rawBytes:200*1024*1024});
  expect(levels[1]).toMatchObject({safe:false,reason:"memory"});
  expect(volumeLevels([source([1,2,100,1024,1024])],2,2048)[0].safe).toBe(false);
});

test("requested safe level wins and otherwise the finest level within the initial-load budget is chosen", () => {
  const levels = volumeLevels([
    source([1, 1, 16, 256, 256]),
    source([1, 1, 8, 128, 128]),
  ], 1, 512);
  expect(chooseVolumeLevel(levels, 0)?.index).toBe(0);
  expect(chooseVolumeLevel(levels, 99)?.index).toBe(0);
});

test("only visible channels up to Viv's channel limit are loaded", () => {
  const channels = Array.from({ length: 12 }, (_, index) => channel(index, index !== 2));
  const active = activeVolumeChannels(channels);
  expect(active).toHaveLength(10);
  expect(active.some((item) => item.index === 2)).toBe(false);
});

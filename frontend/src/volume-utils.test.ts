import type { ChannelState } from "./types";
import {
  VOLUME_RAW_BUDGET_BYTES,
  activeVolumeChannels,
  chooseVolumeLevel,
  dtypeBytes,
  safeVolumeLevels,
  volumeLevels,
  volumeSelection,
} from "./volume-utils";

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

test("requested safe level wins and otherwise the coarsest safe level is chosen", () => {
  const levels = volumeLevels([
    source([1, 1, 16, 256, 256]),
    source([1, 1, 8, 128, 128]),
  ], 1, 512);
  expect(chooseVolumeLevel(levels, 0)?.index).toBe(0);
  expect(chooseVolumeLevel(levels, 99)?.index).toBe(1);
});

test("only visible channels up to Viv's channel limit are loaded", () => {
  const channels = Array.from({ length: 12 }, (_, index) => channel(index, index !== 2));
  const active = activeVolumeChannels(channels);
  expect(active).toHaveLength(10);
  expect(active.some((item) => item.index === 2)).toBe(false);
});

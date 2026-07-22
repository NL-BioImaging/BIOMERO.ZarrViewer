import { describe, expect, test } from "vitest";
import { analyzeChannels, applyChannelAnalysis, autoScaleChannels } from "./channel-scaling";
import type { ChannelState } from "./types";

const channel: ChannelState = {
  index: 0,
  label: "DNA",
  visible: true,
  color: "#FFFFFF",
  low: 0,
  high: 65535,
  domainMin: 0,
  domainMax: 65535,
};

describe("automatic channel scaling", () => {
  test("uses Viv percentile statistics from the coarsest raster", async () => {
    const source = {
      labels: ["c", "y", "x"],
      shape: [1, 2, 3],
      tileSize: 256,
      getRaster: async () => ({ data: new Uint16Array([0, 10, 20, 30, 40, 1000]), width: 3, height: 2 }),
    };

    const [scaled] = await autoScaleChannels([source], [channel]);

    expect(scaled.low).toBe(10);
    expect(scaled.high).toBe(1000);

    const [analysis] = await analyzeChannels([source], [channel]);
    expect(analysis.histogram).toHaveLength(48);
    expect(analysis.histogram.reduce((sum, value) => sum + value, 0)).toBeGreaterThan(0);
  });

  test("keeps metadata defaults when a sample has no usable range", async () => {
    const source = {
      labels: ["c", "y", "x"],
      shape: [1, 2, 2],
      tileSize: 256,
      getRaster: async () => ({ data: new Uint16Array(4), width: 2, height: 2 }),
    };

    expect(await autoScaleChannels([source], [channel])).toEqual([channel]);
  });

  test("applies sampled fit limits independently of automatic contrast", () => {
    const [scaled] = applyChannelAnalysis([channel], [{
      index: 0,
      autoLow: 10,
      autoHigh: 200,
      fitLow: 2,
      fitHigh: 900,
      histogram: [],
    }], "fit");

    expect(scaled).toMatchObject({ low: 2, high: 900 });
  });
});

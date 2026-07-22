import { getChannelStats } from "@hms-dbmi/viv";
import type { ChannelState } from "./types";

const SAMPLE_BUDGET = 262_144;
const MAX_TILES_PER_AXIS = 4;
const HISTOGRAM_BINS = 48;

export interface ChannelAnalysis {
  index: number;
  autoLow: number;
  autoHigh: number;
  fitLow: number;
  fitHigh: number;
  histogram: number[];
}

function selection(labels: string[], channel: number, z: number, t: number): Record<string, number> {
  const result: Record<string, number> = {};
  if (labels.includes("c")) result.c = channel;
  if (labels.includes("z")) result.z = z;
  if (labels.includes("t")) result.t = t;
  return result;
}

function sampleIndexes(count: number): number[] {
  if (count <= 1) return [0];
  const samples = Math.min(count, MAX_TILES_PER_AXIS);
  return Array.from(new Set(Array.from({ length: samples }, (_, index) =>
    Math.round(index * (count - 1) / Math.max(1, samples - 1))
  )));
}

function appendSample(target: number[], data: ArrayLike<number>, budget: number): void {
  const remaining = Math.max(0, budget - target.length);
  if (!remaining || !data.length) return;
  const stride = Math.max(1, Math.ceil(data.length / remaining));
  for (let index = 0; index < data.length && target.length < budget; index += stride) {
    const value = Number(data[index]);
    if (Number.isFinite(value)) target.push(value);
  }
}

async function sampledPixels(source: any, channel: number, z: number, t: number): Promise<Float64Array> {
  const labels: string[] = source.labels || [];
  const xIndex = labels.indexOf("x");
  const yIndex = labels.indexOf("y");
  const width = xIndex >= 0 ? Number(source.shape[xIndex]) : 1;
  const height = yIndex >= 0 ? Number(source.shape[yIndex]) : 1;
  const selected = selection(labels, channel, z, t);
  const values: number[] = [];

  if (width * height <= SAMPLE_BUDGET) {
    const raster = await source.getRaster({ selection: selected });
    appendSample(values, raster.data, SAMPLE_BUDGET);
    return new Float64Array(values);
  }

  const tileSize = Math.max(1, Number(source.tileSize) || 256);
  const tilesX = Math.max(1, Math.ceil(width / tileSize));
  const tilesY = Math.max(1, Math.ceil(height / tileSize));
  const coordinates = sampleIndexes(tilesY).flatMap((y) => sampleIndexes(tilesX).map((x) => ({ x, y })));
  const perTileBudget = Math.max(1, Math.floor(SAMPLE_BUDGET / coordinates.length));
  for (const coordinate of coordinates) {
    const tile = await source.getTile({ ...coordinate, selection: selected });
    appendSample(values, tile.data, Math.min(SAMPLE_BUDGET, values.length + perTileBudget));
  }
  return new Float64Array(values);
}

function histogram(values: Float64Array, low: number, high: number): number[] {
  const bins = Array.from({ length: HISTOGRAM_BINS }, () => 0);
  const span = Math.max(1, high - low);
  for (const value of values) {
    if (!Number.isFinite(value) || value < low || value > high) continue;
    const index = Math.min(HISTOGRAM_BINS - 1, Math.floor((value - low) / span * HISTOGRAM_BINS));
    bins[index] += 1;
  }
  return bins;
}

export async function analyzeChannels(
  loader: any[],
  channels: ChannelState[],
  z = 0,
  t = 0,
): Promise<ChannelAnalysis[]> {
  const source = loader[loader.length - 1] || loader[0];
  if (!source) return [];
  return Promise.all(channels.map(async (channel) => {
    try {
      const pixels = await sampledPixels(source, channel.index, z, t);
      if (!pixels.length) throw new Error("No sampled pixels");
      const { contrastLimits, domain } = getChannelStats(pixels as any);
      let autoLow = Number(contrastLimits[0]);
      let autoHigh = Number(contrastLimits[1]);
      let fitLow = Number(domain[0]);
      let fitHigh = Number(domain[1]);
      if (!Number.isFinite(fitLow) || !Number.isFinite(fitHigh) || fitHigh <= fitLow) {
        fitLow = channel.domainMin;
        fitHigh = channel.domainMax;
      }
      if (!Number.isFinite(autoLow) || !Number.isFinite(autoHigh) || autoHigh <= autoLow) {
        autoLow = fitLow;
        autoHigh = fitHigh;
      }
      fitLow = Math.max(channel.domainMin, Math.min(channel.domainMax, fitLow));
      fitHigh = Math.max(channel.domainMin, Math.min(channel.domainMax, fitHigh));
      autoLow = Math.max(fitLow, Math.min(fitHigh, autoLow));
      autoHigh = Math.max(fitLow, Math.min(fitHigh, autoHigh));
      return {
        index: channel.index,
        autoLow,
        autoHigh,
        fitLow,
        fitHigh,
        histogram: histogram(pixels, fitLow, fitHigh),
      };
    } catch {
      return {
        index: channel.index,
        autoLow: channel.low,
        autoHigh: channel.high,
        fitLow: channel.domainMin,
        fitHigh: channel.domainMax,
        histogram: Array.from({ length: HISTOGRAM_BINS }, () => 0),
      };
    }
  }));
}

export function applyChannelAnalysis(
  channels: ChannelState[],
  analyses: ChannelAnalysis[],
  mode: "auto" | "fit" = "auto",
): ChannelState[] {
  const byIndex = new Map(analyses.map((analysis) => [analysis.index, analysis]));
  return channels.map((channel) => {
    const analysis = byIndex.get(channel.index);
    if (!analysis) return channel;
    return {
      ...channel,
      low: mode === "auto" ? analysis.autoLow : analysis.fitLow,
      high: mode === "auto" ? analysis.autoHigh : analysis.fitHigh,
    };
  });
}

export async function autoScaleChannels(
  loader: any[],
  channels: ChannelState[],
  z = 0,
  t = 0,
): Promise<ChannelState[]> {
  return applyChannelAnalysis(channels, await analyzeChannels(loader, channels, z, t));
}

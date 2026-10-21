import { getChannelStats } from "@hms-dbmi/viv";
import type { ChannelState } from "./types";

export function dtypeDomain(dtype: string): [number, number] {
  const normalized = dtype.toLowerCase();
  if (normalized.includes("uint8")) return [0, 255];
  if (normalized.includes("uint16")) return [0, 65535];
  if (normalized.includes("uint32")) return [0, 4294967295];
  if (normalized.includes("int8")) return [-128, 127];
  if (normalized.includes("int16")) return [-32768, 32767];
  if (normalized.includes("int32")) return [-2147483648, 2147483647];
  return [0, 1];
}

const SAMPLE_BUDGET = 262_144;
const MAX_TILES_PER_AXIS = 4;
const HISTOGRAM_BINS = 48;

export interface ChannelAnalysis {
  status?: Exclude<StatisticsStatus,"loading">;
  message?: string;
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

export interface AnalysisOptions { signal?: AbortSignal; volume?: boolean }
export interface StatisticsContext {field:string;renderMode:string;projection:string;z:number;t:number;level?:number;channels:number[]}
export type StatisticsStatus = "loading" | "ready" | "empty" | "error";

async function sampledPixels(source: any, channel: number, z: number, t: number, options: AnalysisOptions): Promise<Float64Array> {
  const labels: string[] = source.labels || [];
  const xIndex = labels.indexOf("x");
  const yIndex = labels.indexOf("y");
  const width = xIndex >= 0 ? Number(source.shape[xIndex]) : 1;
  const height = yIndex >= 0 ? Number(source.shape[yIndex]) : 1;
  const values: number[] = [];
  const depth = labels.includes("z") ? source.shape[labels.indexOf("z")] : 1;
  const planes = options.volume ? [...new Set(Array.from({length: Math.min(5, depth)}, (_, i) => Math.round(i * (depth - 1) / Math.max(1, Math.min(5, depth) - 1))))] : [Math.max(0, Math.min(depth - 1, z))];

  if (width * height <= SAMPLE_BUDGET) {
    for (const plane of planes) {
      options.signal?.throwIfAborted();
      const raster = await source.getRaster({ selection: selection(labels, channel, plane, t), signal: options.signal });
      options.signal?.throwIfAborted();
      appendSample(values, raster.data, Math.min(SAMPLE_BUDGET, values.length + Math.floor(SAMPLE_BUDGET / planes.length)));
    }
    return new Float64Array(values);
  }

  const tileSize = Math.max(1, Number(source.tileSize) || 256);
  const tilesX = Math.max(1, Math.ceil(width / tileSize));
  const tilesY = Math.max(1, Math.ceil(height / tileSize));
  const spatial = sampleIndexes(tilesY).flatMap((y) => sampleIndexes(tilesX).map((x) => ({ x, y })));
  const all = planes.flatMap(plane => spatial.map(coordinate => ({...coordinate, plane})));
  const coordinates = Array.from({length: Math.min(16, all.length)}, (_, i) => all[Math.round(i * (all.length - 1) / Math.max(1, Math.min(16, all.length) - 1))]);
  const perTileBudget = Math.max(1, Math.floor(SAMPLE_BUDGET / coordinates.length));
  for (const coordinate of coordinates) {
    options.signal?.throwIfAborted();
    const tile = await source.getTile({ ...coordinate, selection: selection(labels, channel, coordinate.plane, t), signal: options.signal });
    options.signal?.throwIfAborted();
    appendSample(values, tile.data, Math.min(SAMPLE_BUDGET, values.length + perTileBudget));
  }
  return new Float64Array(values);
}

function histogram(values: Float64Array, low: number, high: number): number[] {
  const bins = Array.from({ length: HISTOGRAM_BINS }, () => 0);
  const span = Math.max(Number.EPSILON, high - low);
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
  options: AnalysisOptions = {},
): Promise<ChannelAnalysis[]> {
  // Pyramid averaging suppresses bright nuclei. Estimate contrast from bounded,
  // spatially distributed native-resolution tiles, never a blurred overview.
  const source = loader[0]?.statisticsSource || loader[0];
  if (!source) return [];
  const samples=source.getNativeSamples&&!options.volume?source.getNativeSamples(channels.map(c=>c.index),z,t,options.signal):undefined;
  return Promise.all(channels.map(async (channel) => {
    try {
      const pixels = (await samples)?.get(channel.index) || await sampledPixels(source, channel.index, z, t, options);
      if (!pixels.length) throw new Error("No sampled pixels");
      const { contrastLimits, domain } = getChannelStats(pixels as any);
      let autoLow = Number(contrastLimits[0]);
      let autoHigh = Number(contrastLimits[1]);
      let fitLow = Number(domain[0]);
      let fitHigh = Number(domain[1]);
      if (!Number.isFinite(fitLow) || !Number.isFinite(fitHigh) || fitHigh <= fitLow) {
        const value = pixels[0];
        fitLow = value === 0 ? channel.domainMin : Math.min(0, value);
        fitHigh = value === 0 ? channel.domainMax : Math.max(value, fitLow + Math.max(1, Math.abs(value) * .01));
      }
      if (!Number.isFinite(autoLow) || !Number.isFinite(autoHigh) || autoHigh <= autoLow) {
        autoLow = fitLow;
        autoHigh = fitHigh;
      }
      autoLow = Math.max(fitLow, Math.min(fitHigh, autoLow));
      autoHigh = Math.max(fitLow, Math.min(fitHigh, autoHigh));
      return {
        status: "ready",
        index: channel.index,
        autoLow,
        autoHigh,
        fitLow,
        fitHigh,
        histogram: histogram(pixels, fitLow, fitHigh),
      };
    } catch (error) {
      if (options.signal?.aborted) throw error;
      return {
        status: "error", message: error instanceof Error ? error.message : "Channel statistics are unavailable",
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

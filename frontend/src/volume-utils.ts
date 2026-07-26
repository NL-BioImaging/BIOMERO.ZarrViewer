import { MAX_CHANNELS } from "@hms-dbmi/viv";
import type { ChannelState, VolumeLevel } from "./types";

export const VOLUME_RAW_BUDGET_BYTES = 256 * 1024 * 1024;

export function dtypeBytes(dtype: string): number {
  const normalized = String(dtype || "").toLowerCase();
  if (normalized.includes("64")) return 8;
  if (normalized.includes("32")) return 4;
  if (normalized.includes("16")) return 2;
  return 1;
}

function axisSize(source: any, axis: string): number {
  const index = Array.isArray(source?.labels) ? source.labels.indexOf(axis) : -1;
  const value = index >= 0 ? Number(source?.shape?.[index]) : 1;
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 1;
}

export function activeVolumeChannels(channels: ChannelState[]): ChannelState[] {
  return channels.filter((channel) => channel.visible).slice(0, MAX_CHANNELS);
}

export function volumeSelection(labels: string[], channel: number, time: number): Record<string, number> {
  const selection: Record<string, number> = {};
  if (labels.includes("c")) selection.c = channel;
  if (labels.includes("t")) selection.t = time;
  return selection;
}

export function volumeLevels(
  loader: any[],
  channelCount: number,
  maxTextureSize: number,
  budget = VOLUME_RAW_BUDGET_BYTES,
): VolumeLevel[] {
  const selectedChannels = Math.max(1, Math.min(MAX_CHANNELS, Math.floor(channelCount)));
  return loader.map((source, index) => {
    const width = axisSize(source, "x");
    const height = axisSize(source, "y");
    const depth = axisSize(source, "z");
    const rawBytes = width * height * depth * dtypeBytes(source?.dtype) * selectedChannels;
    const textureSafe = maxTextureSize > 0 && Math.max(width, height, depth) <= maxTextureSize;
    const memorySafe = Number.isSafeInteger(rawBytes) && rawBytes <= budget;
    const threeDimensional = depth > 1;
    const safe = textureSafe && memorySafe && threeDimensional;
    return {
      index,
      width,
      height,
      depth,
      rawBytes,
      safe,
      ...(!threeDimensional
        ? { reason: "not-3d" as const }
        : !textureSafe
          ? { reason: "texture" as const }
          : !memorySafe
            ? { reason: "memory" as const }
            : {}),
    };
  });
}

export function safeVolumeLevels(levels: VolumeLevel[]): VolumeLevel[] {
  return levels.filter((level) => level.safe);
}

export function chooseVolumeLevel(levels: VolumeLevel[], requested?: number): VolumeLevel | undefined {
  const safe = safeVolumeLevels(levels);
  if (!safe.length) return undefined;
  return safe.find((level) => level.index === requested) || safe[safe.length - 1];
}

export function detectMax3dTextureSize(): number {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2");
    if (!gl) return 0;
    const size = Number(gl.getParameter(gl.MAX_3D_TEXTURE_SIZE));
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return Number.isFinite(size) && size > 0 ? Math.floor(size) : 0;
  } catch {
    return 0;
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KiB`;
  return `${Math.ceil(bytes / (1024 * 1024))} MiB`;
}

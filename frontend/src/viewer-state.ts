import type { ChannelState, LabelState, ProjectionMode, ViewportState } from "./types";

export interface DeepLinkState {
  viewport?: ViewportState;
  z?: number;
  t?: number;
  projection?: ProjectionMode;
  field?: string;
  channels?: Array<Pick<ChannelState, "index" | "visible" | "color" | "low" | "high">>;
  labels?: Array<Pick<LabelState, "id" | "visible" | "opacity" | "mode" | "color">>;
}

function finite(value: unknown, fallback: number, min = -Number.MAX_VALUE, max = Number.MAX_VALUE): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

export function parseDeepLink(search = window.location.search): DeepLinkState {
  const params = new URLSearchParams(search);
  if (params.get("v") !== "1") return {};
  const state: DeepLinkState = {};
  if (params.has("x") || params.has("y") || params.has("zoom")) {
    state.viewport = {
      x: finite(params.get("x"), 0),
      y: finite(params.get("y"), 0),
      zoom: finite(params.get("zoom"), 0, -30, 30),
    };
  }
  if (params.has("z")) state.z = Math.floor(finite(params.get("z"), 0, 0));
  if (params.has("t")) state.t = Math.floor(finite(params.get("t"), 0, 0));
  const projection = params.get("projection");
  if (projection === "mip" || projection === "mean" || projection === "min") state.projection = projection;
  if (params.get("field")) state.field = params.get("field")!;
  for (const [key, target] of [["channels", "channels"], ["labels", "labels"]] as const) {
    const raw = params.get(key);
    if (!raw || raw.length > 20_000) continue;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) (state as Record<string, unknown>)[target] = parsed;
    } catch {
      // Invalid optional state is deliberately ignored.
    }
  }
  return state;
}

export function applyChannelDeepLink(channels: ChannelState[], saved?: DeepLinkState["channels"]): ChannelState[] {
  const byIndex = new Map((saved || []).map((item) => [Number(item.index), item]));
  return channels.map((channel) => {
    const value = byIndex.get(channel.index);
    if (!value) return channel;
    const low = finite(value.low, channel.low, channel.domainMin, channel.domainMax);
    const high = finite(value.high, channel.high, channel.domainMin, channel.domainMax);
    return {
      ...channel,
      visible: typeof value.visible === "boolean" ? value.visible : channel.visible,
      color: /^#[0-9a-f]{6}$/i.test(value.color || "") ? value.color! : channel.color,
      low: Math.min(low, high),
      high: Math.max(low, high),
    };
  });
}

export function applyLabelDeepLink(labels: LabelState[], saved?: DeepLinkState["labels"]): LabelState[] {
  const defaults = new Map(labels.map((item) => [item.id, item]));
  const ordered: LabelState[] = [];
  for (const value of saved || []) {
    const item = defaults.get(String(value.id));
    if (!item) continue;
    ordered.push({
      ...item,
      visible: typeof value.visible === "boolean" ? value.visible : item.visible,
      opacity: finite(value.opacity, item.opacity, 0, 1),
      mode: value.mode === "outline" ? "outline" : "fill",
      color: /^#[0-9a-f]{6}$/i.test(value.color || "") ? value.color : item.color,
    });
    defaults.delete(item.id);
  }
  return [...ordered, ...defaults.values()];
}

export function writeDeepLink(imageId: number, state: Required<Pick<DeepLinkState, "z" | "t">> & DeepLinkState): string {
  const params = new URLSearchParams();
  params.set("image", String(imageId));
  params.set("v", "1");
  if (state.viewport) {
    params.set("x", state.viewport.x.toFixed(2));
    params.set("y", state.viewport.y.toFixed(2));
    params.set("zoom", state.viewport.zoom.toFixed(3));
  }
  params.set("z", String(Math.max(0, Math.floor(state.z))));
  params.set("t", String(Math.max(0, Math.floor(state.t))));
  if (state.projection && state.projection !== "slice") params.set("projection", state.projection);
  if (state.field) params.set("field", state.field);
  if (state.channels) params.set("channels", JSON.stringify(state.channels.map(({ index, visible, color, low, high }) => ({ index, visible, color, low, high }))));
  if (state.labels) params.set("labels", JSON.stringify(state.labels.map(({ id, visible, opacity, mode, color }) => ({ id, visible, opacity, mode, ...(color ? { color } : {}) }))));
  return `${window.location.pathname}?${params.toString()}`;
}

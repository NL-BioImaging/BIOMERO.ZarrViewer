import type { ChannelState, LabelState, ProjectionMode, RenderMode, RoiBounds, ViewportState, VolumeBlendMode, VolumeCameraState, VolumeRenderer } from "./types";
import type { VolumeView, SlicePlane } from "./VolumeViewControls";
import type { NeuroglancerCamera } from "./neuroglancer-state";

export function defaultVolumeBlend(renderer: VolumeRenderer = "neuroglancer"): VolumeBlendMode {
  return renderer === "neuroglancer" ? "maximum" : "additive";
}

export interface DeepLinkState {
  view?: "field" | "well" | "plate";
  plateField?: number;
  viewport?: ViewportState;
  z?: number;
  t?: number;
  projection?: ProjectionMode;
  renderMode?: RenderMode;
  volumeLevel?: number;
  volumeRenderer?: VolumeRenderer;
  volumeBlend?: VolumeBlendMode;
  volumeBrightness?: number;
  volumeBackground?: string;
  volumeGain?: number;
  volumeCamera?: VolumeCameraState;
  ngCamera?: NeuroglancerCamera;
  volumeView?: VolumeView;
  slicePlane?: SlicePlane;
  field?: string;
  roi?: RoiBounds;
  sourceChannels?: number[];
  labelPath?: string;
  labelChannel?: number;
  labelValue?: number;
  storeUuid?: string;
  overlays?: OverlayDeepLink[];
  channels?: Array<Pick<ChannelState, "index" | "visible" | "color" | "low" | "high">>;
  labels?: Array<Pick<LabelState, "id" | "visible" | "opacity" | "mode" | "color" | "outlineWidth" | "highlightValues">>;
}

export interface OverlayDeepLink {
  labelPath?: string;
  labelChannel?: number;
  values?: number[];
  mode: "outline" | "fill" | "outline-fill";
  color?: string;
  opacity: number;
  outlineWidth: number;
}

function finite(value: unknown, fallback: number, min = -Number.MAX_VALUE, max = Number.MAX_VALUE): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

function positiveInteger(value: string | null): number | undefined {
  return value && /^[1-9]\d*$/.test(value) ? Number(value) : undefined;
}

function safePath(value: string | null): string | undefined {
  if (!value || value.includes("\\") || value.includes("\0")) return undefined;
  const parts = value.split("/");
  return parts.some((part) => part === "..") || value.startsWith("/") ? undefined : value;
}

export function parseDeepLink(search = window.location.search): DeepLinkState {
  const params = new URLSearchParams(search);
  const version = params.get("v");
  if (version !== "1" && version !== "2") return {};
  const state: DeepLinkState = {};
  const ngCamera = params.get("ngCamera");
  if (ngCamera && ngCamera.length < 1000) {
    try {
      const value = JSON.parse(ngCamera);
      if (Array.isArray(value.position) && value.position.length === 3 && value.position.every(Number.isFinite)
        && Array.isArray(value.orientation) && value.orientation.length === 4 && value.orientation.every(Number.isFinite)
        && Number.isFinite(value.scale) && value.scale > 0 && Math.hypot(...value.orientation) > 0) state.ngCamera = {
          position: value.position, orientation: value.orientation, scale: value.scale,
          ...(Number.isFinite(value.crossSectionScale) && value.crossSectionScale > 0 ? { crossSectionScale: value.crossSectionScale } : {}),
        };
    } catch { /* Ignore invalid optional camera state. */ }
  }
  const volumeView = params.get("volumeView");
  if (volumeView === "3d" || volumeView === "slice" || volumeView === "orthogonal") state.volumeView = volumeView;
  const slicePlane = params.get("slicePlane");
  if (slicePlane === "xy" || slicePlane === "xz" || slicePlane === "yz") state.slicePlane = slicePlane;
  const view = params.get("view");
  if (params.has("plateField")) state.plateField = Math.floor(finite(params.get("plateField"),0,0,1535));
  if (view === "field" || view === "well" || view === "plate") state.view = view;
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
  if (params.get("render") === "3d") state.renderMode = "3d";
  if (params.get("viewer3d") === "classic") state.volumeRenderer = "classic";
  if (params.has("brightness3d")) state.volumeBrightness = finite(params.get("brightness3d"), 1, .1, 4);
  if (params.has("gain3d")) state.volumeGain = finite(params.get("gain3d"), -3, -5, 3);
  const background = params.get("background3d");
  if (background && /^#[0-9a-f]{6}$/i.test(background)) state.volumeBackground = background;
  const volumeBlend = params.get("volumeBlend");
  if (volumeBlend === "additive" || volumeBlend === "maximum" || volumeBlend === "minimum") state.volumeBlend = volumeBlend;
  if (params.has("volumeLevel")) state.volumeLevel = Math.floor(finite(params.get("volumeLevel"), 0, 0, 1024));
  if (params.has("orbit") || params.has("tilt") || params.has("zoom3d")) {
    state.volumeCamera = {
      orbit: finite(params.get("orbit"), 0, -360, 360),
      tilt: finite(params.get("tilt"), 0, -90, 90),
      zoom: finite(params.get("zoom3d"), 0, -30, 30),
    };
  }
  const vivSlices = params.get("vivSlices");
  if (vivSlices && vivSlices.length < 1000) {
    try {
      const value = JSON.parse(vivSlices);
      if (Array.isArray(value.position) && value.position.length === 3 && value.position.every((v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1)) {
        state.volumeCamera = { orbit: 0, tilt: 0, zoom: 0, ...state.volumeCamera, slicePosition: value.position,
          sliceZoom: finite(value.zoom, 0, -20, 20) };
      }
    } catch { /* Ignore invalid optional slice state. */ }
  }
  if (params.get("field")) state.field = params.get("field")!;
  const roi = (params.get("roi") || "").split(",");
  if (roi.length === 4 && roi.every((value) => /^\d+$/.test(value))) {
    const [x0, y0, x1, y1] = roi.map(Number);
    if (x1 > x0 && y1 > y0) state.roi = { x0, y0, x1, y1 };
  }
  const sourceChannels = (params.get("sourceChannels") || "")
    .split(",")
    .filter(Boolean)
    .map((value) => positiveInteger(value));
  if (sourceChannels.length && sourceChannels.every((value) => value != null)) {
    state.sourceChannels = [...new Set(sourceChannels as number[])].slice(0, 4);
  }
  state.labelPath = safePath(params.get("labelPath"));
  state.labelChannel = positiveInteger(params.get("labelChannel"));
  state.labelValue = positiveInteger(params.get("labelValue"));
  if (version === "2") {
    const raw = params.get("overlays");
    if (raw && raw.length <= 20_000) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          state.overlays = parsed.slice(0, 8).flatMap((item): OverlayDeepLink[] => {
            if (!item || typeof item !== "object") return [];
            const record = item as Record<string, unknown>;
            const labelPath = safePath(typeof record.labelPath === "string" ? record.labelPath : null);
            const labelChannel = positiveInteger(record.labelChannel == null ? null : String(record.labelChannel));
            if (Boolean(labelPath) === Boolean(labelChannel)) return [];
            const rawValues: unknown[] = Array.isArray(record.values) ? record.values : [];
            const values: number[] = [...new Set(rawValues.map((value: unknown) => positiveInteger(String(value))).filter((value: number | undefined): value is number => value != null))].slice(0, 8);
            const mode: OverlayDeepLink["mode"] = record.mode === "fill" || record.mode === "outline-fill" ? record.mode : "outline";
            const color = typeof record.color === "string" && /^#[0-9a-f]{6}$/i.test(record.color) ? record.color : undefined;
            return [{
              ...(labelPath ? { labelPath } : { labelChannel }),
              ...(values.length ? { values } : {}),
              mode,
              color,
              opacity: finite(record.opacity, mode === "fill" ? 0.3 : 1, 0, 1),
              outlineWidth: Math.floor(finite(record.outlineWidth, 2, 1, 20)),
            }];
          });
        }
      } catch {
        // Invalid optional overlay state is deliberately ignored.
      }
    }
  }
  const storeUuid = params.get("storeUuid");
  if (storeUuid && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(storeUuid)) {
    state.storeUuid = storeUuid.toLowerCase();
  }
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

export function applySourceChannels(channels: ChannelState[], sourceChannels?: number[]): ChannelState[] {
  if (!sourceChannels?.length) return channels;
  const selected = new Set(sourceChannels.map((value) => value - 1));
  return channels.map((channel) => ({ ...channel, visible: selected.has(channel.index) }));
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
      outlineWidth: Math.floor(finite(value.outlineWidth, item.outlineWidth || 2, 1, 20)),
      highlightValues: Array.isArray(value.highlightValues)
        ? [...new Set(value.highlightValues.map((item) => Math.floor(finite(item, 0, 0))).filter(Boolean))].slice(0, 8)
        : item.highlightValues,
    });
    defaults.delete(item.id);
  }
  return [...ordered, ...defaults.values()];
}

export function writeDeepLink(imageId: number, state: Required<Pick<DeepLinkState, "z" | "t">> & DeepLinkState): string {
  const params = new URLSearchParams();
  params.set("image", String(imageId));
  params.set("v", "2");
  if (state.view && state.view !== "field") params.set("view", state.view);
  if (state.plateField != null) params.set("plateField",String(Math.max(0,Math.floor(state.plateField))));
  if (state.viewport) {
    params.set("x", state.viewport.x.toFixed(2));
    params.set("y", state.viewport.y.toFixed(2));
    params.set("zoom", state.viewport.zoom.toFixed(3));
  }
  params.set("z", String(Math.max(0, Math.floor(state.z))));
  params.set("t", String(Math.max(0, Math.floor(state.t))));
  if (state.projection && state.projection !== "slice") params.set("projection", state.projection);
  if (state.renderMode === "3d") params.set("render", "3d");
  if (state.volumeRenderer === "classic") params.set("viewer3d", "classic");
  if (state.volumeBrightness != null && state.volumeBrightness !== 1) params.set("brightness3d", String(state.volumeBrightness));
  if (state.volumeGain != null && state.volumeGain !== -3) params.set("gain3d", String(state.volumeGain));
  if (state.volumeBackground && state.volumeBackground !== "#030406") params.set("background3d", state.volumeBackground);
  if (state.volumeView && state.volumeView !== "3d") params.set("volumeView", state.volumeView);
  if (state.slicePlane && state.slicePlane !== "xy") params.set("slicePlane", state.slicePlane);
  if (state.ngCamera) params.set("ngCamera", JSON.stringify(state.ngCamera));
  if (state.volumeBlend) params.set("volumeBlend", state.volumeBlend);
  if (state.renderMode === "3d" && state.volumeLevel != null) params.set("volumeLevel", String(Math.max(0, Math.floor(state.volumeLevel))));
  if (state.renderMode === "3d" && state.volumeCamera) {
    if (state.volumeCamera.slicePosition) params.set("vivSlices", JSON.stringify({ position: state.volumeCamera.slicePosition, zoom: state.volumeCamera.sliceZoom || 0 }));
    params.set("orbit", state.volumeCamera.orbit.toFixed(2));
    params.set("tilt", state.volumeCamera.tilt.toFixed(2));
    params.set("zoom3d", state.volumeCamera.zoom.toFixed(3));
  }
  if (state.field) params.set("field", state.field);
  if (state.roi) params.set("roi", [state.roi.x0, state.roi.y0, state.roi.x1, state.roi.y1].join(","));
  if (state.sourceChannels?.length) params.set("sourceChannels", state.sourceChannels.join(","));
  if (state.labelPath) params.set("labelPath", state.labelPath);
  if (state.labelChannel != null) params.set("labelChannel", String(state.labelChannel));
  if (state.labelValue != null) params.set("labelValue", String(state.labelValue));
  if (state.storeUuid) params.set("storeUuid", state.storeUuid);
  if (state.overlays?.length) params.set("overlays", JSON.stringify(state.overlays.slice(0, 8)));
  if (state.channels) params.set("channels", JSON.stringify(state.channels.map(({ index, visible, color, low, high }) => ({ index, visible, color, low, high }))));
  if (state.labels) params.set("labels", JSON.stringify(state.labels.map(({ id, visible, opacity, mode, color, outlineWidth, highlightValues }) => ({ id, visible, opacity, mode, outlineWidth, ...(color ? { color } : {}), ...(highlightValues?.length ? { highlightValues } : {}) }))));
  return `${window.location.pathname}?${params.toString()}`;
}

export function fitRoiViewport(roi: RoiBounds, width: number, height: number): ViewportState {
  const roiWidth = Math.max(1, roi.x1 - roi.x0);
  const roiHeight = Math.max(1, roi.y1 - roi.y0);
  const scale = Math.max(Number.EPSILON, Math.min(width / roiWidth, height / roiHeight) * 0.9);
  return {
    x: (roi.x0 + roi.x1) / 2,
    y: (roi.y0 + roi.y1) / 2,
    zoom: Math.max(-30, Math.min(30, Math.log2(scale))),
  };
}

export type VectorItem = {
  kind: "point" | "line";
  x: number;
  y: number;
  x2?: number;
  y2?: number;
  t: number;
  z: number;
  color: string;
  radius?: number;
  width?: number;
  dashed?: boolean;
  trail?: boolean;
};

export interface VectorOverlay { version: 1; items: VectorItem[] }

export const VECTOR_CAPABILITY = "zarr-vector-overlay-v1";
const MAX_FRAGMENT = 16_384;
const MAX_ITEMS = 256;
const COLOR = /^#[0-9a-f]{6}$/i;

function coordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1_000_000_000;
}

function index(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

export function validateVectorOverlay(value: unknown): VectorOverlay {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Vector overlay must be an object");
  const input = value as Record<string, unknown>;
  if (input.version !== 1 || !Array.isArray(input.items) || input.items.length > MAX_ITEMS) {
    throw new Error("Unsupported or oversized vector overlay");
  }
  const items = input.items.map((value): VectorItem => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid vector item");
    const item = value as Record<string, unknown>;
    if (item.kind !== "point" && item.kind !== "line") throw new Error("Invalid vector kind");
    if (!coordinate(item.x) || !coordinate(item.y) || !index(item.t) || !index(item.z)) {
      throw new Error("Invalid vector coordinates or plane");
    }
    if (item.kind === "line" && (!coordinate(item.x2) || !coordinate(item.y2))) {
      throw new Error("Invalid vector line endpoint");
    }
    if (typeof item.color !== "string" || !COLOR.test(item.color)) throw new Error("Invalid vector color");
    const size = item.kind === "point" ? item.radius ?? 4 : item.width ?? 2;
    if (typeof size !== "number" || !Number.isFinite(size) || size < 1 || size > 20) {
      throw new Error("Invalid vector marker size");
    }
    return {
      kind: item.kind,
      x: item.x,
      y: item.y,
      ...(item.kind === "line" ? { x2: item.x2 as number, y2: item.y2 as number, width: size } : { radius: size }),
      t: item.t,
      z: item.z,
      color: item.color,
      ...(item.dashed === true ? { dashed: true } : {}),
      ...(item.trail === true ? { trail: true } : {}),
    };
  });
  const result: VectorOverlay = { version: 1, items };
  if (JSON.stringify(result).length > MAX_FRAGMENT) throw new Error("Vector overlay exceeds 16 KiB");
  return result;
}

export function parseVectorFragment(hash: string): VectorOverlay | undefined {
  if (!hash.startsWith("#")) return undefined;
  const raw = new URLSearchParams(hash.slice(1)).get("vectors");
  if (!raw || raw.length > MAX_FRAGMENT) return undefined;
  try { return validateVectorOverlay(JSON.parse(raw)); } catch { return undefined; }
}

export function vectorFragment(value?: VectorOverlay): string {
  if (!value?.items.length) return "";
  const validated = validateVectorOverlay(value);
  const params = new URLSearchParams();
  params.set("vectors", JSON.stringify(validated));
  const fragment = `#${params.toString()}`;
  if (fragment.length > MAX_FRAGMENT) throw new Error("Vector link fragment exceeds 16 KiB");
  return fragment;
}

export function visibleVectorItems(overlay: VectorOverlay | undefined, t: number, z: number): VectorItem[] {
  return overlay?.items.filter((item) => item.z === z && (item.trail ? item.t <= t : item.t === t)) || [];
}

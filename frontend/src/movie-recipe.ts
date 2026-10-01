export const DEFAULT_MOVIE_FPS = 5;
export const MAX_MOVIE_FRAMES = 600;
export const MAX_MOVIE_BYTES = 256 * 1024 * 1024;
export interface MovieVector {
  kind: 'point' | 'line'; x: number; y: number; x2?: number; y2?: number;
  t: number; z: number; color: string; radius?: number; width?: number; trail?: boolean; dashed?: boolean;
}
export interface MoviePanel {
  field: string; roi: [number, number, number, number]; sourceChannels: number[]; t: number; z: number;
  title?: string; scaleBar?: boolean; projection?: 'slice' | 'mip' | 'mean' | 'min';
  channelSettings?: Array<{ index: number; color: string; low: number; high: number }>;
  overlays: Array<{ labelPath?: string; labelChannel?: number; values?: number[]; mode: 'outline' | 'fill' | 'outline-fill'; color?: string; opacity: number; outlineWidth: number }>;
  vectors?: { version: 1; items: MovieVector[] };
  tracks?: { rows: Record<string, unknown>[]; columns: { id: string; x: string; y: string; t: string; z?: string }; color?: string };
}
export interface MovieRecipe {
  version?: 2; storeUuid?: string; sourceBinding?: string; source?: { kind: "current-image" }; filename?: string; title?: string; panels: MoviePanel[];
  sequence: { version: 1; start: number; end: number; step?: number; fps?: number; maxBytes?: number; trailFrames?: number };
}

export function visibleMovieCrop(width: number, height: number, viewport?: { x: number; y: number; zoom: number },
  screen = { width, height }): [number, number, number, number] {
  if (!viewport) return [0, 0, width, height];
  const halfWidth = screen.width / 2 / Math.pow(2, viewport.zoom), halfHeight = screen.height / 2 / Math.pow(2, viewport.zoom);
  return [Math.min(width, Math.max(0, Math.floor(viewport.x - halfWidth))), Math.min(height, Math.max(0, Math.floor(viewport.y - halfHeight))),
    Math.max(0, Math.min(width, Math.ceil(viewport.x + halfWidth))), Math.max(0, Math.min(height, Math.ceil(viewport.y + halfHeight)))];
}
export function movieSequence(recipe: MovieRecipe, sizeT?: number) {
  const value = recipe.sequence;
  const fps = value?.fps ?? DEFAULT_MOVIE_FPS, step = value?.step ?? 1;
  if (value?.version !== 1 || !Number.isInteger(value.start) || !Number.isInteger(value.end) || value.start < 0 || value.end < value.start ||
      !Number.isInteger(step) || step < 1 || !Number.isFinite(fps) || fps <= 0 || fps > 60 || sizeT != null && value.end >= sizeT)
    throw new Error('Choose a valid frame range and playback speed (up to 60 FPS).');
  const frames = Math.floor((value.end - value.start) / step) + 1;
  if (frames > MAX_MOVIE_FRAMES) throw new Error(`Select at most ${MAX_MOVIE_FRAMES} frames.`);
  const maxBytes = value.maxBytes ?? MAX_MOVIE_BYTES;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_MOVIE_BYTES) throw new Error('Invalid movie size limit.');
  if (!recipe.panels || recipe.panels.length !== 1) throw new Error('A movie requires one field and crop.');
  const panel = recipe.panels[0], [x0, y0, x1, y1] = panel.roi || [];
  if (recipe.version != null && recipe.version !== 2) throw new Error('Unsupported movie recipe version.');
  if ('timeProjection' in panel && panel.timeProjection) throw new Error('Temporal projections remain PNG/SVG outputs; movies use individual frames or a Z projection.');
  if (![x0, y0, x1, y1].every(v => Number.isSafeInteger(v) && v >= 0) || x1 <= x0 || y1 <= y0 || x1 - x0 > 2048 || y1 - y0 > 2048)
    throw new Error('Choose a crop of at most 2048 × 2048 pixels.');
  if (!Number.isSafeInteger(panel.z) || panel.z < 0 || !panel.sourceChannels?.length || panel.sourceChannels.length > 4 ||
      panel.sourceChannels.some(c => !Number.isInteger(c) || c < 1) || !Array.isArray(panel.overlays) || panel.overlays.length > 8)
    throw new Error('Invalid movie channels, labels, or Z plane.');
  if (!panel.field || panel.field.startsWith('/') || panel.field.includes('\\') || panel.field.split('/').includes('..')) throw new Error('Invalid field path.');
  if (panel.projection && !['slice', 'mip', 'mean', 'min'].includes(panel.projection)) throw new Error('Invalid Z projection.');
  for (const overlay of panel.overlays) {
    if (!['fill', 'outline', 'outline-fill'].includes(overlay.mode) || !Number.isFinite(overlay.opacity) || overlay.opacity < 0 || overlay.opacity > 1 ||
        !Number.isInteger(overlay.outlineWidth) || overlay.outlineWidth < 1 || overlay.outlineWidth > 20 ||
        overlay.values?.some(v => !Number.isSafeInteger(v) || v < 0)) throw new Error('Invalid label style.');
  }
  const trailFrames = value.trailFrames ?? 10;
  if (!Number.isInteger(trailFrames) || trailFrames < 0 || trailFrames > MAX_MOVIE_FRAMES) throw new Error('Invalid track trail length.');
  return { fps, step, frames, maxBytes, trailFrames, width: x1 - x0, height: y1 - y0 };
}

/** Explicit mappings only. A missing timepoint is a gap, never an interpolated link. */
export function mappedTrackVectors(panel: MoviePanel): MovieVector[] {
  const mapping = panel.tracks;
  if (!mapping) return panel.vectors?.items || [];
  if (!Array.isArray(mapping.rows) || mapping.rows.length > 10000) throw new Error('Track table is limited to 10,000 observations.');
  const groups = new Map<string, Array<{ x: number; y: number; t: number; z: number }>>();
  for (const row of mapping.rows) {
    const id = row[mapping.columns.id], x = row[mapping.columns.x], y = row[mapping.columns.y], t = row[mapping.columns.t];
    const z = mapping.columns.z ? row[mapping.columns.z] : panel.z;
    if (id == null || typeof id === 'string' && !id.trim() || (typeof id !== 'string' && typeof id !== 'number') || typeof x !== 'number' || typeof y !== 'number' ||
        !Number.isFinite(x) || !Number.isFinite(y) || !Number.isInteger(t) || Number(t) < 0 || !Number.isInteger(z) || Number(z) < 0)
      throw new Error('Track mapping requires valid IDs, numeric pixel coordinates, and zero-based frame/Z indices.');
    const key = String(id), observations = groups.get(key) || [];
    observations.push({ x, y, t: Number(t), z: Number(z) }); groups.set(key, observations);
  }
  const result: MovieVector[] = [...(panel.vectors?.items || [])];
  for (const [id, observations] of groups) {
    observations.sort((a, b) => a.t - b.t);
    let hash = 2166136261; for (const c of id) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
    const colors = ['#00FFFF', '#FF00FF', '#FFFF00', '#FF5555', '#55FF55', '#5599FF'];
    const color = mapping.color || colors[(hash >>> 0) % colors.length];
    observations.forEach((point, i) => {
      if (i && observations[i - 1].t === point.t) throw new Error('A track has duplicate observations at one frame.');
      result.push({ kind: 'point', ...point, color, radius: 3 });
      const previous = observations[i - 1];
      if (previous && previous.t + 1 === point.t && previous.z === point.z)
        result.push({ kind: 'line', ...previous, x2: point.x, y2: point.y, t: point.t, color, trail: true, width: 2 });
    });
  }
  return result;
}

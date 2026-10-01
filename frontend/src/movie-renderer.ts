import { dtypeDomain } from "./channel-scaling";
import { loadOmeZarrFromStore } from '@hms-dbmi/viv';
import { AuthenticatedZarrStore, PrefixStore } from './authenticated-store';
import { fetchCapabilities } from './api';
import { projectLoader } from './projection-loader';
import { mappedTrackVectors, movieSequence, type MoviePanel, type MovieRecipe, type MovieVector } from './movie-recipe';
import type { Capability } from './types';

const axisSize = (source: any, axis: string) => {
  const index = source.labels.indexOf(axis); return index < 0 ? 1 : Number(source.shape[index]);
};
const safePath = (path: string) => {
  if (!path || path.startsWith('/') || path.includes('\\') || path.split('/').includes('..')) throw new Error('Invalid label path.');
  return path;
};
const rgb = (color: string) => {
  if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error('Invalid overlay color.');
  return [1, 3, 5].map(offset => parseInt(color.slice(offset, offset + 2), 16));
};

/** Only the requested native-pixel tiles are read, one at a time. */
export async function cropPlane(source: any, roi: number[], c: number, z: number, t: number, signal: AbortSignal): Promise<Float64Array> {
  const [x0, y0, x1, y1] = roi;
  if (x1 > axisSize(source, 'x') || y1 > axisSize(source, 'y') || c >= axisSize(source, 'c') || source.labels.includes('z') && z >= axisSize(source, 'z') || source.labels.includes('t') && t >= axisSize(source, 't'))
    throw new Error('Movie crop, channel, or frame is outside the source image.');
  const selection: Record<string, number> = {};
  for (const [axis, value] of Object.entries({ c, z, t })) if (source.labels.includes(axis)) selection[axis] = value;
  const width = x1 - x0, tileSize = Math.max(1, Number(source.tileSize) || 256);
  const result = new Float64Array(width * (y1 - y0));
  for (let tileY = Math.floor(y0 / tileSize); tileY <= Math.floor((y1 - 1) / tileSize); tileY++) {
    for (let tileX = Math.floor(x0 / tileSize); tileX <= Math.floor((x1 - 1) / tileSize); tileX++) {
      signal.throwIfAborted();
      const tile = await source.getTile({ x: tileX, y: tileY, selection, signal });
      signal.throwIfAborted();
      for (let y = Math.max(y0, tileY * tileSize); y < Math.min(y1, tileY * tileSize + tile.height); y++) {
        for (let x = Math.max(x0, tileX * tileSize); x < Math.min(x1, tileX * tileSize + tile.width); x++) {
          result[(y - y0) * width + x - x0] = Number(tile.data[(y - tileY * tileSize) * tile.width + x - tileX * tileSize]);
        }
      }
    }
  }
  return result;
}

export function composeLabels(pixels: Uint8ClampedArray, plane: Float64Array, width: number, height: number,
  overlay: MoviePanel['overlays'][number], padded?: { plane: Float64Array; width: number; offsetX: number; offsetY: number }) {
  const color = overlay.color ? rgb(overlay.color) : undefined;
  const selected = overlay.values?.length ? new Set(overlay.values) : null;
  const at = (x: number, y: number) => padded
    ? x + padded.offsetX < 0 || x + padded.offsetX >= padded.width || y + padded.offsetY < 0 || y + padded.offsetY >= padded.plane.length / padded.width
      ? 0 : padded.plane[(y + padded.offsetY) * padded.width + x + padded.offsetX]
    : x < 0 || y < 0 || x >= width || y >= height ? 0 : plane[y * width + x];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const value = plane[y * width + x];
    if (!Number.isSafeInteger(value)) throw new Error("Label identifiers exceed the supported integer range.");
    if (!value || selected && !selected.has(value)) continue;
    const r = overlay.outlineWidth;
    const edge = at(x - r, y) !== value || at(x + r, y) !== value || at(x, y - r) !== value || at(x, y + r) !== value;
    if (overlay.mode === 'outline' && !edge) continue;
    const opacity = overlay.mode === 'outline-fill' && edge ? 1 : overlay.opacity;
    const category = color || rgb(['#00FFFF', '#FF00FF', '#FFFF00', '#FF5555', '#55FF55', '#5599FF'][Math.abs(Math.round(value)) % 6]);
    const offset = (y * width + x) * 4;
    for (let channel = 0; channel < 3; channel++) pixels[offset + channel] = pixels[offset + channel] * (1 - opacity) + category[channel] * opacity;
  }
}

export function drawMovieVectors(context: OffscreenCanvasRenderingContext2D, vectors: MovieVector[], panel: MoviePanel, t: number, trail: number) {
  for (const vector of vectors) {
    if (!['point', 'line'].includes(vector.kind) || ![vector.x, vector.y, vector.t, vector.z].every(Number.isFinite) ||
        !Number.isInteger(vector.t) || !Number.isInteger(vector.z)) throw new Error('Invalid temporal overlay.');
    rgb(vector.color);
    if (vector.z !== panel.z || (vector.trail ? vector.t > t || vector.t < t - trail : vector.t !== t)) continue;
    const size = vector.kind === 'point' ? vector.radius ?? 3 : vector.width ?? 2;
    if (!Number.isFinite(size) || size < 1 || size > 20) throw new Error('Invalid vector size.');
    context.strokeStyle = vector.color; context.fillStyle = vector.color; context.lineWidth = size;
    context.setLineDash(vector.dashed ? [4, 3] : []);
    context.beginPath();
    if (vector.kind === 'point') { context.arc(vector.x - panel.roi[0], vector.y - panel.roi[1], size, 0, 2 * Math.PI); context.fill(); }
    else {
      if (!Number.isFinite(vector.x2) || !Number.isFinite(vector.y2)) throw new Error('Invalid line coordinates.');
      context.moveTo(vector.x - panel.roi[0], vector.y - panel.roi[1]); context.lineTo(vector.x2! - panel.roi[0], vector.y2! - panel.roi[1]); context.stroke();
    }
  }
}

function drawScale(context: OffscreenCanvasRenderingContext2D, capability: Capability, width: number, height: number) {
  const x = capability.axes.findIndex(axis => axis.name === 'x');
  const transformation = capability.datasets?.[0]?.coordinate_transformations?.find((item: any) => item.type === 'scale') as any;
  const scale = Number(transformation?.scale?.[x]);
  const unit = capability.axes[x]?.unit;
  if (!Number.isFinite(scale) || scale <= 0 || !unit || width < 48 || height < 32) return;
  const target = scale * width / 5, power = 10 ** Math.floor(Math.log10(target));
  const length = Math.max(...[1, 2, 5, 10].filter(value => value * power <= target)) * power;
  const label = `${length.toPrecision(2).replace(/\.0$/, '')} ${unit === 'micrometer' ? 'µm' : unit}`;
  context.font = '10px sans-serif'; const textWidth = context.measureText(label).width;
  if (textWidth > width - 12) return;
  const end = width - 8, start = end - length / scale;
  context.strokeStyle = '#FFFFFF'; context.fillStyle = '#FFFFFF'; context.lineWidth = 2;
  context.beginPath(); context.moveTo(start, height - 8); context.lineTo(end, height - 8); context.stroke();
  context.fillText(label, Math.max(4, Math.min(start, width - textWidth - 4)), height - 14);
}

export async function prepareMovie(imageId: number, recipe: MovieRecipe, signal: AbortSignal) {
  movieSequence(recipe);
  if (JSON.stringify(recipe).length > 1024 * 1024) throw new Error('Movie recipe exceeds 1 MiB. Use a smaller bounded track table.');
  const capability = await fetchCapabilities(imageId);
  if (recipe.storeUuid ? capability.store.uuid?.toLowerCase() !== recipe.storeUuid.toLowerCase()
      : !recipe.sourceBinding || recipe.sourceBinding !== capability.store.binding_digest)
    throw new Error('The movie references a different image store.');
  const panel = recipe.panels[0];
  const store = new AuthenticatedZarrStore(capability, async () => {
    const fresh = await fetchCapabilities(imageId);
    if (fresh.store.uuid !== capability.store.uuid || capability.store.binding_digest && fresh.store.binding_digest !== capability.store.binding_digest)
      throw new Error('The source image changed during export. Create the movie again.');
    return fresh;
  });
  const image = await loadOmeZarrFromStore(new PrefixStore(store.store, panel.field) as any);
  const sequence = movieSequence(recipe, axisSize(image.data[0], 't'));
  const imageSource = projectLoader(image.data, panel.projection || 'slice')[0];
  const overlays: Array<{ overlay: MoviePanel["overlays"][number]; source: any; channel: number }> = [];
  for (const overlay of panel.overlays) {
    signal.throwIfAborted();
    let loader = image.data, channel = (overlay.labelChannel || 1) - 1;
    if (overlay.labelPath) {
      const path = safePath(overlay.labelPath);
      const known = capability.labels.some(label => {
        const mapped = capability.initial_path === '.' ? label.path : panel.field + label.path.slice(capability.initial_path.length);
        return path === label.path || path === mapped;
      });
      if (!known) throw new Error('The requested label layer is not available in this store.');
      loader = (await loadOmeZarrFromStore(new PrefixStore(store.store, path) as any)).data; channel = 0;
    } else if (!overlay.labelChannel) throw new Error('Choose an available label layer.');
    if (axisSize(loader[0], 'x') !== axisSize(image.data[0], 'x') || axisSize(loader[0], 'y') !== axisSize(image.data[0], 'y'))
      throw new Error('This label layer has a different pixel grid. Align it with the source image before exporting.');
    overlays.push({ overlay, source: loader[0], channel });
  }
  const vectors = mappedTrackVectors(panel);
  const channelSettings = panel.sourceChannels.map(c => {
    const metadata = capability.channels[c - 1], requested = panel.channelSettings?.find(item => item.index === c - 1);
    const [minimum, maximum] = dtypeDomain(String(imageSource.dtype));
    return { index: c - 1, low: requested?.low ?? metadata?.window?.start ?? minimum,
      high: requested?.high ?? metadata?.window?.end ?? maximum, color: requested?.color || metadata?.color || '#FFFFFF' };
  });
  const canvas = new OffscreenCanvas(sequence.width, sequence.height), context = canvas.getContext('2d')!;
  return { sequence, async frame(t: number): Promise<ImageData> {
    const pixels = new Uint8ClampedArray(sequence.width * sequence.height * 4);
    for (let i = 3; i < pixels.length; i += 4) pixels[i] = 255;
    const summed = new Float32Array(sequence.width * sequence.height * 3);
    for (const c of panel.sourceChannels) {
      const data = await cropPlane(imageSource, panel.roi, c - 1, panel.z, t, signal);
      const settings = channelSettings.find(item => item.index === c - 1)!;
      const { low, high } = settings;
      const color = rgb(settings.color);
      if (!Number.isFinite(low) || !Number.isFinite(high) || high <= low) throw new Error('Invalid channel contrast.');
      for (let i = 0; i < data.length; i++) {
        const intensity = Math.max(0, Math.min(1, (data[i] - low) / (high - low)));
        for (let component = 0; component < 3; component++) summed[i * 3 + component] += intensity * color[component];
      }
    }
    for (let i = 0; i < summed.length / 3; i++) for (let c = 0; c < 3; c++) pixels[i * 4 + c] = Math.min(255, summed[i * 3 + c]);
    for (const { overlay, source, channel } of overlays) {
      const [x0, y0, x1, y1] = panel.roi, radius = overlay.outlineWidth;
      const bounds = [Math.max(0, x0 - radius), Math.max(0, y0 - radius), Math.min(axisSize(source, 'x'), x1 + radius), Math.min(axisSize(source, 'y'), y1 + radius)];
      const padded = await cropPlane(source, bounds, channel, panel.z, t, signal);
      const plane = new Float64Array(sequence.width * sequence.height), paddedWidth = bounds[2] - bounds[0];
      for (let y = 0; y < sequence.height; y++) for (let x = 0; x < sequence.width; x++) plane[y * sequence.width + x] = padded[(y + y0 - bounds[1]) * paddedWidth + x + x0 - bounds[0]];
      composeLabels(pixels, plane, sequence.width, sequence.height, overlay, { plane: padded, width: paddedWidth, offsetX: x0 - bounds[0], offsetY: y0 - bounds[1] });
    }
    context.putImageData(new ImageData(pixels, sequence.width, sequence.height), 0, 0);
    drawMovieVectors(context, vectors, panel, t, sequence.trailFrames);
    if (panel.scaleBar !== false) drawScale(context, capability, sequence.width, sequence.height);
    return context.getImageData(0, 0, sequence.width, sequence.height);
  }, canvas, provenance: { application: 'biomero-zarr-viewer', viewerVersion: capability.viewer_version || 'unknown', rendererVersion: 'browser-movie-v1',
    storeUuid: capability.store.uuid, sourceBinding: capability.store.binding_digest, omeroImageId: imageId, createdAt: new Date().toISOString(), codec: 'avc', container: 'mp4', resolvedChannelSettings: channelSettings, recipe, fps: sequence.fps, frameCount: sequence.frames,
    width: sequence.width, height: sequence.height, encodedWidth: sequence.width + sequence.width % 2,
    encodedHeight: sequence.height + sequence.height % 2, padding: 'black on right/bottom for odd dimensions',
    axes: capability.axes, coordinateTransformations: capability.datasets?.[0]?.coordinate_transformations, acquisitionTiming: 'source metadata; playback FPS is independent' } };
}

export async function exportMovie(imageId: number, recipe: MovieRecipe, signal: AbortSignal, progress: (completed: number, total: number) => void) {
  const prepared = await prepareMovie(imageId, recipe, signal);
  signal.throwIfAborted();
  const worker = new Worker(new URL('./movie-encoder.worker.ts', import.meta.url), { type: 'module' });
  let id = 0;
  const pending = new Map<number, { resolve: (value: any) => void; reject: (reason: Error) => void }>();
  const request = (type: string, value: unknown = null, transfer: Transferable[] = []) => new Promise<any>((resolve, reject) => {
    const key = ++id; pending.set(key, { resolve, reject }); worker.postMessage({ id: key, type, value }, transfer);
  });
  worker.onmessage = event => {
    const item = pending.get(event.data.id); if (!item) return; pending.delete(event.data.id);
    if (event.data.error) item.reject(new Error(event.data.error)); else item.resolve(event.data.value);
  };
  const abort = () => {
    worker.terminate();
    for (const item of pending.values()) item.reject(new DOMException('Movie export stopped.', 'AbortError'));
    pending.clear();
  };
  worker.onerror = event => { for (const item of pending.values()) item.reject(new Error(event.message || 'Movie encoder failed.')); pending.clear(); };
  signal.addEventListener('abort', abort, { once: true });
  try {
    await request('start', prepared.sequence);
    let poster: ArrayBuffer | undefined;
    for (let index = 0; index < prepared.sequence.frames; index++) {
      signal.throwIfAborted();
      const frame = await prepared.frame(recipe.sequence.start + index * prepared.sequence.step);
      if (index === 0) poster = await (await prepared.canvas.convertToBlob({ type: 'image/png' })).arrayBuffer();
      await request('frame', { data: frame.data.buffer, width: frame.width, height: frame.height, index }, [frame.data.buffer]);
      progress(index + 1, prepared.sequence.frames);
    }
    const data: ArrayBuffer = await request('finish'); signal.throwIfAborted();
    return { data, poster: poster!, provenance: prepared.provenance };
  } finally { signal.removeEventListener('abort', abort); worker.terminate(); pending.clear(); }
}

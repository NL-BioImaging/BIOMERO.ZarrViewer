import { mappedTrackVectors, movieSequence, type MovieRecipe } from './movie-recipe';
import { composeLabels, cropPlane } from './movie-renderer';

const recipe = (): MovieRecipe => ({ storeUuid: 'a2aa135b-9c87-4455-bb12-34a86e3fe237', sequence: { version: 1, start: 0, end: 18 },
  panels: [{ field: '.', roi: [0, 0, 4, 4], sourceChannels: [1], t: 18, z: 0, overlays: [] }] });
test('movie defaults to 5 FPS and validates actual frame count and bounds', () => {
  expect(movieSequence(recipe(), 19)).toMatchObject({ fps: 5, frames: 19 });
  expect(() => movieSequence(recipe(), 10)).toThrow('range');
  const value = recipe(); value.sequence.end = 600;
  expect(() => movieSequence(value)).toThrow('600');
  value.sequence.end = 5; value.sequence.step = 2;
  expect(movieSequence(value).frames).toBe(3);
});
test('tracks preserve IDs, stable colors and gaps without interpolation', () => {
  const panel = recipe().panels[0];
  panel.tracks = { columns: { id: 'id', x: 'px', y: 'py', t: 'frame' }, rows: [
    { id: '001', px: 1, py: 2, frame: 0 }, { id: '001', px: 2, py: 3, frame: 1 }, { id: '001', px: 4, py: 3, frame: 3 }
  ] };
  const vectors = mappedTrackVectors(panel);
  expect(vectors.filter(v => v.kind === 'point')).toHaveLength(3);
  expect(vectors.filter(v => v.kind === 'line')).toHaveLength(1);
  expect(new Set(vectors.map(v => v.color)).size).toBe(1);
});
test('overlapping label layers composite in declaration order', () => {
  const pixels = new Uint8ClampedArray([0, 0, 0, 255]);
  const style = { mode: 'fill' as const, opacity: 0.5, outlineWidth: 1 };
  composeLabels(pixels, new Float64Array([1]), 1, 1, { ...style, color: '#FF0000' });
  composeLabels(pixels, new Float64Array([7]), 1, 1, { ...style, color: '#00FF00' });
  expect(Array.from(pixels)).toEqual([64, 128, 0, 255]);
});
test('native-pixel crop aligns across tile boundaries and loading is bounded', async () => {
  let active = 0, peak = 0;
  const source = { labels: ['t', 'c', 'z', 'y', 'x'], shape: [2, 1, 1, 4, 4], tileSize: 2,
    async getTile({ x, y }: { x: number; y: number }) {
      active++; peak = Math.max(peak, active); await Promise.resolve(); active--;
      return { width: 2, height: 2, data: new Uint16Array([y*8+x*2, y*8+x*2+1, y*8+x*2+4, y*8+x*2+5]) };
    } };
  expect(Array.from(await cropPlane(source, [1, 1, 4, 3], 0, 0, 1, new AbortController().signal))).toEqual([5, 6, 7, 9, 10, 11]);
  expect(peak).toBe(1);
  const controller = new AbortController(); controller.abort();
  await expect(cropPlane(source, [0, 0, 1, 1], 0, 0, 0, controller.signal)).rejects.toThrow();
});

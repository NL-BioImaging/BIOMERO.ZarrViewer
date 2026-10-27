import { mappedTrackVectors, validateMovieGeometry, movieUsesImageInput, movieSequence, type MovieRecipe } from './movie-recipe';
import { calibratedLabelCrop, composeLabels, cropPlane } from './movie-renderer';
import { labelIdColor } from './label-color';

const recipe = (): MovieRecipe => ({ storeUuid: 'a2aa135b-9c87-4455-bb12-34a86e3fe237', sequence: { version: 1, start: 0, end: 18 },
  panels: [{ field: '.', roi: [0, 0, 4, 4], sourceChannels: [1], t: 18, z: 0, overlays: [] }] });

test('preserves direct viewer exports carrying a UUID and the legacy current-image marker', () => {
  const value = recipe(); value.source = {kind: 'current-image'};
  expect(movieUsesImageInput(value)).toBe(false);
  delete value.storeUuid;
  expect(movieUsesImageInput(value)).toBe(true);
  value.source = {kind: 'image-input', imageId: 205};
  expect(movieUsesImageInput(value)).toBe(true);
});

test('selected-image overlays need matching geometry, not workflow identity', () => {
  const value = recipe(); delete value.storeUuid;
  value.source = {kind: 'image-input', imageId: 205};
  const size = {x: 20, y: 20, z: 1, t: 19, c: 1};
  value.panels[0].tracks = {columns: {id: 'track', x: 'x', y: 'y', t: 'frame'}, rows: [
    {track: 'a', x: 1, y: 2, frame: 0}, {track: 'a', x: 2, y: 3, frame: 1}]};
  expect(validateMovieGeometry(value, size)).toHaveLength(3);
  for (const row of [{track: 'a', x: 20, y: 2, frame: 0}, {track: 'a', x: 1, y: -1, frame: 0},
                     {track: 'a', x: 1, y: 2, frame: 19}]) {
    value.panels[0].tracks.rows = [row];
    expect(() => validateMovieGeometry(value, size)).toThrow(/do not fit/);
  }
  delete value.panels[0].tracks;
  expect(() => validateMovieGeometry(value, {...size, x: 3})).toThrow(/does not fit/);
  expect(() => validateMovieGeometry(value, {...size, t: 18})).toThrow(/range/);
});
test('movie defaults to 5 FPS and validates actual frame count and bounds', () => {
  expect(movieSequence(recipe(), 19)).toMatchObject({ fps: 5, frames: 19 });
  expect(() => movieSequence(recipe(), 10)).toThrow('range');
  const value = recipe(); value.sequence.end = 1999;
  expect(movieSequence(value).frames).toBe(2000);
  value.sequence.end = 2000;
  expect(() => movieSequence(value)).toThrow('2000');
  value.sequence.end = 3999; value.sequence.step = 2;
  expect(movieSequence(value).frames).toBe(2000);
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

test("viewer-generated movie labels use the live instance hash while explicit and legacy colors remain stable",()=>{
  const pixels=new Uint8ClampedArray(12),style={mode:"fill" as const,opacity:.7,outlineWidth:1,colorMode:"instance" as const};
  composeLabels(pixels,new Float64Array([1,7,4000000001]),3,1,style);
  [1,7,4000000001].forEach((id,i)=>labelIdColor(id).forEach((value,c)=>expect(pixels[i*4+c]).toBeCloseTo(Math.round(value*.7),0)));
  const explicit=new Uint8ClampedArray(4);composeLabels(explicit,new Float64Array([7]),1,1,{...style,color:"#FF0000"});
  expect([...explicit.slice(0,3)]).toEqual([178,0,0]);
});

test("movie label crops align translated and downsampled label grids at voxel centers",async()=>{
  const meta=(size:number,origin:number)=>({physicalSizes:{x:{size,unit:"micrometer"},y:{size,unit:"micrometer"}},physicalOrigin:{x:origin,y:origin}});
  const source={labels:["y","x"],shape:[2,2],tileSize:2,meta:meta(2,2),getTile:async()=>({data:new Uint32Array([1,2,3,4]),width:2,height:2})};
  const result=await calibratedLabelCrop(source,{meta:meta(1,0)},[0,0,6,4],0,0,0,new AbortController().signal);
  expect([...result]).toEqual([0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,2,2,0,0,1,1,2,2]);
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

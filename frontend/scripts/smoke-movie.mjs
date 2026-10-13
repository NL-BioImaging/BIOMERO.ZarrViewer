// Chrome acceptance of the shipped browser renderer, worker encoder, and native MP4 playback.
import { createServer } from 'node:http';
import { existsSync, createReadStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { chromium } from 'playwright-core';

const staticRoot = resolve(import.meta.dirname, '../../src/biomero_zarr_viewer/static/biomero_zarr_viewer');
const evidenceRoot = resolve(import.meta.dirname, '../test-results');
const chrome = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable'].find(path => path && existsSync(path));
if (!chrome) throw new Error('Chrome is required for MP4 acceptance; set CHROME_PATH.');
const uuid = 'a2aa135b-9c87-4455-bb12-34a86e3fe237', width = 33, height = 24, frames = 4;
const axes = ['t', 'c', 'z', 'y', 'x'].map(name => ({ name, type: name === 't' ? 'time' : name === 'c' ? 'channel' : 'space' }));
const labelAxes = axes.filter(axis => axis.name !== 'c');
const fixture = new Map();
const json = value => Buffer.from(JSON.stringify(value));
fixture.set('/data/.zattrs', json({ multiscales: [{ version: '0.4', axes, datasets: [{ path: '0' }] }], omero: { channels: [{ label: 'Intensity', color: 'FFFFFF', window: { start: 0, end: 255 } }] } }));
fixture.set('/data/.zgroup', json({ zarr_format: 2 }));
fixture.set('/data/0/.zarray', json({ zarr_format: 2, shape: [frames, 1, 1, height, width], chunks: [1, 1, 1, height, width], dtype: '|u1', compressor: null, fill_value: 0, order: 'C', filters: null }));
for (let t = 0; t < frames; t++) fixture.set(`/data/0/${t}.0.0.0.0`, Buffer.alloc(width * height, 20 + t * 30));
for (const name of ['red', 'green']) {
  fixture.set(`/data/labels/${name}/.zattrs`, json({ multiscales: [{ version: '0.4', axes: labelAxes, datasets: [{ path: '0' }] }], 'image-label': { version: '0.4' } }));
  fixture.set(`/data/labels/${name}/.zgroup`, json({ zarr_format: 2 }));
  fixture.set(`/data/labels/${name}/0/.zarray`, json({ zarr_format: 2, shape: [frames, 1, height, width], chunks: [1, 1, height, width], dtype: '<u2', compressor: null, fill_value: 0, order: 'C', filters: null }));
  for (let t = 0; t < frames; t++) {
    const data = Buffer.alloc(width * height * 2);
    for (let y = 6; y < 16; y++) for (let x = name === 'red' ? 8 : 11; x < (name === 'red' ? 15 : 18); x++) data.writeUInt16LE(name === 'red' ? 1 : 7, (y * width + x) * 2);
    fixture.set(`/data/labels/${name}/0/${t}.0.0.0`, data);
  }
}
const recipe = { version: 2, storeUuid: uuid, sequence: { version: 1, start: 0, end: frames - 1 }, panels: [{
  field: '.', roi: [0, 0, width, height], sourceChannels: [1], t: frames - 1, z: 0, scaleBar: false,
  overlays: ['red', 'green'].map(name => ({ labelPath: `labels/${name}`, mode: 'fill', color: name === 'red' ? '#FF0000' : '#00FF00', opacity: 0.5, outlineWidth: 1 })),
  tracks: { columns: { id: 'id', x: 'x', y: 'y', t: 't' }, rows: [0, 1, 3].map(t => ({ id: '001', x: 2 + 4*t, y: 3, t })) }
}] };
const capability = { schema_version: 1, supported: true, features: ['zarr-movie-v1'], image: { id: 1, name: 'Synthetic movie' },
  store: { url: '/data/', context: 'movie-fixture-context', uuid, expires_at: '2099-01-01T00:00:00Z' }, kind: 'image', ngff_version: '0.4', zarr_format: 2,
  initial_path: '.', axes, datasets: [{ path: '0' }], channels: [{ index: 0, label: 'Intensity', active: true, color: '#FFFFFF', window: { start: 0, end: 255 } }],
  labels: ['red', 'green'].map(name => ({ id: name, name, path: `labels/${name}`, axes: labelAxes, datasets: [{ path: '0' }] })) };
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://fixture').pathname;
  if (pathname === '/api/images/1/capabilities/') { response.setHeader('Content-Type', 'application/json'); response.end(json(capability)); return; }
  if (pathname.startsWith('/data/')) {
    if (request.headers['x-omero-zarr-context'] !== 'movie-fixture-context') { response.statusCode = 403; response.end(); return; }
    const data = fixture.get(pathname); response.statusCode = data ? 200 : 404; response.end(data); return;
  }
  if (pathname === '/') {
    response.setHeader('Content-Type', 'text/html');
    response.end(`<!doctype html><html><head><title>Chrome MP4 acceptance</title></head><body><h1>Chrome MP4 acceptance</h1>
      <div id="root"></div><script>window.BIOMERO_ZARR_VIEWER={capabilitiesTemplate:'/api/images/0/capabilities/'}</script>
      <script type="module" src="/static/app.js"></script></body></html>`); return;
  }
  if (pathname === '/acceptance') {
    response.setHeader('Content-Type', 'text/html');
    response.end(`<!doctype html><h1>Chrome MP4 playback</h1><p>4 frames · 5 FPS · overlapping labels and a track with a gap</p>
      <video id="movie" controls width="340" style="image-rendering:pixelated"></video><canvas id="poster" width="33" height="24" style="width:330px;image-rendering:pixelated"></canvas>
      <iframe id="renderer" src="/?image=1&movie=1&nonce=fixture" hidden></iframe><pre id="status">Preparing…</pre>
      <script>
        const recipe=${JSON.stringify(recipe)};
        window.addEventListener('message',event=>{
          if(event.origin!==location.origin||event.source!==document.getElementById('renderer').contentWindow||event.data?.source!=='zarr-movie')return;
          if(event.data.type==='ready')event.source.postMessage({source:'analysis-movie',nonce:'fixture',type:'render',recipe},location.origin);
          if(event.data.type==='error')document.getElementById('status').textContent='ERROR: '+event.data.value;
          if(event.data.type==='complete'){
            window.result=event.data.value;
            document.getElementById('movie').src=URL.createObjectURL(new Blob([result.data],{type:'video/mp4'}));
            document.getElementById('status').textContent=JSON.stringify(result.provenance);
            createImageBitmap(new Blob([result.poster],{type:'image/png'})).then(bitmap=>{document.getElementById('poster').getContext('2d').drawImage(bitmap,0,0);bitmap.close()});
          }
        });
      </script>`); return;
  }
  const file = resolve(staticRoot, pathname.replace(/^\/static\//, ''));
  if (!file.startsWith(staticRoot + sep) || !existsSync(file)) { response.statusCode = 404; response.end(); return; }
  response.setHeader('Content-Type', { '.js': 'text/javascript', '.css': 'text/css' }[extname(file)] || 'application/octet-stream');
  createReadStream(file).pipe(response);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: chrome, headless: true });
const context = await browser.newContext(); await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
const page = await context.newPage(), errors = [];
page.on('pageerror', error => errors.push(String(error)));
await mkdir(evidenceRoot, { recursive: true });
try {
  await page.goto(`${origin}/acceptance`);
  await page.waitForFunction(() => window.result || document.getElementById('status').textContent.startsWith('ERROR:'), null, { timeout: 60000 });
  const failure = await page.locator('#status').innerText(); if (failure.startsWith('ERROR:')) throw new Error(failure);
  await page.waitForFunction(() => document.getElementById('movie').readyState >= 2);
  const metadata = await page.evaluate(async () => {
    const video = document.getElementById('movie');
    const seek = time => new Promise(resolve => { video.addEventListener('seeked', resolve, { once: true }); video.currentTime = time; });
    await seek(0.4);
    const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    const context = canvas.getContext('2d'); context.drawImage(video, 0, 0);
    const sought = Array.from(context.getImageData(27, 19, 1, 1).data);
    await video.play(); await new Promise(resolve => video.addEventListener('ended', resolve, { once: true }));
    await seek(0.2); await video.play(); video.pause();
    return { duration: video.duration, width: video.videoWidth, height: video.videoHeight, sought,
      fps: window.result.provenance.fps, frameCount: window.result.provenance.frameCount,
      overlap: Array.from(document.getElementById('poster').getContext('2d').getImageData(12, 10, 1, 1).data) };
  });
  if (metadata.fps !== 5 || metadata.frameCount !== 4 || Math.abs(metadata.duration - 0.8) > 0.02 || metadata.width !== 34 || metadata.height !== 24) throw new Error(`Invalid movie metadata: ${JSON.stringify(metadata)}`);
  if (Math.abs(metadata.sought[0] - 80) > 20) throw new Error(`Seeking showed the wrong frame: ${metadata.sought}`);
  if (!(metadata.overlap[1] > metadata.overlap[0] && metadata.overlap[0] > metadata.overlap[2])) throw new Error(`Overlapping labels were not aligned: ${metadata.overlap}`);
  if (errors.length) throw new Error(errors.join('\n'));
  const encoded = await page.evaluate(() => ({ movie: Array.from(new Uint8Array(window.result.data)), poster: Array.from(new Uint8Array(window.result.poster)) }));
  await writeFile(resolve(evidenceRoot, 'movie-smoke.mp4'), Buffer.from(encoded.movie));
  await writeFile(resolve(evidenceRoot, 'movie-smoke-poster.png'), Buffer.from(encoded.poster));
  await writeFile(resolve(evidenceRoot, 'movie-smoke.json'), JSON.stringify(metadata, null, 2));
  await page.screenshot({ path: resolve(evidenceRoot, 'movie-smoke.png'), fullPage: true });
  console.log(`Chrome movie acceptance passed: ${JSON.stringify(metadata)}`);
} catch (error) {
  await page.screenshot({ path: resolve(evidenceRoot, 'movie-failure.png'), fullPage: true });
  await context.tracing.stop({ path: resolve(evidenceRoot, 'movie-failure-trace.zip') });
  await writeFile(resolve(evidenceRoot, 'movie-errors.txt'), `${String(error)}\n${errors.join('\n')}`);
  throw error;
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }

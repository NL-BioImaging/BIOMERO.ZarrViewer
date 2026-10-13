// Compare the reviewed implementation with bounded projection loading on identical synthetic slices.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import ts from 'typescript';

const root = resolve(import.meta.dirname, '../..');
const versions = {
  reviewed: execFileSync('git', ['show', '3582a87:frontend/src/projection-loader.ts'], { cwd: root, encoding: 'utf8' }),
  bounded: await readFile(resolve(root, 'frontend/src/projection-loader.ts'), 'utf8')
};
const results = {};
for (const [name, code] of Object.entries(versions)) {
  const js = ts.transpile(code, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 });
  const { projectSource } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
  let active = 0, peak = 0;
  const input = { dtype: 'Uint16', labels: ['c', 'z', 'y', 'x'], shape: [1, 64, 128, 128], tileSize: 128,
    async getRaster({ selection }) {
      active++; peak = Math.max(peak, active);
      await new Promise(resolve => setImmediate(resolve));
      active--; return { width: 128, height: 128, data: new Uint16Array(128 * 128).fill(selection.z) };
    } };
  const started = performance.now(), output = await projectSource(input, 'mean').getRaster({ selection: { c: 0 } });
  if (output.data[0] !== 31) throw new Error('Projection numerical result changed');
  results[name] = { elapsedMs: performance.now() - started, peakConcurrentReads: peak,
    decodedSliceBytesAtPeak: peak * 128 * 128 * 2, pixels: output.width * output.height, slices: 64 };
}
await mkdir(resolve(root, 'frontend/test-results'), { recursive: true });
await writeFile(resolve(root, 'frontend/test-results/projection-benchmark.json'), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results));

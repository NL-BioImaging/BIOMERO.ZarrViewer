// Full browser startup measurement; credentials are never written to the report.
// Usage: node scripts/benchmark_neuroglancer.mjs BASE_URL IMAGE_ID [RUNS] [REPORT]
import { chromium } from '../frontend/node_modules/playwright-core/index.mjs';
import { writeFile } from 'node:fs/promises';

const [base, imageId, count = '3', output = 'neuroglancer-benchmark.json'] = process.argv.slice(2);
if (!base || !/^\d+$/.test(imageId || '') || !process.env.OMERO_PASSWORD) {
  throw Error('Supply BASE_URL IMAGE_ID [RUNS] [REPORT] and OMERO_PASSWORD; OMERO_USER defaults to root.');
}
const runs = Number(count);
if (!Number.isInteger(runs) || runs < 1 || runs > 20) throw Error('RUNS must be between 1 and 20.');
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
const report = { imageId, base, viewport: [1440, 1000], browser: await browser.version(), trials: [] };
try {
  for (let trial = 1; trial <= runs; trial++) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    try {
      const page = await context.newPage();
      await page.goto(new URL('/webclient/login/', base).href);
      await page.getByLabel('Username:', { exact: true }).fill(process.env.OMERO_USER || 'root');
      await page.getByLabel('Password:', { exact: true }).fill(process.env.OMERO_PASSWORD);
      await page.getByRole('button', { name: 'Login', exact: true }).click();
      await page.waitForURL(url => !url.pathname.includes('/login/'));
      let requests = 0;
      const errors = [], failures = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('response', response => {
        if (!response.url().includes('/neuroglancer/')) return;
        if (response.status() >= 400) failures.push(response.status());
        if (/\/0\/\d+-\d+_/.test(response.url())) requests++;
      });
      const started = performance.now();
      await page.goto(new URL(`/biomero_zarr_viewer/?image=${imageId}&v=2&render=3d`, base).href);
      const renderer = page.getByRole('button', { name: 'Neuroglancer', exact: true });
      await renderer.waitFor({ timeout: 60000 });
      if (await renderer.getAttribute('aria-pressed') !== 'true') throw Error('Neuroglancer is not selected.');
      await page.locator('iframe[title="Volume image and segmentation"]').waitFor({ timeout: 120000 });
      await page.getByText('3D image and labels ready', { exact: true }).waitFor({ timeout: 180000 });
      const seconds = (performance.now() - started) / 1000;
      if (errors.length || failures.length || !requests) throw Error(JSON.stringify({ errors, failures, requests }));
      report.trials.push({ trial, seconds, requests });
      await writeFile(output, JSON.stringify(report, null, 2));
      console.log(JSON.stringify(report.trials.at(-1)));
    } finally { await context.close(); }
  }
} finally { await browser.close(); }

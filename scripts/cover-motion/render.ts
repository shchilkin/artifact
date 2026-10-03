/**
 * Renders a looping cover video from an Artifact project package and a cover motion recipe.
 *
 * Needs the web dev server (`npm run dev:web`) and ffmpeg on PATH.
 *
 *   node scripts/cover-motion/render.ts --package cover.artifact --recipe scripts/cover-motion/viber.motion.json \
 *     --font "VCR OSD Mono.ttf" --out out/viber --size 1080
 *
 * Writes PNG frames to `<out>/frames/` and `<out>.mp4` (H.264) plus `<out>.webm` (VP9).
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from '@playwright/test';

const { values } = parseArgs({
  options: {
    package: { type: 'string' },
    recipe: { type: 'string' },
    font: { type: 'string', multiple: true, default: [] },
    out: { type: 'string', default: 'out/cover-motion' },
    size: { type: 'string', default: '1080' },
    url: { type: 'string', default: 'http://localhost:5173' },
  },
});

if (!values.package || !values.recipe) {
  console.error(
    'Usage: node scripts/cover-motion/render.ts --package <file.artifact> --recipe <recipe.json> [--font <file>]',
  );
  process.exit(1);
}

const size = Number(values.size);
const out = values.out;
const framesDir = join(out, 'frames');
const recipe = JSON.parse(readFileSync(values.recipe, 'utf8'));
const recipeFps = Number(recipe.fps);
const packageText = readFileSync(values.package, 'utf8');
const fonts = values.font.map((file) => ({
  name: basename(file),
  dataUrl: `data:font/ttf;base64,${readFileSync(file).toString('base64')}`,
}));

rmSync(framesDir, { recursive: true, force: true });
mkdirSync(framesDir, { recursive: true });

const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('pageerror', (error) => console.error('[page]', error.message));
  await page.goto(`${values.url}/dev/cover-motion`);
  await page.waitForFunction(() => Boolean(window.__coverMotion));
  await page.evaluate(([text, files]) => window.__coverMotion?.load(text, files), [packageText, fonts] as const);
  const frames = await page.evaluate((value) => window.__coverMotion?.setRecipe(value) ?? 0, recipe);

  for (let index = 0; index < frames; index += 1) {
    const dataUrl = await page.evaluate(([i, s]) => window.__coverMotion?.renderFrame(i, s) ?? '', [
      index,
      size,
    ] as const);
    const name = `f${String(index).padStart(4, '0')}.png`;
    writeFileSync(join(framesDir, name), Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64'));
    process.stdout.write(`\rframe ${index + 1}/${frames}`);
  }
  process.stdout.write('\n');
} finally {
  await browser.close();
}

const input = ['-y', '-framerate', String(recipeFps), '-i', join(framesDir, 'f%04d.png')];
execFileSync(
  'ffmpeg',
  [...input, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-movflags', '+faststart', `${out}.mp4`],
  {
    stdio: 'inherit',
  },
);
execFileSync(
  'ffmpeg',
  [...input, '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuv420p', '-crf', '30', '-b:v', '0', `${out}.webm`],
  {
    stdio: 'inherit',
  },
);
console.log(`Wrote ${out}.mp4 and ${out}.webm`);

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { measureOutlineBaselines, outlineRuntimeText } from './outline-runtime-text.mjs';
import { serveEmbed } from './runtime-embed-server.mjs';

const repository = resolve(import.meta.dirname, '..');
const compositionPath = process.argv[2];
if (!compositionPath) throw new Error('Pass the local .artifact file as the first argument. It will not be committed.');
const output = await mkdtemp(join(tmpdir(), 'artifact-viber-embed-'));
function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')}\n${result.stderr}\n${result.stdout}`);
  return result.stdout;
}

run('npm', ['run', 'build:runtime'], repository);
const [pack] = JSON.parse(
  run(
    'npm',
    ['pack', '--workspace', '@shchilkin/artifact-runtime', '--json', '--pack-destination', output],
    repository,
  ),
);
await cp(join(repository, 'examples/viber-embed'), output, { recursive: true });
const vite = JSON.parse(await readFile(join(repository, 'node_modules/vite/package.json'), 'utf8'));
await writeFile(
  join(output, 'package.json'),
  JSON.stringify(
    {
      private: true,
      type: 'module',
      scripts: { build: 'vite build' },
      dependencies: { '@shchilkin/artifact-runtime': `file:./${pack.filename}` },
      devDependencies: { vite: vite.version },
    },
    null,
    2,
  ),
);
// A real installation in a new directory: no workspace aliases or symlinks.
run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], output);
await mkdir(join(output, 'public'), { recursive: true });
const sourceComposition = await readFile(resolve(compositionPath));
const outlines = process.argv.includes('--outline-text');
let composition = sourceComposition;
if (outlines) {
  const browser = await chromium.launch({ channel: process.env.ARTIFACT_BROWSER_CHANNEL ?? 'chrome' });
  try {
    const source = JSON.parse(sourceComposition);
    const baselines = await measureOutlineBaselines(await browser.newPage(), source);
    composition = Buffer.from(`${JSON.stringify(outlineRuntimeText(source, baselines), null, 2)}\n`);
  } finally {
    await browser.close();
  }
}
await writeFile(join(output, 'public/viber.artifact'), composition);
const recipe = JSON.parse(await readFile(join(repository, 'docs/experiments/fixtures/viber.motion.json'), 'utf8'));
recipe.compositionSha256 = createHash('sha256').update(composition).digest('hex');
// A quieter authored variant: only the phone, emoji field, grain and glitch
// receive tracks. The full conformance recipe remains in the repository.
const tracks = new Set(['portrait-sway-x', 'portrait-tilt', 'emoji-drift', 'grain-breathe', 'glitch-impulses']);
recipe.tracks = recipe.tracks.filter((track) => tracks.has(track.id));
const recipeText = `${JSON.stringify(recipe, null, 2)}\n`;
await writeFile(join(output, 'public/viber-classic.motion.json'), recipeText);
const signal = JSON.parse(
  await readFile(join(repository, 'docs/experiments/fixtures/viber-signal.motion.json'), 'utf8'),
);
signal.compositionSha256 = recipe.compositionSha256;
const variants = {
  combined: signal.tracks,
  flow: signal.tracks.filter((track) => track.id === 'signal-flow'),
  grain: signal.tracks.filter((track) => track.id === 'signal-grain'),
  glitch: signal.tracks.filter((track) => track.id.startsWith('signal-glitch-')),
};
const recipeHashes = {};
for (const [name, variantTracks] of Object.entries(variants)) {
  const serialized = `${JSON.stringify({ ...signal, tracks: variantTracks }, null, 2)}\n`;
  const filename = name === 'combined' ? 'viber.motion.json' : `viber-${name}.motion.json`;
  await writeFile(join(output, 'public', filename), serialized);
  recipeHashes[name] = createHash('sha256').update(serialized).digest('hex');
}
run('npm', ['run', 'build'], output);
const { server, url } = await serveEmbed(join(output, 'dist'));
let browser;
try {
  browser = await chromium.launch({ channel: process.env.ARTIFACT_BROWSER_CHANNEL ?? 'chrome' });
  const page = await browser.newPage();
  await page.goto(`${url}/render.html`);
  await page.waitForFunction(() => document.body.dataset.state !== undefined);
  const state = await page.locator('body').getAttribute('data-state');
  if (state !== 'ready') throw new Error(await page.locator('body').innerText());
  const dataUrl = await page.locator('canvas').evaluate((canvas) => canvas.toDataURL('image/png'));
  const poster = Buffer.from(dataUrl.split(',')[1], 'base64');
  await writeFile(join(output, 'dist/viber.png'), poster);
  await writeFile(join(output, 'public/viber.png'), poster);
} finally {
  await browser?.close();
  await new Promise((accept) => server.close(accept));
}
const report = {
  output,
  dist: join(output, 'dist'),
  packageVersion: pack.version,
  tarball: join(output, pack.filename),
  tarballSha256: createHash('sha256')
    .update(await readFile(join(output, pack.filename)))
    .digest('hex'),
  compositionSha256: recipe.compositionSha256,
  sourceCompositionSha256: createHash('sha256').update(sourceComposition).digest('hex'),
  textMode: outlines ? 'svg-outlines' : 'embedded-font',
  recipeSha256: recipeHashes.combined,
  recipeHashes,
  classicRecipeSha256: createHash('sha256').update(recipeText).digest('hex'),
  animatedLayers: new Set(signal.tracks.map((track) => track.target.layerId)).size,
  tracks: signal.tracks.length,
};
await writeFile(join(output, 'evidence.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));

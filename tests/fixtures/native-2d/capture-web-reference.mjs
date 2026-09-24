import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { cpus, platform, release, totalmem } from 'node:os';
import { join, resolve } from 'node:path';

const [workspaceArg, baseURL, output, productSourceRevision, fixtureRevision, servedSourceRevision] =
  process.argv.slice(2);
if (
  !workspaceArg ||
  !baseURL ||
  !output ||
  !/^[0-9a-f]{40}$/.test(productSourceRevision ?? '') ||
  !/^[0-9a-f]{40}$/.test(fixtureRevision ?? '') ||
  !/^[0-9a-f]{40}$/.test(servedSourceRevision ?? '')
) {
  throw new Error(
    'Usage: node capture-web-reference.mjs WORKSPACE BASE_URL OUTPUT PRODUCT_SOURCE_SHA FIXTURE_SHA SERVED_SOURCE_SHA',
  );
}
if (servedSourceRevision !== productSourceRevision) {
  throw new Error('Served-source acknowledgement must equal PRODUCT_SOURCE_SHA');
}
const workspace = resolve(workspaceArg);
const git = (args) => execFileSync('git', args, { cwd: workspace, encoding: 'utf8' }).trim();
if (git(['rev-parse', '--show-toplevel']) !== workspace) throw new Error('WORKSPACE must be the Git root');
const verifiedRevision = (revision) => git(['rev-parse', '--verify', `${revision}^{commit}`]);
if (verifiedRevision(productSourceRevision) !== productSourceRevision) throw new Error('Unknown product source SHA');
if (verifiedRevision(fixtureRevision) !== fixtureRevision) throw new Error('Unknown fixture SHA');
const sourcePaths = ['apps/web', 'packages', 'crates'];
if (git(['diff', '--name-only', productSourceRevision, '--', ...sourcePaths])) {
  throw new Error('Product source differs from PRODUCT_SOURCE_SHA');
}
if (git(['status', '--porcelain', '--untracked-files=all', '--', ...sourcePaths])) {
  throw new Error('Product source has local changes');
}
const require = createRequire(join(workspace, 'package.json'));
const { chromium, expect } = require('@playwright/test');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const fixtureDir = join(workspace, 'tests/fixtures/native-2d');
const names = [
  'text-font',
  'alpha-nonsquare',
  'alpha-jpeg',
  'blend-modes',
  'branch-merge-mask-repeat',
  'source-families',
  'graph-utilities',
  'hundred-node',
];
const fixturePaths = [
  ...names.map((name) => `tests/fixtures/native-2d/${name}.artifact.json`),
  'tests/fixtures/native-2d/effect-cases.json',
  'tests/fixtures/native-2d/generate.mjs',
  'tests/fixtures/native-2d/CoveredByYourGrace.ttf',
  'tests/fixtures/native-2d/OFL.txt',
];
for (const path of fixturePaths) {
  const current = readFileSync(join(workspace, path));
  const recorded = execFileSync('git', ['show', `${fixtureRevision}:${path}`], { cwd: workspace });
  if (sha(current) !== sha(recorded)) throw new Error(`Fixture differs from FIXTURE_SHA: ${path}`);
}
function hostMetadata() {
  const mac = (args) => {
    try {
      return execFileSync(args[0], args.slice(1), { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
      return null;
    }
  };
  return {
    chip: mac(['sysctl', '-n', 'machdep.cpu.brand_string']) || cpus()[0]?.model || null,
    memoryGiB: Math.round(totalmem() / 1024 ** 3),
    os:
      platform() === 'darwin'
        ? `macOS ${mac(['sw_vers', '-productVersion']) || release()}`
        : `${platform()} ${release()}`,
    build: platform() === 'darwin' ? mac(['sw_vers', '-buildVersion']) : null,
  };
}
const readDoc = (name) => JSON.parse(readFileSync(join(fixtureDir, `${name}.artifact.json`), 'utf8'));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const report = {
  version: 1,
  capturedAt: new Date().toISOString(),
  productSourceRevision,
  fixtureRevision,
  servedSource: {
    acknowledgedRevision: servedSourceRevision,
    verification: 'Operator asserted that BASE_URL serves this checkout; no runtime identity endpoint exists.',
  },
  browser: {
    name: 'Google Chrome',
    version: browser.version(),
    headless: true,
    viewport: { width: 1440, height: 960 },
    deviceScaleFactor: 1,
  },
  host: hostMetadata(),
  pixelDecoder: '@napi-rs/canvas',
  evidence:
    'Observed from the main Web file import and actual export download. Numeric/image hashes are this host and browser baseline, not cross-platform exact-pixel requirements or performance measurements.',
  documents: [],
  variants: [],
};

async function inspectExport(bytes, name, scale) {
  const image = await loadImage(bytes);
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const sample = (x, y) => Array.from(pixels.subarray((y * canvas.width + x) * 4, (y * canvas.width + x) * 4 + 4));
  let transparent = 0,
    translucent = 0,
    opaque = 0;
  let minX = canvas.width,
    minY = canvas.height,
    maxX = -1,
    maxY = -1;
  for (let i = 0; i < pixels.length; i += 4) {
    const a = pixels[i + 3];
    if (a === 0) transparent++;
    else if (a === 255) opaque++;
    else translucent++;
    if (
      name === 'text-font' &&
      a > 128 &&
      Math.max(Math.abs(pixels[i] - 23), Math.abs(pixels[i + 1] - 37), Math.abs(pixels[i + 2] - 58)) > 16
    ) {
      const p = i / 4,
        x = p % canvas.width,
        y = Math.floor(p / canvas.width);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return {
    width: canvas.width,
    height: canvas.height,
    fileSha256: sha(bytes),
    decodedRgbaSha256: sha(pixels),
    alphaPixels: { transparent, translucent, opaque },
    samples: {
      topLeft: sample(0, 0),
      center: sample(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2)),
      bottomRight: sample(canvas.width - 1, canvas.height - 1),
    },
    ...(name === 'text-font'
      ? {
          textInkBounds: {
            threshold: 'alpha > 128 and max RGB distance from plate [23,37,58] > 16',
            outputPixels: { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
            canonicalBasePixels: {
              x: minX / scale,
              y: minY / scale,
              width: (maxX - minX + 1) / scale,
              height: (maxY - minY + 1) / scale,
            },
          },
        }
      : {}),
  };
}

async function observe(name, doc, variant) {
  const context = await browser.newContext({
    baseURL,
    viewport: report.browser.viewport,
    deviceScaleFactor: 1,
    colorScheme: 'dark',
    reducedMotion: 'reduce',
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.route('**/api/ai/access', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ authenticated: false, enabled: false, disabledReason: 'anonymous' }),
    }),
  );
  try {
    await page.goto('/app');
    await expect(page.getByRole('heading', { name: 'Artifact Cover Editor' })).toBeVisible({ timeout: 30000 });
    const chooserEvent = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Open document file' }).click();
    const chooser = await chooserEvent;
    await chooser.setFiles({
      name: `${name}.artifact.json`,
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(doc)),
    });
    await expect(page.getByRole('dialog', { name: 'Open artifact file' })).toBeVisible();
    await page.getByRole('button', { name: 'OPEN FILE' }).click();
    await expect(page.getByRole('dialog', { name: 'Open artifact file' })).toBeHidden();
    await expect
      .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('doc') || '{}').global?.seed))
      .toBe(doc.global.seed);
    if (name === 'text-font')
      await expect
        .poll(
          () =>
            page.evaluate(() =>
              Array.from(document.fonts).some(
                (face) =>
                  face.family.replaceAll('"', '') === 'Artifact Imported covered grace p01' && face.status === 'loaded',
              ),
            ),
          { timeout: 15000 },
        )
        .toBe(true);
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('doc') || '{}'));
    const fontFaces = await page.evaluate(() =>
      Array.from(document.fonts)
        .filter((face) => face.family.includes('Artifact Imported'))
        .map((face) => ({ family: face.family.replaceAll('"', ''), status: face.status })),
    );
    const exportButton = page.getByRole('button', { name: 'EXPORT' });
    await expect(exportButton).toBeEnabled({ timeout: 15000 });
    const downloadEvent = page.waitForEvent('download', { timeout: 60000 });
    await exportButton.click();
    const download = await downloadEvent;
    const bytes = readFileSync(await download.path());
    const graph = stored.graph;
    const result = {
      fixture: `tests/fixtures/native-2d/${name}.artifact.json`,
      fixtureFileSha256: sha(readFileSync(join(fixtureDir, `${name}.artifact.json`))),
      ...(variant ? { variant } : {}),
      inputValueSha256: sha(JSON.stringify(doc)),
      imported: {
        aspect: stored.global.aspect,
        layerCount: stored.layers.length,
        layerKinds: stored.layers.map((layer) => layer.kind),
        graph: graph
          ? {
              edges: graph.edges,
              utilityCounts: Object.fromEntries(
                ['mergeNodes', 'colorNodes', 'repeatNodes', 'maskNodes', 'transformNodes', 'grimeShadowNodes'].map(
                  (key) => [key, (graph[key] || []).length],
                ),
              ),
              areas: graph.areas || [],
              positionedNodeCount: Object.keys(graph.positions || {}).length,
            }
          : null,
        textLayers: stored.layers
          .filter((layer) => layer.kind === 'text')
          .map(({ id, content, font, x, y, size, rotation }) => ({ id, content, font, x, y, size, rotation })),
        embeddedFontFaces: fontFaces,
        export: stored.export,
      },
      exported: { filename: download.suggestedFilename(), ...(await inspectExport(bytes, name, stored.export.scale)) },
      pageErrors,
    };
    if (pageErrors.length) throw new Error(`${name}: browser exceptions: ${pageErrors.join('; ')}`);
    console.log(
      JSON.stringify({
        fixture: name,
        variant,
        dimensions: [result.exported.width, result.exported.height],
        alpha: result.exported.alphaPixels,
      }),
    );
    return result;
  } finally {
    await context.close();
  }
}

try {
  for (const name of names) report.documents.push(await observe(name, readDoc(name)));
  for (const [name, mutate] of [
    [
      'repeat-count-1',
      (doc) => {
        doc.graph.repeatNodes[0].count = 1;
      },
    ],
    [
      'mask-inverted',
      (doc) => {
        doc.graph.maskNodes[0].invert = true;
      },
    ],
  ]) {
    const doc = readDoc('branch-merge-mask-repeat');
    mutate(doc);
    report.variants.push(await observe('branch-merge-mask-repeat', doc, name));
  }
  const original = report.documents.find((doc) => doc.fixture.includes('branch-merge-mask-repeat'));
  if (report.variants.some((variant) => variant.exported.decodedRgbaSha256 === original.exported.decodedRgbaSha256))
    throw new Error('Graph parameter variant did not change pixels');
  report.observations = {
    transparentJpeg: `Transparent input corner decodes as RGBA ${JSON.stringify(report.documents.find((doc) => doc.fixture.includes('alpha-jpeg')).exported.samples.topLeft)} in the downloaded JPEG. Preserve this observed browser baseline; any revised flattening policy needs a separate explicit decision.`,
    font: 'Ink bounds are measured from the exported image using the stated plate-distance threshold, not inferred from text length or a new native renderer.',
    graph:
      'Both repeat-count-1 and mask-inverted variants change decoded output pixels relative to the same Web baseline.',
  };
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log('Saved ' + output);
} finally {
  await browser.close();
}

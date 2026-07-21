import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { chromium } from '@playwright/test';

const projectPath = process.env.ARTIFACT_VIBER_PROJECT;
if (!projectPath) {
  throw new Error('Set ARTIFACT_VIBER_PROJECT to the retained portable Viber .artifact file.');
}

const baseUrl = process.env.ARTIFACT_RUNTIME_BASE_URL ?? 'http://127.0.0.1:4173';
const screenshotPath = process.env.ARTIFACT_VIBER_SCREENSHOT;
const projectBytes = await readFile(projectPath);
const project = JSON.parse(projectBytes.toString('utf8'));
const fontRef = project.document.layers.find((layer) => layer.kind === 'text')?.font;
if (typeof fontRef !== 'string') throw new Error('The Viber fixture has no editable text font reference.');

const withoutGpuEffects = structuredClone(project);
for (const layer of withoutGpuEffects.document.layers) {
  if (layer.kind !== 'effect') continue;
  layer.noiseWarp = 0;
  layer.vortex = 0;
  layer.tearAmt = 0;
}

const runtimeModuleUrl = `/@fs${process.cwd()}/packages/runtime/src/index.ts`;
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  const result = await page.evaluate(
    async ({ fontRef, project, runtimeModuleUrl, withoutGpuEffects }) => {
      const runtime = await import(runtimeModuleUrl);
      const unresolvedReport = runtime.analyzeArtifactRuntimeProject(project);
      const fontFamilies = { [fontRef]: 'monospace' };
      const report = runtime.analyzeArtifactRuntimeProject(project, { fontFamilies });
      const render = async (value) => {
        const canvas = document.createElement('canvas');
        const startedAt = performance.now();
        await runtime.renderArtifactRuntimeProject({
          canvas,
          project: value,
          width: 256,
          height: 256,
          fontFamilies,
        });
        const pixels = canvas.getContext('2d').getImageData(0, 0, 256, 256).data;
        let checksum = 0;
        let nontransparent = 0;
        for (let index = 0; index < pixels.length; index += 4) {
          checksum = (checksum + pixels[index] * 3 + pixels[index + 1] * 5 + pixels[index + 2] * 7) >>> 0;
          if (pixels[index + 3] > 0) nontransparent += 1;
        }
        return { canvas, checksum, durationMs: performance.now() - startedAt, nontransparent, pixels };
      };

      const baseline = await render(withoutGpuEffects);
      const first = await render(project);
      const second = await render(project);
      let gpuChangedPixels = 0;
      for (let index = 0; index < first.pixels.length; index += 4) {
        if (
          first.pixels[index] !== baseline.pixels[index] ||
          first.pixels[index + 1] !== baseline.pixels[index + 1] ||
          first.pixels[index + 2] !== baseline.pixels[index + 2] ||
          first.pixels[index + 3] !== baseline.pixels[index + 3]
        ) {
          gpuChangedPixels += 1;
        }
      }

      document.body.replaceChildren(first.canvas);
      Object.assign(document.body.style, { margin: '0', width: '256px', height: '256px', overflow: 'hidden' });
      return {
        baselineChecksum: baseline.checksum,
        dimensions: [first.canvas.width, first.canvas.height],
        firstChecksum: first.checksum,
        firstDurationMs: first.durationMs,
        gpuChangedPixels,
        nontransparent: first.nontransparent,
        repeatedChecksum: second.checksum,
        repeatedDurationMs: second.durationMs,
        report,
        unresolvedReport,
        userAgent: navigator.userAgent,
      };
    },
    { fontRef, project, runtimeModuleUrl, withoutGpuEffects },
  );

  if (result.unresolvedReport.status !== 'unresolved-fonts') {
    throw new Error(`Expected unresolved-fonts without a host mapping, received ${result.unresolvedReport.status}.`);
  }
  if (result.report.status !== 'ready' || result.report.layerOrder.length !== 15) {
    throw new Error('The mapped Viber project did not resolve as one ready 15-layer graph.');
  }
  if (result.nontransparent === 0 || result.firstChecksum !== result.repeatedChecksum) {
    throw new Error('The Viber render was blank or nondeterministic.');
  }
  if (result.gpuChangedPixels === 0) throw new Error('The Viber GPU effects did not change the rendered frame.');

  if (screenshotPath) {
    await page.screenshot({ path: screenshotPath, clip: { x: 0, y: 0, width: 256, height: 256 } });
  }
  console.log(
    JSON.stringify(
      {
        projectSha256: createHash('sha256').update(projectBytes).digest('hex'),
        ...result,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}

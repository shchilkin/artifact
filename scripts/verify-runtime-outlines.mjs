import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { serveEmbed } from './runtime-embed-server.mjs';

const root = resolve(process.argv[2]);
const source = JSON.parse(await readFile(resolve(process.argv[3]), 'utf8'));
const manifest = JSON.parse(await readFile(join(root, 'dist/.vite/manifest.json'), 'utf8'));
const runtimeBundle = Object.entries(manifest).find(([name]) => name.endsWith('artifact-runtime/dist/index.js'))?.[1]
  ?.file;
assert.ok(runtimeBundle);
const { server, url } = await serveEmbed(join(root, 'dist'));
const browser = await chromium.launch({ channel: process.env.ARTIFACT_BROWSER_CHANNEL ?? 'chrome' });
try {
  const page = await browser.newPage();
  await page.goto(url);
  const proof = await page.evaluate(
    async ({ source, runtimeBundle }) => {
      const runtime = await import(`/${runtimeBundle}`);
      const outlined = await (await fetch('/viber.artifact')).json();
      const report = runtime.analyzeArtifactRuntimeProject(outlined);
      const results = [];
      const bounds = (pixels, size) => {
        let left = size,
          top = size,
          right = -1,
          bottom = -1,
          area = 0;
        for (let y = 0; y < size; y++)
          for (let x = 0; x < size; x++) {
            const alpha = pixels[(y * size + x) * 4 + 3];
            area += alpha / 255;
            if (alpha < 128) continue;
            left = Math.min(left, x);
            top = Math.min(top, y);
            right = Math.max(right, x);
            bottom = Math.max(bottom, y);
          }
        return { box: [left, top, right, bottom], area };
      };
      const render = async (project, size, fontFree) => {
        const canvas = document.createElement('canvas');
        const Font = window.FontFace;
        if (fontFree)
          window.FontFace = class {
            constructor() {
              throw new Error('Outlined artwork attempted font loading');
            }
          };
        try {
          await runtime.renderArtifactRuntimeProject({ project, canvas, width: size, height: size });
          return canvas;
        } finally {
          window.FontFace = Font;
        }
      };
      for (const size of [512, 540, 1080]) {
        for (const original of source.document.layers.filter((layer) => layer.kind === 'text')) {
          const a = structuredClone(source),
            b = structuredClone(outlined);
          delete a.document.graph;
          delete b.document.graph;
          a.document.layers = [original];
          b.document.layers = [outlined.document.layers.find((layer) => layer.id === original.id)];
          a.document.global.bg = b.document.global.bg = 'transparent';
          const originalCanvas = await render(a, size, false);
          const outlineCanvas = await render(b, size, true);
          const p = originalCanvas.getContext('2d').getImageData(0, 0, size, size).data;
          const q = outlineCanvas.getContext('2d').getImageData(0, 0, size, size).data;
          let alphaError = 0;
          for (let i = 3; i < p.length; i += 4) alphaError += Math.abs(p[i] - q[i]);
          const sourceBounds = bounds(p, size),
            outlineBounds = bounds(q, size);
          results.push({
            size,
            layer: original.id,
            sourceBounds,
            outlineBounds,
            meanAlphaError: alphaError / (size * size),
          });
        }
      }
      const originalCanvas = await render(source, 512, false);
      const outlineCanvas = await render(outlined, 512, true);
      const comparison = document.createElement('canvas');
      comparison.width = 1024;
      comparison.height = 512;
      comparison.getContext('2d').drawImage(originalCanvas, 0, 0);
      comparison.getContext('2d').drawImage(outlineCanvas, 512, 0);
      return { results, report, comparison: comparison.toDataURL(), fontFacesAfter: document.fonts.size };
    },
    { source, runtimeBundle },
  );
  await writeFile(join(root, 'outlines-comparison.png'), Buffer.from(proof.comparison.split(',')[1], 'base64'));
  delete proof.comparison;
  await writeFile(join(root, 'outlines-verification.json'), `${JSON.stringify(proof, null, 2)}\n`);
  for (const result of proof.results) {
    assert.ok(
      result.sourceBounds.box.every((value, i) => Math.abs(value - result.outlineBounds.box[i]) <= 2),
      `Text bounds: ${JSON.stringify(result)}`,
    );
    // Paths preserve contour geometry, not browser font hinting. This pixel
    // font's small stems have different coverage after outlining; keep the
    // measured areas in the evidence instead of claiming raster equality.
    assert.ok(result.meanAlphaError < 3, `Edge tolerance: ${JSON.stringify(result)}`);
  }
  assert.equal(proof.fontFacesAfter, 0);
  assert.equal(proof.report.status, 'ready');
  assert.deepEqual(proof.report.issues, []);
  assert.deepEqual(proof.report.requiredFonts, []);
  assert.deepEqual(proof.report.unresolvedFonts, []);
  console.log(JSON.stringify(proof, null, 2));
} finally {
  await browser.close();
  await new Promise((accept) => server.close(accept));
}

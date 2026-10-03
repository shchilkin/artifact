import { expect, test } from '@playwright/test';
import { expectNoBrowserIssues, setupBrowserTestPage } from './helpers';

// The non-blocking GPU readback must produce the same pixels as the blocking `extract.canvas` path it replaced,
// for previews, thumbnails, and export. Both paths run in the same page, so the comparison does not depend on the
// machine's GPU. The test imports app modules from the dev server.
test.skip(process.env.PLAYWRIGHT_WEB_SERVER_MODE === 'preview', 'needs the dev server to import app modules');

test.beforeEach(async ({ page }) => {
  await setupBrowserTestPage(page);
  await page.goto('/docs');
  const webgl2 = await page.evaluate(() => Boolean(document.createElement('canvas').getContext('webgl2')));
  test.skip(!webgl2, 'the non-blocking readback needs WebGL2');
});

test.afterEach(async ({ page }) => {
  expectNoBrowserIssues(page);
});

test('every GPU effect preset reads back identical pixels from opaque and translucent sources', async ({ page }) => {
  const results = await page.evaluate(async () => {
    const { gpuRenderToCanvas } = await import('/app/utils/gpuRender.ts');
    const { buildFiltersFromEffectLayer } = await import('/app/utils/pixiFilters.ts');
    const { EFFECT_PRESETS, makeEffectPresetLayer } = await import('/app/types/config.ts');
    const size = 160;

    const source = (translucent: boolean) => {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d')!;
      const gradient = ctx.createLinearGradient(0, 0, size, size);
      gradient.addColorStop(0, translucent ? 'rgba(255, 40, 10, 0.15)' : '#ff280a');
      gradient.addColorStop(0.5, translucent ? 'rgba(20, 200, 90, 0.6)' : '#14c85a');
      gradient.addColorStop(1, translucent ? 'rgba(10, 30, 250, 0.95)' : '#0a1efa');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = translucent ? 'rgba(255, 255, 255, 0.5)' : '#ffffff';
      ctx.fillRect(size * 0.2, size * 0.3, size * 0.4, size * 0.2);
      return canvas;
    };
    const pixels = (canvas: HTMLCanvasElement) => canvas.getContext('2d')!.getImageData(0, 0, size, size).data;

    const rows: Array<{ preset: string; translucent: boolean; differing: number }> = [];
    for (const preset of Object.keys(EFFECT_PRESETS) as Array<keyof typeof EFFECT_PRESETS>) {
      const layer = makeEffectPresetLayer(preset);
      for (const translucent of [false, true]) {
        const asyncFilters = buildFiltersFromEffectLayer(layer, 7, size, size);
        const syncFilters = buildFiltersFromEffectLayer(layer, 7, size, size);
        if (!asyncFilters || !syncFilters) continue;
        const input = source(translucent);
        const viaAsync = pixels(
          await gpuRenderToCanvas({ width: size, height: size, source: input, filters: asyncFilters }),
        );
        const viaSync = pixels(
          await gpuRenderToCanvas({ width: size, height: size, source: input, filters: syncFilters, readback: 'sync' }),
        );
        let differing = 0;
        for (let index = 0; index < viaAsync.length; index += 1) if (viaAsync[index] !== viaSync[index]) differing += 1;
        rows.push({ preset, translucent, differing });
      }
    }
    return rows;
  });

  // Every preset with GPU filters is covered, with both source kinds.
  expect(results.length).toBeGreaterThanOrEqual(20);
  expect(results.filter((row) => row.translucent).length).toBe(results.length / 2);
  expect(results.filter((row) => row.differing > 0)).toEqual([]);
});

test('a reference document exports the same PNG bytes with either readback', async ({ page }) => {
  const exported = await page.evaluate(async () => {
    const { setGpuReadback } = await import('/app/utils/gpuRender.ts');
    const { renderCoverExportCanvas } = await import('/app/utils/exportCanvas.ts');
    const { makeEffectPresetLayer, makeFillLayer } = await import('/app/types/config.ts');

    // No text or emoji layers: WebKit's font loading does not settle under the test page's network rules.
    const doc = {
      schemaVersion: 1,
      global: { bg: 'transparent', seed: 4242, aspect: '1:1' as const },
      layers: [
        makeFillLayer({ id: 'parity-fill', color: '#2a1140', opacity: 70 }),
        makeFillLayer({ id: 'parity-glaze', color: '#f46f5e', opacity: 35, blendMode: 'screen' }),
        makeEffectPresetLayer('bloom', { id: 'parity-bloom', bloom: 38 }),
        makeEffectPresetLayer('grain', { id: 'parity-grain', grain: 34 }),
        makeEffectPresetLayer('halftone', { id: 'parity-halftone', halftone: 16 }),
        makeEffectPresetLayer('vignette', { id: 'parity-vignette', vignette: 46 }),
      ],
      export: { format: 'png' as const, scale: 1 as const, target: 'cover' as const },
    };

    const pngDigest = async () => {
      const canvas = await renderCoverExportCanvas(doc, new Map(), 1);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      const bytes = await blob!.arrayBuffer();
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
      return {
        size: bytes.byteLength,
        digest: Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join(''),
      };
    };

    // One warm-up render, so lazily loaded GPU and worker modules are in place for both compared renders.
    await pngDigest();
    performance.clearMeasures('artifact:gpu-filter-extract');
    setGpuReadback('async');
    const viaAsync = await pngDigest();
    setGpuReadback('sync');
    const viaSync = await pngDigest();
    setGpuReadback('async');
    return {
      viaAsync,
      viaSync,
      gpuPasses: performance.getEntriesByName('artifact:gpu-filter-extract').length,
    };
  });

  expect(exported.gpuPasses).toBeGreaterThan(0);
  expect(exported.viaAsync.size).toBeGreaterThan(1000);
  expect(exported.viaAsync).toEqual(exported.viaSync);
});

test('merging a layer’s GPU filters into the next GPU pass keeps opaque pixels and saves a pass', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { renderDocument } = await import('/app/utils/renderer.ts');
    const { makeEffectPresetLayer, makeFillLayer } = await import('/app/types/config.ts');

    // The effect-stack shape: RGB split has Canvas 2D and GPU parts, and GPU-only layers follow it.
    const doc = {
      schemaVersion: 1,
      global: { bg: '#101018', seed: 4242, aspect: '1:1' as const },
      layers: [
        makeFillLayer({ id: 'merge-fill', color: '#2a1140' }),
        makeFillLayer({ id: 'merge-glaze', color: '#f46f5e', opacity: 35, blendMode: 'screen' }),
        makeEffectPresetLayer('scanlines', { id: 'merge-scanlines', scanlines: 24 }),
        makeEffectPresetLayer('rgbSplit', { id: 'merge-rgb', rgbSplit: 8 }),
        makeEffectPresetLayer('halftone', { id: 'merge-halftone', halftone: 16 }),
        makeEffectPresetLayer('vignette', { id: 'merge-vignette', vignette: 46 }),
      ],
      export: { format: 'png' as const, scale: 1 as const, target: 'cover' as const },
    };
    const size = 270;
    const render = async (mergeGpuPasses: boolean) => {
      performance.clearMeasures('artifact:gpu-filter-extract');
      const canvas = await renderDocument(doc, size, size, new Map(), { graphMode: 'stack', mergeGpuPasses });
      return {
        pixels: canvas.getContext('2d')!.getImageData(0, 0, size, size).data,
        gpuPasses: performance.getEntriesByName('artifact:gpu-filter-extract').length,
      };
    };

    await render(false);
    const separate = await render(false);
    const merged = await render(true);
    let differing = 0;
    for (let index = 0; index < separate.pixels.length; index += 1) {
      if (separate.pixels[index] !== merged.pixels[index]) differing += 1;
    }
    return { differing, separatePasses: separate.gpuPasses, mergedPasses: merged.gpuPasses };
  });

  expect(result.separatePasses).toBe(2);
  expect(result.mergedPasses).toBe(1);
  expect(result.differing).toBe(0);
});

test('merged GPU passes keep opaque pixels with filters that pad or sample past the edge', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { renderDocument } = await import('/app/utils/renderer.ts');
    const { makeEffectPresetLayer, makeFillLayer } = await import('/app/types/config.ts');

    // RGB Split's GPU filter joins a chain whose filters displace (barrel), spread (bloom), and pad (blur).
    const doc = {
      schemaVersion: 1,
      global: { bg: '#101018', seed: 4242, aspect: '1:1' as const },
      layers: [
        makeFillLayer({ id: 'edge-fill', color: '#2a1140' }),
        makeFillLayer({ id: 'edge-glaze', color: '#f46f5e', opacity: 35, blendMode: 'screen' }),
        makeEffectPresetLayer('scanlines', { id: 'edge-scanlines', scanlines: 24 }),
        makeEffectPresetLayer('rgbSplit', { id: 'edge-rgb', rgbSplit: 14 }),
        makeEffectPresetLayer('barrel', { id: 'edge-barrel', barrel: 40 }),
        makeEffectPresetLayer('bloom', { id: 'edge-bloom', bloom: 60 }),
        makeEffectPresetLayer('blur', { id: 'edge-blur', blurAmt: 6 }),
      ],
      export: { format: 'png' as const, scale: 1 as const, target: 'cover' as const },
    };
    const size = 270;
    const render = async (mergeGpuPasses: boolean) => {
      performance.clearMeasures('artifact:gpu-filter-extract');
      const canvas = await renderDocument(doc, size, size, new Map(), { graphMode: 'stack', mergeGpuPasses });
      return {
        pixels: canvas.getContext('2d')!.getImageData(0, 0, size, size).data,
        gpuPasses: performance.getEntriesByName('artifact:gpu-filter-extract').length,
      };
    };

    await render(false);
    const separate = await render(false);
    const merged = await render(true);
    let differing = 0;
    let maxDelta = 0;
    for (let index = 0; index < separate.pixels.length; index += 1) {
      const delta = Math.abs(separate.pixels[index] - merged.pixels[index]);
      if (delta > 0) differing += 1;
      maxDelta = Math.max(maxDelta, delta);
    }
    return { differing, maxDelta, separatePasses: separate.gpuPasses, mergedPasses: merged.gpuPasses };
  });

  expect(result.separatePasses).toBe(2);
  expect(result.mergedPasses).toBe(1);
  expect(result).toMatchObject({ differing: 0, maxDelta: 0 });
});

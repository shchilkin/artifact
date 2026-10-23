/**
 * Golden render fixtures for every shipped starter, curated example, and landing hero frame.
 *
 * Three layers of protection, see docs/testing.md ("Golden render fixtures"):
 * 1. GPU recipes (every run): the PixiJS filters each render asks for, with their uniforms, are recorded through a
 *    pixi.js mock and compared with `__golden__/recipes/*.json`. This is platform independent.
 * 2. Stack/graph parity (every run): whether a stack document renders the same pixels after the editor bootstraps
 *    its graph is recorded in the same recipe file.
 * 3. Pixels (GOLDEN_PIXELS=1 only): a SHA-256 of the RGBA output of each preview and export render is compared with
 *    `__golden__/pixels.json`. Text and emoji rasterize differently per OS, so these hashes are only valid inside the
 *    pinned Playwright container used by CI. Run them with `npm run test:golden`.
 *
 * GPU passes return their input unchanged here, so pixel hashes cover Canvas 2D, worker, and CPU paths; GPU effects
 * are covered by the recipe files and by browser smoke tests.
 *
 * Update baselines with `npm run test:golden:update` (pixels and recipes) or `vitest -u` (recipes only).
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { afterAll, describe, expect, it, vi } from 'vitest';
import type { CanvasDocument } from '../../../types/config';
import { normalizeDocument } from '../../../utils/documentPersistence';
import { renderCoverExportCanvas } from '../../../utils/exportCanvas';
import { renderDocument } from '../../../utils/renderer';
import { collectGoldenCases, documentForMode, type GoldenMode, previewSize } from './goldenCases';

interface RecordedFilter {
  frag?: string;
  uniforms?: Record<string, unknown>;
  blur?: { strength: number; quality: number };
}

const gpu = vi.hoisted(() => ({ passes: [] as RecordedFilter[][] }));

vi.mock('pixi.js', () => ({
  Filter: class Filter {
    golden: RecordedFilter;
    padding = 0;
    constructor(_vertex: unknown, frag: string, uniforms: Record<string, unknown>) {
      this.golden = { frag, uniforms: { ...uniforms } };
    }
  },
  BlurFilter: class BlurFilter {
    golden: RecordedFilter;
    padding = 0;
    constructor(strength: number, quality: number) {
      this.golden = { blur: { strength, quality } };
    }
  },
}));

vi.mock('../../../utils/gpuRender', () => ({
  setGpuReadback: () => {},
  gpuRenderToCanvas: async ({
    source,
    filters,
  }: {
    source: HTMLCanvasElement;
    filters: { golden: RecordedFilter }[];
  }) => {
    gpu.passes.push(filters.map((filter) => filter.golden));
    return source;
  },
}));

const PIXELS = process.env.GOLDEN_PIXELS === '1';
const UPDATE = process.env.GOLDEN_UPDATE === '1';
const GOLDEN_DIR = fileURLToPath(new URL('./__golden__/', import.meta.url));
const RECIPE_DIR = `${GOLDEN_DIR}recipes/`;
const THUMB_DIR = `${GOLDEN_DIR}thumbs/`;
const PIXELS_FILE = `${GOLDEN_DIR}pixels.json`;
const FAILURE_DIR = fileURLToPath(new URL('../../../../../../test-results/render-golden/', import.meta.url));
const PUBLIC_DIR = fileURLToPath(new URL('../../../../public/', import.meta.url));
const THUMB_LONG_SIDE = 128;

const storedPixels: Record<string, string> = existsSync(PIXELS_FILE)
  ? JSON.parse(readFileSync(PIXELS_FILE, 'utf8'))
  : {};
const actualPixels: Record<string, string> = {};

type RenderedCanvas = HTMLCanvasElement & { toBuffer(mime: 'image/png'): Buffer };

function roundNumbers(value: unknown): unknown {
  if (typeof value === 'number') return Number.isInteger(value) ? value : Number(value.toPrecision(8));
  if (Array.isArray(value) || ArrayBuffer.isView(value)) return Array.from(value as ArrayLike<unknown>, roundNumbers);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, roundNumbers(entry)]));
  }
  return value;
}

function describeFilter(filter: RecordedFilter) {
  if (filter.blur) return { filter: 'blur', ...filter.blur };
  const shader = createHash('sha256')
    .update(filter.frag ?? '')
    .digest('hex')
    .slice(0, 12);
  return { filter: 'shader', shader, uniforms: roundNumbers(filter.uniforms) };
}

function pixelData(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('getContext returned null');
  return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
}

function pixelHash(canvas: HTMLCanvasElement) {
  return createHash('sha256').update(`${canvas.width}x${canvas.height}:`).update(pixelData(canvas)).digest('hex');
}

function pixelsEqual(a: HTMLCanvasElement, b: HTMLCanvasElement) {
  return a.width === b.width && a.height === b.height && pixelHash(a) === pixelHash(b);
}

function thumbnail(canvas: HTMLCanvasElement): RenderedCanvas {
  const scale = THUMB_LONG_SIDE / Math.max(canvas.width, canvas.height);
  const thumb = createCanvas(Math.round(canvas.width * scale), Math.round(canvas.height * scale));
  const ctx = thumb.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas as unknown as Parameters<typeof ctx.drawImage>[0], 0, 0, thumb.width, thumb.height);
  return thumb as unknown as RenderedCanvas;
}

async function loadImageCache(docs: CanvasDocument[]) {
  const sources = new Set<string>();
  for (const doc of docs) {
    for (const layer of doc.layers) if (layer.kind === 'image' && layer.src) sources.add(layer.src);
  }
  const cache = new Map<string, HTMLImageElement>();
  for (const src of sources) {
    if (!src.startsWith('/')) throw new Error(`Golden fixtures only support public images, got ${src.slice(0, 40)}`);
    cache.set(src, (await loadImage(`${PUBLIC_DIR}${src.slice(1)}`)) as unknown as HTMLImageElement);
  }
  return cache;
}

async function recordRender(render: () => Promise<HTMLCanvasElement>) {
  gpu.passes = [];
  const canvas = await render();
  const gpuPasses = gpu.passes.map((pass) => pass.map(describeFilter));
  return { canvas, recipe: { size: `${canvas.width}x${canvas.height}`, gpuPasses } };
}

function checkPixels(key: string, canvas: HTMLCanvasElement, thumbName?: string) {
  const hash = pixelHash(canvas);
  actualPixels[key] = hash;
  if (UPDATE) {
    if (thumbName) {
      mkdirSync(THUMB_DIR, { recursive: true });
      writeFileSync(`${THUMB_DIR}${thumbName}`, thumbnail(canvas).toBuffer('image/png'));
    }
    return;
  }
  if (storedPixels[key] === hash) return;
  mkdirSync(FAILURE_DIR, { recursive: true });
  const file = `${FAILURE_DIR}${key.replaceAll('/', '.')}.png`;
  writeFileSync(file, (canvas as RenderedCanvas).toBuffer('image/png'));
  expect
    .soft(hash, `${key} pixels changed; actual render written to ${file}`)
    .toBe(storedPixels[key] ?? 'missing baseline');
}

const cases = collectGoldenCases();
const imageCache = await loadImageCache(cases.map((goldenCase) => goldenCase.doc));

describe('golden render fixtures', () => {
  it('collects every starter, example, and hero frame once', () => {
    expect(cases.length).toBeGreaterThanOrEqual(30);
    expect(new Set(cases.map((goldenCase) => goldenCase.id)).size).toBe(cases.length);
  });

  it.each(cases)('$id', { timeout: 60_000 }, async ({ id, doc, modes }) => {
    const [width, height] = previewSize(doc);
    const recipe: Record<string, unknown> = {};
    const previews = new Map<GoldenMode, HTMLCanvasElement>();

    for (const mode of modes) {
      const modeDoc = documentForMode(doc, mode);
      const preview = await recordRender(() => renderDocument(modeDoc, width, height, imageCache));
      const exported = await recordRender(() => renderCoverExportCanvas(modeDoc, imageCache, 1));
      previews.set(mode, preview.canvas);
      const normalizedDoc = documentForMode(normalizeDocument(JSON.parse(JSON.stringify(doc))), mode);
      const normalized = await recordRender(() => renderDocument(normalizedDoc, width, height, imageCache));
      expect
        .soft(pixelsEqual(normalized.canvas, preview.canvas), `${id}/${mode} changes after normalizeDocument`)
        .toBe(true);
      expect
        .soft(normalized.recipe, `${id}/${mode} GPU recipe changes after normalizeDocument`)
        .toEqual(preview.recipe);
      recipe[mode] = { preview: preview.recipe, export: exported.recipe };

      if (PIXELS) {
        checkPixels(`${id}/${mode}/preview`, preview.canvas, `${id}.${mode}.png`);
        checkPixels(`${id}/${mode}/export`, exported.canvas);
      }
    }

    const stack = previews.get('stack');
    const graph = previews.get('graph');
    if (stack && graph) recipe.stackMatchesGraph = pixelsEqual(stack, graph);

    await expect(`${JSON.stringify(recipe, null, 2)}\n`).toMatchFileSnapshot(`${RECIPE_DIR}${id}.json`);
  });
});

afterAll(() => {
  if (!PIXELS || !UPDATE) return;
  const sorted = Object.fromEntries(Object.entries(actualPixels).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(PIXELS_FILE, `${JSON.stringify(sorted, null, 2)}\n`);
  const thumbs = new Set(cases.flatMap(({ id, modes }) => modes.map((mode) => `${id}.${mode}.png`)));
  for (const file of existsSync(THUMB_DIR) ? readdirSync(THUMB_DIR) : []) {
    if (!thumbs.has(file)) rmSync(`${THUMB_DIR}${file}`);
  }
});

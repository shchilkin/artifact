import { describe, expect, it } from 'vitest';

import type { CanvasDocument, CanvasGraph } from '../../types/config';
import { makeEffectLayer, makeFillLayer, makeSourceLayer } from '../../types/config';
import { EXPORT_NODE_ID } from '../../utils/nodeGraph';
import { isGpuOnlyEffectLayer } from '../../utils/render/layers';
import { type GraphRenderCache, renderDocument, renderGraphTarget } from '../../utils/renderer';

function samplePixel(canvas: HTMLCanvasElement, x: number, y: number): [number, number, number, number] {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('getContext returned null');
  const { data } = ctx.getImageData(x, y, 1, 1);
  return [data[0], data[1], data[2], data[3]];
}

function centerPixel(canvas: HTMLCanvasElement) {
  return samplePixel(canvas, Math.floor(canvas.width / 2), Math.floor(canvas.height / 2));
}

function allPixels(canvas: HTMLCanvasElement): Uint8ClampedArray {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('getContext returned null');
  return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
}

function pixelsEqual(a: Uint8ClampedArray, b: Uint8ClampedArray): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function alphaBounds(canvas: HTMLCanvasElement): { width: number; height: number } {
  const pixels = allPixels(canvas);
  let minX = canvas.width;
  let minY = canvas.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const alpha = pixels[(y * canvas.width + x) * 4 + 3] ?? 0;
      if (alpha <= 8) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return {
    width: Math.max(0, maxX - minX + 1),
    height: Math.max(0, maxY - minY + 1),
  };
}

function graphDocument(graph: CanvasGraph): CanvasDocument {
  return {
    global: { bg: '#000000', seed: 1, aspect: '1:1' },
    layers: [
      makeFillLayer({ id: 'red-fill', color: '#ff0000', opacity: 100, blendMode: 'normal' }),
      makeFillLayer({ id: 'blue-fill', color: '#0000ff', opacity: 100, blendMode: 'normal' }),
    ],
    graph,
    export: { format: 'png', scale: 1, target: 'cover' },
  };
}

describe('renderDocument graph mode', () => {
  it('renders the export node from graph topology instead of layer stack order', async () => {
    const doc = graphDocument({
      edges: [{ id: 'e-red-export', fromId: 'red-fill', fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' }],
      positions: {},
      mergeNodes: [],
      colorNodes: [],
    });

    const graphCanvas = await renderDocument(doc, 40, 40, new Map(), {
      skipEffects: true,
      graphMode: 'graph',
    });
    const stackCanvas = await renderDocument(doc, 40, 40, new Map(), {
      skipEffects: true,
      graphMode: 'stack',
    });

    const [graphR, graphG, graphB] = centerPixel(graphCanvas);
    const [stackR, stackG, stackB] = centerPixel(stackCanvas);

    expect(graphR).toBeGreaterThan(240);
    expect(graphG).toBeLessThan(10);
    expect(graphB).toBeLessThan(10);
    expect(stackB).toBeGreaterThan(240);
    expect(stackR).toBeLessThan(10);
    expect(stackG).toBeLessThan(10);
  });

  it('matches renderGraphTarget for the export node on a deterministic graph', async () => {
    const graph: CanvasGraph = {
      edges: [
        { id: 'e-red-merge', fromId: 'red-fill', fromPort: 'out', toId: 'merge-1', toPort: 'a' },
        { id: 'e-blue-merge', fromId: 'blue-fill', fromPort: 'out', toId: 'merge-1', toPort: 'b' },
        { id: 'e-merge-export', fromId: 'merge-1', fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' },
      ],
      positions: {},
      mergeNodes: [{ id: 'merge-1', name: 'Merge', blendMode: 'source-over', opacity: 50 }],
      colorNodes: [],
    };
    const doc = graphDocument(graph);
    const options = { skipEffects: true as const };

    const documentCanvas = await renderDocument(doc, 40, 40, new Map(), {
      ...options,
      graphMode: 'graph',
    });
    const targetCanvas = await renderGraphTarget(doc, graph, EXPORT_NODE_ID, 40, 40, new Map(), options);

    expect(pixelsEqual(allPixels(documentCanvas), allPixels(targetCanvas))).toBe(true);
  });

  it('keeps graph output transparent when no upstream node provides a background', async () => {
    const transparentFill = makeFillLayer({
      id: 'transparent-fill',
      color: '#ff0000',
      opacity: 0,
      blendMode: 'normal',
    });
    const graph: CanvasGraph = {
      edges: [
        { id: 'e-transparent-export', fromId: transparentFill.id, fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' },
      ],
      positions: {},
      mergeNodes: [],
      colorNodes: [],
    };
    const doc: CanvasDocument = {
      global: { bg: '#552266', seed: 1, aspect: '1:1' },
      layers: [transparentFill],
      graph,
      export: { format: 'png', scale: 1, target: 'cover' },
    };

    const graphCanvas = await renderDocument(doc, 32, 32, new Map(), {
      skipEffects: true,
      graphMode: 'graph',
    });
    const outputCanvas = await renderGraphTarget(doc, graph, EXPORT_NODE_ID, 32, 32, new Map(), {
      skipEffects: true,
    });
    const stackCanvas = await renderDocument(doc, 32, 32, new Map(), {
      skipEffects: true,
      graphMode: 'stack',
    });

    expect(centerPixel(graphCanvas)[3]).toBe(0);
    expect(centerPixel(outputCanvas)[3]).toBe(0);
    expect(centerPixel(stackCanvas)[3]).toBe(255);
  });
});

describe('renderGraphTarget', () => {
  it('classifies only readback-safe GPU effects as batchable', () => {
    expect(isGpuOnlyEffectLayer(makeEffectLayer({ bloom: 40 }))).toBe(true);
    expect(isGpuOnlyEffectLayer(makeEffectLayer({ bloom: 40, maskAlpha: true }))).toBe(false);
    expect(isGpuOnlyEffectLayer(makeEffectLayer({ bloom: 40, grain: 20 }))).toBe(false);
    expect(isGpuOnlyEffectLayer(makeEffectLayer({ rgbSplit: 20 }))).toBe(false);
    expect(isGpuOnlyEffectLayer(makeEffectLayer({ solarize: 70 }))).toBe(false);
  });

  it('can reuse an external render cache across sibling graph targets', async () => {
    const graph: CanvasGraph = {
      edges: [
        { id: 'e-red-color-a', fromId: 'red-fill', fromPort: 'out', toId: 'color-a', toPort: 'in' },
        { id: 'e-red-color-b', fromId: 'red-fill', fromPort: 'out', toId: 'color-b', toPort: 'in' },
      ],
      positions: {},
      mergeNodes: [],
      colorNodes: [
        {
          id: 'color-a',
          name: 'Color A',
          contrast: 100,
          brightness: 80,
          saturation: 100,
          hue: 0,
        },
        {
          id: 'color-b',
          name: 'Color B',
          contrast: 100,
          brightness: 60,
          saturation: 100,
          hue: 0,
        },
      ],
    };
    const doc = graphDocument(graph);
    const cache: GraphRenderCache = { namespace: 'shared-session', entries: new Map() };

    const uncached = await renderGraphTarget(doc, graph, 'color-b', 40, 40, new Map(), { skipEffects: true });
    await renderGraphTarget(doc, graph, 'color-a', 40, 40, new Map(), { skipEffects: true }, cache);
    const cachedUpstream = cache.entries.get('shared-session:red-fill');
    const cached = await renderGraphTarget(doc, graph, 'color-b', 40, 40, new Map(), { skipEffects: true }, cache);

    expect(cachedUpstream).toBeDefined();
    expect(cache.entries.get('shared-session:red-fill')).toBe(cachedUpstream);
    expect(pixelsEqual(allPixels(cached), allPixels(uncached))).toBe(true);
  });

  it('composites merge node inputs with merge opacity', async () => {
    const graph: CanvasGraph = {
      edges: [
        { id: 'e-red-merge', fromId: 'red-fill', fromPort: 'out', toId: 'merge-1', toPort: 'a' },
        { id: 'e-blue-merge', fromId: 'blue-fill', fromPort: 'out', toId: 'merge-1', toPort: 'b' },
        { id: 'e-merge-export', fromId: 'merge-1', fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' },
      ],
      positions: {},
      mergeNodes: [{ id: 'merge-1', name: 'Merge', blendMode: 'source-over', opacity: 50 }],
      colorNodes: [],
    };
    const doc = graphDocument(graph);

    const canvas = await renderGraphTarget(doc, graph, EXPORT_NODE_ID, 40, 40, new Map(), {
      skipEffects: true,
    });
    const [r, g, b, a] = centerPixel(canvas);

    expect(r).toBeGreaterThan(100);
    expect(b).toBeGreaterThan(100);
    expect(g).toBeLessThan(10);
    expect(a).toBe(255);
  });

  it('applies color node adjustments to an upstream branch', async () => {
    const graph: CanvasGraph = {
      edges: [
        { id: 'e-red-color', fromId: 'red-fill', fromPort: 'out', toId: 'color-1', toPort: 'in' },
        { id: 'e-color-export', fromId: 'color-1', fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' },
      ],
      positions: {},
      mergeNodes: [],
      colorNodes: [
        {
          id: 'color-1',
          name: 'Color',
          contrast: 100,
          brightness: 50,
          saturation: 100,
          hue: 0,
        },
      ],
    };
    const doc = graphDocument(graph);

    const neutralCanvas = await renderGraphTarget(
      graphDocument({ ...graph, colorNodes: [{ ...graph.colorNodes[0], brightness: 100 }] }),
      { ...graph, colorNodes: [{ ...graph.colorNodes[0], brightness: 100 }] },
      EXPORT_NODE_ID,
      40,
      40,
      new Map(),
      { skipEffects: true },
    );
    const darkenedCanvas = await renderGraphTarget(doc, graph, EXPORT_NODE_ID, 40, 40, new Map(), {
      skipEffects: true,
    });
    const [neutralR] = centerPixel(neutralCanvas);
    const [darkenedR, darkenedG, darkenedB, darkenedA] = centerPixel(darkenedCanvas);

    expect(darkenedR).toBeLessThan(neutralR);
    expect(darkenedR).toBeGreaterThan(100);
    expect(darkenedG).toBe(0);
    expect(darkenedB).toBe(0);
    expect(darkenedA).toBe(255);
  });

  it('draws procedural noise as a full-frame source for non-square graph targets', async () => {
    const noise = makeSourceLayer('noise', {
      id: 'noise-wide',
      name: 'Wide Noise',
      noiseType: 'value',
      noiseScale: 12,
      noiseDetail: 4,
      noiseContrast: 100,
      noiseBalance: 5,
      color: '#ffffff',
      accentColor: '#ffffff',
    });
    const graph: CanvasGraph = {
      edges: [{ id: 'e-noise-export', fromId: 'noise-wide', fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' }],
      positions: {},
      mergeNodes: [],
      colorNodes: [],
    };
    const doc: CanvasDocument = {
      global: { bg: 'transparent', seed: 7, aspect: '16:9' },
      layers: [noise],
      graph,
      export: { format: 'png', scale: 1, target: 'cover' },
    };

    const canvas = await renderGraphTarget(doc, graph, EXPORT_NODE_ID, 320, 180, new Map(), {
      skipEffects: true,
    });

    const bounds = alphaBounds(canvas);
    expect(bounds.width).toBeGreaterThan(300);
    expect(bounds.height).toBeGreaterThan(160);
  });

  it('repeats an upstream source branch over an optional backdrop', async () => {
    const source = makeFillLayer({ id: 'source-fill', color: '#ff0000', opacity: 100, blendMode: 'normal' });
    const backdrop = makeFillLayer({ id: 'backdrop-fill', color: '#0000ff', opacity: 100, blendMode: 'normal' });
    const graph: CanvasGraph = {
      edges: [
        { id: 'e-source-repeat', fromId: 'source-fill', fromPort: 'out', toId: 'repeat-1', toPort: 'in' },
        { id: 'e-backdrop-repeat', fromId: 'backdrop-fill', fromPort: 'out', toId: 'repeat-1', toPort: 'bg' },
        { id: 'e-repeat-export', fromId: 'repeat-1', fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' },
      ],
      positions: {},
      mergeNodes: [],
      colorNodes: [],
      repeatNodes: [
        {
          id: 'repeat-1',
          name: 'Repeater',
          pattern: 'grid',
          count: 2,
          rows: 2,
          gap: 260,
          radius: 80,
          scale: 16,
          jitter: 0,
          rotation: 0,
          seedOffset: 0,
          opacity: 100,
          blendMode: 'source-over',
        },
      ],
    };
    const doc: CanvasDocument = {
      global: { bg: 'transparent', seed: 3, aspect: '1:1' },
      layers: [source, backdrop],
      graph,
      export: { format: 'png', scale: 1, target: 'cover' },
    };

    const canvas = await renderGraphTarget(doc, graph, EXPORT_NODE_ID, 200, 200, new Map(), {
      skipEffects: true,
    });
    const [itemR, , itemB] = samplePixel(canvas, 52, 52);
    const [cornerR, , cornerB] = samplePixel(canvas, 4, 4);

    expect(itemR).toBeGreaterThan(200);
    expect(itemB).toBeLessThan(30);
    expect(cornerB).toBeGreaterThan(200);
    expect(cornerR).toBeLessThan(30);
  });

  it('repeat node seed offset varies jitter without changing the document seed', async () => {
    const source = makeFillLayer({ id: 'source-fill', color: '#ff0000', opacity: 100, blendMode: 'normal' });
    const makeGraph = (seedOffset: number): CanvasGraph => ({
      edges: [
        { id: 'e-source-repeat', fromId: 'source-fill', fromPort: 'out', toId: 'repeat-1', toPort: 'in' },
        { id: 'e-repeat-export', fromId: 'repeat-1', fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' },
      ],
      positions: {},
      mergeNodes: [],
      colorNodes: [],
      repeatNodes: [
        {
          id: 'repeat-1',
          name: 'Repeater',
          pattern: 'grid',
          count: 3,
          rows: 3,
          gap: 180,
          radius: 80,
          scale: 12,
          jitter: 45,
          rotation: 0,
          seedOffset,
          opacity: 100,
          blendMode: 'source-over',
        },
      ],
    });
    const render = (seedOffset: number) => {
      const graph = makeGraph(seedOffset);
      return renderGraphTarget(
        {
          global: { bg: 'transparent', seed: 5, aspect: '1:1' },
          layers: [source],
          graph,
          export: { format: 'png', scale: 1, target: 'cover' },
        },
        graph,
        EXPORT_NODE_ID,
        180,
        180,
        new Map(),
        { skipEffects: true },
      );
    };

    const base = await render(0);
    const baseAgain = await render(0);
    const varied = await render(23);

    expect(pixelsEqual(allPixels(base), allPixels(baseAgain))).toBe(true);
    expect(pixelsEqual(allPixels(base), allPixels(varied))).toBe(false);
  });
});

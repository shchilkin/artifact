import { describe, expect, it } from 'vitest';

import type { CanvasDocument, CanvasGraph } from '../../types/config';
import { makeEffectLayer, makeFillLayer, makeSourceLayer, makeTextLayer } from '../../types/config';
import { reorderDocumentLayers } from '../../utils/documentCommands';
import { EXPORT_NODE_ID } from '../../utils/nodeGraph';
import { measureAlphaBounds } from '../../utils/render/alphaBounds';
import { isGpuOnlyEffectLayer } from '../../utils/render/layers';
import { type GraphRenderCache, renderDocument, renderGraphTarget } from '../../utils/renderer';
import { allPixels, alphaBounds, centerPixel, pixelsEqual, samplePixel } from './fixtures';

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

function mergeGraph(): CanvasGraph {
  return {
    edges: [
      { id: 'e-red-merge', fromId: 'red-fill', fromPort: 'out', toId: 'merge-1', toPort: 'a' },
      { id: 'e-blue-merge', fromId: 'blue-fill', fromPort: 'out', toId: 'merge-1', toPort: 'b' },
      { id: 'e-merge-export', fromId: 'merge-1', fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' },
    ],
    positions: {},
    mergeNodes: [{ id: 'merge-1', name: 'Merge', blendMode: 'source-over', opacity: 50 }],
    colorNodes: [],
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
    const graph = mergeGraph();
    const doc = graphDocument(graph);
    const options = { skipEffects: true as const };

    const documentCanvas = await renderDocument(doc, 40, 40, new Map(), {
      ...options,
      graphMode: 'graph',
    });
    const targetCanvas = await renderGraphTarget(doc, graph, EXPORT_NODE_ID, 40, 40, new Map(), options);

    expect(pixelsEqual(allPixels(documentCanvas), allPixels(targetCanvas))).toBe(true);
  });

  it('renders layer reorder results through the synced graph export path', async () => {
    const doc = graphDocument({
      edges: [{ id: 'e-red-export', fromId: 'red-fill', fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' }],
      positions: {},
      mergeNodes: [],
      colorNodes: [],
    });
    const reordered = reorderDocumentLayers(doc, [doc.layers[1]!, doc.layers[0]!]);

    const graphCanvas = await renderDocument(reordered, 40, 40, new Map(), {
      skipEffects: true,
      graphMode: 'graph',
    });
    const stackCanvas = await renderDocument(reordered, 40, 40, new Map(), {
      skipEffects: true,
      graphMode: 'stack',
    });

    expect(pixelsEqual(allPixels(graphCanvas), allPixels(stackCanvas))).toBe(true);
    expect(centerPixel(graphCanvas)[0]).toBeGreaterThan(240);
    expect(centerPixel(graphCanvas)[2]).toBeLessThan(10);
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
    const graph = mergeGraph();
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

  it('masks an upstream branch by alpha and threshold mattes', async () => {
    const source = makeFillLayer({ id: 'source-fill', color: '#ff0000', opacity: 100, blendMode: 'normal' });
    const matte = makeSourceLayer('array', {
      id: 'matte-array',
      color: '#777777',
      accentColor: '#777777',
      blendMode: 'normal',
      arrayPattern: 'line',
      arrayShape: 'disc',
      arrayCount: 1,
      arrayRows: 1,
      arrayGap: 80,
      arraySize: 48,
      arrayRadius: 40,
      arrayJitter: 0,
    });
    const makeGraph = (mode: 'alpha' | 'threshold', threshold = 50): CanvasGraph => ({
      edges: [
        { id: 'e-source-mask', fromId: source.id, fromPort: 'out', toId: 'mask-1', toPort: 'in' },
        { id: 'e-matte-mask', fromId: matte.id, fromPort: 'out', toId: 'mask-1', toPort: 'mask' },
        { id: 'e-mask-export', fromId: 'mask-1', fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' },
      ],
      positions: {},
      mergeNodes: [],
      colorNodes: [],
      maskNodes: [
        {
          id: 'mask-1',
          name: 'Mask',
          mode,
          invert: false,
          threshold,
          feather: 0,
          expand: 0,
          opacity: 100,
        },
      ],
    });
    const render = (graph: CanvasGraph) =>
      renderGraphTarget(
        {
          global: { bg: 'transparent', seed: 9, aspect: '1:1' },
          layers: [source, matte],
          graph,
          export: { format: 'png', scale: 1, target: 'cover' },
        },
        graph,
        EXPORT_NODE_ID,
        80,
        80,
        new Map(),
        { skipEffects: true },
      );

    const alphaCanvas = await render(makeGraph('alpha'));
    const thresholdCanvas = await render(makeGraph('threshold', 60));

    expect(samplePixel(alphaCanvas, 40, 40)[3]).toBeGreaterThan(120);
    expect(samplePixel(alphaCanvas, 4, 4)[3]).toBe(0);
    expect(samplePixel(thresholdCanvas, 40, 40)[3]).toBe(0);
  });

  it('transforms a completed upstream branch after graph composition', async () => {
    const source = makeSourceLayer('array', {
      id: 'source-array',
      arrayPattern: 'line',
      arrayShape: 'bar',
      arrayCount: 2,
      arrayRows: 1,
      arrayGap: 28,
      arraySize: 14,
      arrayRadius: 40,
      arrayJitter: 0,
      color: '#ffffff',
      accentColor: '#ffffff',
    });
    const makeGraph = (rotation: number, x: number): CanvasGraph => ({
      edges: [
        { id: 'e-source-transform', fromId: source.id, fromPort: 'out', toId: 'transform-1', toPort: 'in' },
        { id: 'e-transform-export', fromId: 'transform-1', fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' },
      ],
      positions: {},
      mergeNodes: [],
      colorNodes: [],
      transformNodes: [
        {
          id: 'transform-1',
          name: 'Transform',
          x,
          y: 0,
          scaleX: 100,
          scaleY: 100,
          uniformScale: true,
          rotation,
          opacity: 100,
        },
      ],
    });
    const render = (graph: CanvasGraph) =>
      renderGraphTarget(
        {
          global: { bg: 'transparent', seed: 21, aspect: '1:1' },
          layers: [source],
          graph,
          export: { format: 'png', scale: 1, target: 'cover' },
        },
        graph,
        EXPORT_NODE_ID,
        100,
        100,
        new Map(),
        { skipEffects: true },
      );

    const neutral = await render(makeGraph(0, 0));
    const transformed = await render(makeGraph(35, 24));

    expect(alphaBounds(transformed).width).toBeGreaterThan(0);
    expect(alphaBounds(transformed).height).toBeGreaterThan(0);
    expect(pixelsEqual(allPixels(neutral), allPixels(transformed))).toBe(false);
  });

  it('can rotate a masked-looking branch around its visible alpha center', async () => {
    const faintBackdrop = makeFillLayer({
      id: 'faint-backdrop',
      color: '#ffffff',
      opacity: 4,
      blendMode: 'normal',
    });
    const source = makeTextLayer({
      id: 'small-type',
      content: 'L',
      font: 'Arial',
      size: 24,
      color: '#ffffff',
      x: 0.25,
      y: 0.3,
      rotation: 0,
      align: 'center',
      scaleX: 1,
      scaleY: 1,
      opacity: 100,
      blendMode: 'normal',
    });
    const makeGraph = (pivotMode: 'canvas' | 'visible'): CanvasGraph => ({
      edges: [
        { id: 'e-faint-source', fromId: faintBackdrop.id, fromPort: 'out', toId: source.id, toPort: 'bg' },
        { id: 'e-source-transform', fromId: source.id, fromPort: 'out', toId: 'transform-1', toPort: 'in' },
        { id: 'e-transform-export', fromId: 'transform-1', fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' },
      ],
      positions: {},
      mergeNodes: [],
      colorNodes: [],
      transformNodes: [
        {
          id: 'transform-1',
          name: 'Transform',
          x: 0,
          y: 0,
          scaleX: 100,
          scaleY: 100,
          uniformScale: true,
          rotation: 90,
          pivotMode,
          opacity: 100,
        },
      ],
    });
    const render = (graph: CanvasGraph) =>
      renderGraphTarget(
        {
          global: { bg: 'transparent', seed: 21, aspect: '1:1' },
          layers: [faintBackdrop, source],
          graph,
          export: { format: 'png', scale: 1, target: 'cover' },
        },
        graph,
        EXPORT_NODE_ID,
        100,
        100,
        new Map(),
        { skipEffects: true },
      );

    const canvasPivot = measureAlphaBounds(await render(makeGraph('canvas')), 24);
    const visiblePivot = measureAlphaBounds(await render(makeGraph('visible')), 24);

    expect(canvasPivot).toBeTruthy();
    expect(visiblePivot).toBeTruthy();
    expect((canvasPivot!.minX + canvasPivot!.maxX) / 2).toBeGreaterThan(55);
    expect((visiblePivot!.minX + visiblePivot!.maxX) / 2).toBeLessThan(40);
  });

  it('grime shadow can render a shifted shadow from visible source alpha', async () => {
    const source = makeTextLayer({
      id: 'shadow-source',
      content: 'A',
      font: 'Arial',
      size: 48,
      color: '#ffffff',
      x: 0.35,
      y: 0.42,
      rotation: 0,
      align: 'center',
      scaleX: 1,
      scaleY: 1,
      opacity: 100,
      blendMode: 'normal',
    });
    const sourceGraph: CanvasGraph = {
      edges: [{ id: 'e-source-export', fromId: source.id, fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' }],
      positions: {},
      mergeNodes: [],
      colorNodes: [],
    };
    const shadowGraph: CanvasGraph = {
      edges: [
        { id: 'e-source-shadow', fromId: source.id, fromPort: 'out', toId: 'shadow-1', toPort: 'in' },
        { id: 'e-shadow-export', fromId: 'shadow-1', fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' },
      ],
      positions: {},
      mergeNodes: [],
      colorNodes: [],
      grimeShadowNodes: [
        {
          id: 'shadow-1',
          name: 'Grime Shadow',
          x: 120,
          y: 0,
          layers: 1,
          blur: 0,
          spread: 0,
          grime: 0,
          jitter: 0,
          opacity: 100,
          color: '#000000',
          seedOffset: 0,
          shadowOnly: true,
        },
      ],
    };
    const render = (graph: CanvasGraph) =>
      renderGraphTarget(
        {
          global: { bg: 'transparent', seed: 21, aspect: '1:1' },
          layers: [source],
          graph,
          export: { format: 'png', scale: 1, target: 'cover' },
        },
        graph,
        EXPORT_NODE_ID,
        120,
        120,
        new Map(),
        { skipEffects: true },
      );

    const sourceBounds = measureAlphaBounds(await render(sourceGraph), 24);
    const shadowBounds = measureAlphaBounds(await render(shadowGraph), 24);

    expect(sourceBounds).toBeTruthy();
    expect(shadowBounds).toBeTruthy();
    expect(shadowBounds!.minX).toBeGreaterThan(sourceBounds!.minX + 16);
    expect(shadowBounds!.width).toBeGreaterThan(4);
  });

  it('repeat node step and random rotation are deterministic and change output', async () => {
    const source = makeSourceLayer('array', {
      id: 'source-array',
      arrayPattern: 'line',
      arrayShape: 'bar',
      arrayCount: 1,
      arrayRows: 1,
      arrayGap: 16,
      arraySize: 60,
      arrayRadius: 12,
      arrayJitter: 0,
      color: '#ffffff',
      accentColor: '#ffffff',
    });
    const makeGraph = (
      rotationMode: 'fixed' | 'step' | 'random',
      rotationStep = 0,
      rotationJitter = 0,
    ): CanvasGraph => ({
      edges: [
        { id: 'e-source-repeat', fromId: source.id, fromPort: 'out', toId: 'repeat-1', toPort: 'in' },
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
          gap: 120,
          radius: 80,
          scale: 36,
          jitter: 0,
          rotation: 0,
          rotationMode,
          rotationStep,
          rotationJitter,
          seedOffset: 0,
          opacity: 100,
          blendMode: 'source-over',
        },
      ],
    });
    const render = (graph: CanvasGraph) =>
      renderGraphTarget(
        {
          global: { bg: 'transparent', seed: 12, aspect: '1:1' },
          layers: [source],
          graph,
          export: { format: 'png', scale: 1, target: 'cover' },
        },
        graph,
        EXPORT_NODE_ID,
        160,
        160,
        new Map(),
        { skipEffects: true },
      );

    const fixed = await render(makeGraph('fixed'));
    const step = await render(makeGraph('step', 35));
    const randomA = await render(makeGraph('random', 0, 35));
    const randomB = await render(makeGraph('random', 0, 35));

    expect(pixelsEqual(allPixels(randomA), allPixels(randomB))).toBe(true);
    expect(pixelsEqual(allPixels(fixed), allPixels(step))).toBe(false);
    expect(pixelsEqual(allPixels(step), allPixels(randomA))).toBe(false);
  });
});

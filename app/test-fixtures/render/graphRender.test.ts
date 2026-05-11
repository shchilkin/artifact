import { describe, expect, it } from 'vitest';

import type { CanvasDocument, CanvasGraph } from '../../types/config';
import { makeFillLayer } from '../../types/config';
import { EXPORT_NODE_ID } from '../../utils/nodeGraph';
import { renderDocument, renderGraphTarget } from '../../utils/renderer';

function samplePixel(canvas: HTMLCanvasElement, x: number, y: number): [number, number, number, number] {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('getContext returned null');
  const { data } = ctx.getImageData(x, y, 1, 1);
  return [data[0], data[1], data[2], data[3]];
}

function centerPixel(canvas: HTMLCanvasElement) {
  return samplePixel(canvas, Math.floor(canvas.width / 2), Math.floor(canvas.height / 2));
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
});

describe('renderGraphTarget', () => {
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
});

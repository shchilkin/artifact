import { describe, expect, it } from 'vitest';

import type { CanvasDocument, CanvasGraph, Layer } from '../../types/config';
import {
  MATERIAL_TEXTURE_INPUT_PORTS,
  type MaterialTextureInputPort,
  makeEffectLayer,
  makeFillLayer,
  makeGraphEnvironmentNode,
  makeGraphMaterialNode,
  makeGraphScene3DNode,
  makeGraphShaderNode,
  makeImageLayer,
  makeSourceLayer,
  makeTextLayer,
  SHADER_KINDS,
} from '../../types/config';
import { reorderDocumentLayers } from '../../utils/documentCommands';
import { EXPORT_NODE_ID } from '../../utils/nodeGraph';
import { measureAlphaBounds } from '../../utils/render/alphaBounds';
import { isGpuOnlyEffectLayer } from '../../utils/render/layers';
import { type GraphRenderCache, renderDocument, renderGraphTarget } from '../../utils/renderer';
import { allPixels, alphaBounds, centerPixel, pixelsEqual, samplePixel } from './fixtures';

function graphDocument(graph: CanvasGraph, layers?: Layer[]): CanvasDocument {
  return {
    global: { bg: '#000000', seed: 1, aspect: '1:1' },
    layers: layers ?? [
      makeFillLayer({ id: 'red-fill', color: '#ff0000', opacity: 100, blendMode: 'normal' }),
      makeFillLayer({ id: 'blue-fill', color: '#0000ff', opacity: 100, blendMode: 'normal' }),
    ],
    graph,
    export: { format: 'png', scale: 1, target: 'cover' },
  };
}

function uniquePixelCount(canvas: HTMLCanvasElement) {
  const data = allPixels(canvas);
  const colors = new Set<string>();
  for (let i = 0; i < data.length; i += 4) {
    colors.add(`${data[i]},${data[i + 1]},${data[i + 2]},${data[i + 3]}`);
    if (colors.size > 1) return colors.size;
  }
  return colors.size;
}

function hasVisiblePixels(canvas: HTMLCanvasElement) {
  const data = allPixels(canvas);
  for (let index = 3; index < data.length; index += 4) {
    if ((data[index] ?? 0) > 8) return true;
  }
  return false;
}

function rgbDistance(a: number[], b: number[]) {
  return (
    Math.abs((a[0] ?? 0) - (b[0] ?? 0)) + Math.abs((a[1] ?? 0) - (b[1] ?? 0)) + Math.abs((a[2] ?? 0) - (b[2] ?? 0))
  );
}

function averageRgbDistance(a: HTMLCanvasElement, b: HTMLCanvasElement) {
  const aPixels = allPixels(a);
  const bPixels = allPixels(b);
  let total = 0;
  let count = 0;
  for (let index = 0; index < Math.min(aPixels.length, bPixels.length); index += 4) {
    total += rgbDistance(
      [aPixels[index] ?? 0, aPixels[index + 1] ?? 0, aPixels[index + 2] ?? 0],
      [bPixels[index] ?? 0, bPixels[index + 1] ?? 0, bPixels[index + 2] ?? 0],
    );
    count += 1;
  }
  return count > 0 ? total / count : 0;
}

function createDetailedImageCache(src: string): Map<string, HTMLImageElement> {
  const image = document.createElement('canvas');
  image.width = 96;
  image.height = 96;
  const ctx = image.getContext('2d');
  if (!ctx) throw new Error('getContext returned null');
  const gradient = ctx.createLinearGradient(0, 0, image.width, image.height);
  gradient.addColorStop(0, '#15182c');
  gradient.addColorStop(0.5, '#e5d4ff');
  gradient.addColorStop(1, '#221522');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, image.width, image.height);
  ctx.fillStyle = '#fff3c7';
  ctx.fillRect(12, 18, 48, 10);
  ctx.fillStyle = '#17111f';
  ctx.fillRect(44, 40, 36, 42);
  ctx.fillStyle = '#8f5cff';
  ctx.beginPath();
  ctx.arc(72, 26, 9, 0, Math.PI * 2);
  ctx.fill();

  Object.defineProperties(image, {
    naturalWidth: { value: image.width },
    naturalHeight: { value: image.height },
  });

  return new Map([[src, image as unknown as HTMLImageElement]]);
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

  it.each([
    {
      name: 'shader fill branch',
      layers: [
        makeSourceLayer('primitive', {
          id: 'primitive-a',
          name: 'Primitive A',
          primitiveShape: 'sphere',
          color: '#53231b',
          accentColor: '#ffe0a3',
        }),
      ],
      graph: {
        edges: [
          { id: 'e-shader-material', fromId: 'shader-a', fromPort: 'out', toId: 'material-a', toPort: 'albedo' },
          {
            id: 'e-material-primitive',
            fromId: 'material-a',
            fromPort: 'out',
            toId: 'primitive-a',
            toPort: 'material',
          },
          { id: 'e-primitive-export', fromId: 'primitive-a', fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' },
        ],
        positions: {},
        mergeNodes: [],
        colorNodes: [],
        materialNodes: [makeGraphMaterialNode({ id: 'material-a', materialPreset: 'plastic' })],
        shaderNodes: [
          makeGraphShaderNode({
            id: 'shader-a',
            shaderKind: 'waterCaustic',
            palette: ['#052d3b', '#8ff8d2', '#ffcf6b', '#ffffff'],
            grain: 0,
          }),
        ],
      } satisfies CanvasGraph,
    },
    {
      name: 'input-dependent shader effect branch',
      layers: [
        makeFillLayer({ id: 'effect-source', color: '#2048ff', opacity: 100, blendMode: 'normal' }),
        makeEffectLayer({
          id: 'effect-a',
          preset: 'gradientMap',
          gradientMap: 100,
          gradientMapShadow: '#041020',
          gradientMapMid: '#3ce4b4',
          gradientMapHighlight: '#ffe98a',
        }),
        makeSourceLayer('primitive', {
          id: 'primitive-a',
          name: 'Primitive A',
          primitiveShape: 'sphere',
          color: '#53231b',
          accentColor: '#ffe0a3',
        }),
      ],
      graph: {
        edges: [
          { id: 'e-source-effect', fromId: 'effect-source', fromPort: 'out', toId: 'effect-a', toPort: 'in' },
          { id: 'e-effect-material', fromId: 'effect-a', fromPort: 'out', toId: 'material-a', toPort: 'albedo' },
          {
            id: 'e-material-primitive',
            fromId: 'material-a',
            fromPort: 'out',
            toId: 'primitive-a',
            toPort: 'material',
          },
          { id: 'e-primitive-export', fromId: 'primitive-a', fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' },
        ],
        positions: {},
        mergeNodes: [],
        colorNodes: [],
        materialNodes: [makeGraphMaterialNode({ id: 'material-a', materialPreset: 'plastic' })],
      } satisfies CanvasGraph,
    },
  ])('matches renderGraphTarget for shader material bridge export parity: $name', async ({ graph, layers }) => {
    const doc: CanvasDocument = {
      global: { bg: 'transparent', seed: 29, aspect: '1:1' },
      layers,
      graph,
      export: { format: 'png', scale: 1, target: 'cover' },
    };
    const options = { graphMode: 'graph' as const };

    const documentCanvas = await renderDocument(doc, 96, 96, new Map(), options);
    const targetCanvas = await renderGraphTarget(doc, graph, EXPORT_NODE_ID, 96, 96, new Map(), {});

    expect(hasVisiblePixels(documentCanvas)).toBe(true);
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
  it('renders an upstream branch through an environment map node', async () => {
    const graph: CanvasGraph = {
      edges: [{ id: 'e-red-env', fromId: 'red-fill', fromPort: 'out', toId: 'env-a', toPort: 'in' }],
      positions: {},
      mergeNodes: [],
      colorNodes: [],
      environmentNodes: [makeGraphEnvironmentNode({ id: 'env-a' })],
    };
    const doc = graphDocument(graph);

    const canvas = await renderGraphTarget(doc, graph, 'env-a', 80, 40, new Map(), { skipEffects: true });
    const [r, g, b, a] = centerPixel(canvas);

    expect(canvas.width).toBe(80);
    expect(canvas.height).toBe(40);
    expect(r).toBeGreaterThan(240);
    expect(g).toBeLessThan(10);
    expect(b).toBeLessThan(10);
    expect(a).toBe(255);
  });

  it('keeps generated environment map targets at a 2:1 render ratio', async () => {
    const graph: CanvasGraph = {
      edges: [{ id: 'e-red-env', fromId: 'red-fill', fromPort: 'out', toId: 'env-a', toPort: 'in' }],
      positions: {},
      mergeNodes: [],
      colorNodes: [],
      environmentNodes: [makeGraphEnvironmentNode({ id: 'env-a' })],
    };
    const doc = graphDocument(graph);

    const canvas = await renderGraphTarget(doc, graph, 'env-a', 80, 80, new Map(), { skipEffects: true });

    expect(canvas.width).toBe(160);
    expect(canvas.height).toBe(80);
  });

  it('does not treat generated environment maps as scene backdrops', async () => {
    const graph: CanvasGraph = {
      edges: [
        { id: 'e-red-env', fromId: 'red-fill', fromPort: 'out', toId: 'env-a', toPort: 'in' },
        { id: 'e-env-scene', fromId: 'env-a', fromPort: 'out', toId: 'scene-a', toPort: 'env' },
      ],
      positions: {},
      mergeNodes: [],
      colorNodes: [],
      environmentNodes: [makeGraphEnvironmentNode({ id: 'env-a' })],
      scene3dNodes: [
        {
          id: 'scene-a',
          name: '3D Scene',
          environmentSrc: '',
          environmentName: '',
          environmentMime: '',
          environmentBytes: 0,
          materialMode: 'original',
          transparent: true,
          exposure: 100,
          environmentStrength: 100,
          environmentRotation: 0,
          ambientIntensity: 115,
          keyAzimuth: 38,
          keyElevation: 42,
          keyIntensity: 145,
          fillIntensity: 65,
          rimIntensity: 55,
        },
      ],
    };
    const doc = graphDocument(graph);

    const canvas = await renderGraphTarget(doc, graph, 'scene-a', 80, 80, new Map(), { skipEffects: true });
    const [, , , a] = centerPixel(canvas);

    expect(a).toBe(0);
  });

  it('keeps asset-only environment map nodes transparent in graph renders', async () => {
    const graph: CanvasGraph = {
      edges: [],
      positions: {},
      mergeNodes: [],
      colorNodes: [],
      environmentNodes: [makeGraphEnvironmentNode({ id: 'env-a', environmentSrc: 'artifact-env://env-a' })],
    };
    const doc = graphDocument(graph);

    const canvas = await renderGraphTarget(doc, graph, 'env-a', 80, 40, new Map(), { skipEffects: true });
    const [, , , a] = centerPixel(canvas);

    expect(a).toBe(0);
  });

  it('renders primitive sources through 3D scene model inputs with PBR material nodes', async () => {
    const primitive = makeSourceLayer('primitive', {
      id: 'primitive-a',
      name: 'Primitive A',
      primitiveShape: 'sphere',
      color: '#885533',
      accentColor: '#ffd36a',
    });
    const graph: CanvasGraph = {
      edges: [
        { id: 'e-primitive-scene', fromId: primitive.id, fromPort: 'out', toId: 'scene-a', toPort: 'model' },
        { id: 'e-material-scene', fromId: 'material-a', fromPort: 'out', toId: 'scene-a', toPort: 'material' },
      ],
      positions: {},
      mergeNodes: [],
      colorNodes: [],
      materialNodes: [
        makeGraphMaterialNode({
          id: 'material-a',
          materialPreset: 'chrome',
          materialMetalness: 1,
          materialRoughness: 0.18,
          materialClearcoat: 0.65,
        }),
      ],
      scene3dNodes: [makeGraphScene3DNode({ id: 'scene-a', materialMode: 'original', transparent: true })],
    };
    const doc: CanvasDocument = {
      global: { bg: 'transparent', seed: 1, aspect: '1:1' },
      layers: [primitive],
      graph,
      export: { format: 'png', scale: 1, target: 'cover' },
    };

    const canvas = await renderGraphTarget(doc, graph, 'scene-a', 96, 96, new Map(), { skipEffects: true });

    const pixels = allPixels(canvas);
    let visible = false;
    for (let index = 3; index < pixels.length; index += 4) {
      if ((pixels[index] ?? 0) > 8) {
        visible = true;
        break;
      }
    }
    expect(visible).toBe(true);
  });

  it('renders material node albedo inputs as material previews', async () => {
    const graph: CanvasGraph = {
      edges: [{ id: 'e-red-material', fromId: 'red-fill', fromPort: 'out', toId: 'material-a', toPort: 'albedo' }],
      positions: {},
      mergeNodes: [],
      colorNodes: [],
      materialNodes: [makeGraphMaterialNode({ id: 'material-a', materialPreset: 'chrome' })],
    };
    const doc = graphDocument(graph);

    const canvas = await renderGraphTarget(doc, graph, 'material-a', 32, 32, new Map(), { skipEffects: true });
    const [r, g, b, a] = centerPixel(canvas);

    expect(r).toBeGreaterThan(240);
    expect(g).toBeLessThan(10);
    expect(b).toBeLessThan(10);
    expect(a).toBe(255);
  });

  it('renders unconnected material node previews from the base albedo color', async () => {
    const graph: CanvasGraph = {
      edges: [],
      positions: {},
      mergeNodes: [],
      colorNodes: [],
      materialNodes: [
        makeGraphMaterialNode({
          id: 'material-a',
          materialBaseColor: '#224466',
          materialAccentColor: '#ff00ff',
          materialGrain: 0,
          materialRelief: 0,
        }),
      ],
    };
    const doc = graphDocument(graph);

    const canvas = await renderGraphTarget(doc, graph, 'material-a', 32, 32, new Map(), { skipEffects: true });
    const [r, g, b, a] = centerPixel(canvas);

    expect(r).toBeLessThan(70);
    expect(g).toBeGreaterThan(45);
    expect(b).toBeGreaterThan(80);
    expect(b).toBeGreaterThan(r);
    expect(a).toBe(255);
  });

  it('renders shader nodes as standalone graph sources', async () => {
    const graph: CanvasGraph = {
      edges: [{ id: 'e-shader-export', fromId: 'shader-a', fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' }],
      positions: {},
      mergeNodes: [],
      colorNodes: [],
      shaderNodes: [makeGraphShaderNode({ id: 'shader-a', palette: ['#ff0000', '#00ff00'], grain: 0 })],
    };
    const doc = graphDocument(graph);

    const canvas = await renderGraphTarget(doc, graph, EXPORT_NODE_ID, 32, 32, new Map(), { skipEffects: true });
    const [, , , a] = centerPixel(canvas);

    expect(a).toBe(255);
    expect(new Set(Array.from(allPixels(canvas)))).not.toEqual(new Set([0, 255]));
  });

  it.each(
    SHADER_KINDS.filter((shaderKind) => shaderKind !== 'customSpec' && shaderKind !== 'customCode'),
  )('renders %s shader nodes with visible procedural pixels', async (shaderKind) => {
    const graph: CanvasGraph = {
      edges: [
        { id: `e-${shaderKind}-export`, fromId: 'shader-a', fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' },
      ],
      positions: {},
      mergeNodes: [],
      colorNodes: [],
      shaderNodes: [
        makeGraphShaderNode({
          id: 'shader-a',
          shaderKind,
          palette: ['#0c1024', '#ff705f', '#79e3c5', '#f6c96f'],
          grain: 0,
        }),
      ],
    };
    const doc = graphDocument(graph);

    const canvas = await renderGraphTarget(doc, graph, EXPORT_NODE_ID, 96, 64, new Map(), { skipEffects: true });
    const samples = [centerPixel(canvas), samplePixel(canvas, 4, 4)];

    expect(samples.every((pixel) => pixel[3] === 255)).toBe(true);
    expect(uniquePixelCount(canvas)).toBeGreaterThan(1);
  });

  it('renders a customCode shader with explicitly saved code', async () => {
    const graph: CanvasGraph = {
      edges: [{ id: 'e-code-export', fromId: 'shader-code', fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' }],
      positions: {},
      mergeNodes: [],
      colorNodes: [],
      shaderNodes: [
        makeGraphShaderNode({
          id: 'shader-code',
          shaderKind: 'customCode',
          grain: 0,
          customShaderCode: {
            version: 1,
            language: 'glsl-fragment',
            code: 'vec4 mainImage(vec2 uv) { return vec4(uv.x, uv.y, 1.0 - uv.x, 1.0); }',
          },
        }),
      ],
    };
    const doc = graphDocument(graph);

    const canvas = await renderGraphTarget(doc, graph, EXPORT_NODE_ID, 96, 64, new Map(), { skipEffects: true });
    const samples = [centerPixel(canvas), samplePixel(canvas, 4, 4)];

    expect(samples.every((pixel) => pixel[3] === 255)).toBe(true);
    expect(uniquePixelCount(canvas)).toBeGreaterThan(1);
  });

  it('keeps unconnected AI shader passes transparent instead of acting as fills', async () => {
    const graph: CanvasGraph = {
      edges: [{ id: 'e-custom-export', fromId: 'custom-shader', fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' }],
      positions: {},
      mergeNodes: [],
      colorNodes: [],
      shaderNodes: [
        makeGraphShaderNode({
          id: 'custom-shader',
          shaderKind: 'customSpec',
          grain: 0,
          customShaderSpec: {
            version: 1,
            provenance: { source: 'openai' },
            label: 'AI Waves',
            prompt: 'neon waves',
            palette: ['#080816', '#7b61ff', '#ff4ec7', '#55f7d5'],
            operations: [
              { op: 'noise', scale: 4, amount: 0.3, octaves: 4 },
              { op: 'wave', frequency: 12, amplitude: 0.22, angle: 1.2 },
            ],
          },
        }),
      ],
    };
    const canvas = await renderGraphTarget(graphDocument(graph), graph, EXPORT_NODE_ID, 64, 64, new Map(), {
      skipEffects: true,
    });

    expect(hasVisiblePixels(canvas)).toBe(false);
    expect(centerPixel(canvas)[3]).toBe(0);
  });

  it('renders custom spec shader passes identically through document preview and export target', async () => {
    const base = makeFillLayer({ id: 'base-fill', color: '#1a3355', opacity: 100, blendMode: 'normal' });
    const graph: CanvasGraph = {
      edges: [
        { id: 'e-base-custom', fromId: base.id, fromPort: 'out', toId: 'custom-shader', toPort: 'bg' },
        { id: 'e-custom-export', fromId: 'custom-shader', fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' },
      ],
      positions: {},
      mergeNodes: [],
      colorNodes: [],
      shaderNodes: [
        makeGraphShaderNode({
          id: 'custom-shader',
          shaderKind: 'customSpec',
          grain: 0,
          customShaderSpec: {
            version: 1,
            provenance: { source: 'openai' },
            label: 'AI Waves',
            prompt: 'neon waves',
            palette: ['#080816', '#7b61ff', '#ff4ec7', '#55f7d5'],
            operations: [
              { op: 'noise', scale: 4, amount: 0.3, octaves: 4 },
              { op: 'wave', frequency: 12, amplitude: 0.22, angle: 1.2 },
            ],
          },
        }),
      ],
    };
    const doc = graphDocument(graph, [base]);
    const options = { skipEffects: true as const };

    const documentCanvas = await renderDocument(doc, 96, 64, new Map(), { ...options, graphMode: 'graph' });
    const exportCanvas = await renderGraphTarget(doc, graph, EXPORT_NODE_ID, 96, 64, new Map(), options);

    expect(pixelsEqual(allPixels(documentCanvas), allPixels(exportCanvas))).toBe(true);
    expect(uniquePixelCount(exportCanvas)).toBeGreaterThan(1);
  });

  it('keeps custom spec shader pass deterministic while sampling its backdrop', async () => {
    const backdropShader = makeGraphShaderNode({
      id: 'backdrop-shader',
      shaderKind: 'waterCaustic',
      palette: ['#052d3b', '#8ff8d2', '#ffcf6b', '#ffffff'],
      grain: 0,
    });
    const customShader = makeGraphShaderNode({
      id: 'custom-shader',
      shaderKind: 'customSpec',
      grain: 0,
      opacity: 72,
      blendMode: 'screen',
      customShaderSpec: {
        version: 1,
        provenance: { source: 'openai' },
        label: 'AI Halftone',
        prompt: 'neon halftone wave pass',
        palette: ['#080816', '#7b61ff', '#ff4ec7', '#55f7d5'],
        operations: [
          { op: 'noise', scale: 5, amount: 0.28, octaves: 3 },
          { op: 'wave', frequency: 18, amplitude: 0.24, angle: 0.45 },
          { op: 'threshold', value: 0.48, softness: 0.12 },
        ],
      },
    });
    const standaloneGraph: CanvasGraph = {
      edges: [{ id: 'e-custom-export', fromId: 'custom-shader', fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' }],
      positions: {},
      mergeNodes: [],
      colorNodes: [],
      shaderNodes: [customShader],
    };
    const backdropGraph: CanvasGraph = {
      edges: [
        { id: 'e-backdrop-export', fromId: 'backdrop-shader', fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' },
      ],
      positions: {},
      mergeNodes: [],
      colorNodes: [],
      shaderNodes: [backdropShader],
    };
    const passGraph: CanvasGraph = {
      edges: [
        { id: 'e-backdrop-custom', fromId: 'backdrop-shader', fromPort: 'out', toId: 'custom-shader', toPort: 'bg' },
        { id: 'e-custom-export', fromId: 'custom-shader', fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' },
      ],
      positions: {},
      mergeNodes: [],
      colorNodes: [],
      shaderNodes: [backdropShader, customShader],
    };

    const standalone = await renderGraphTarget(
      graphDocument(standaloneGraph),
      standaloneGraph,
      EXPORT_NODE_ID,
      72,
      72,
      new Map(),
      { skipEffects: true },
    );
    const backdrop = await renderGraphTarget(
      graphDocument(backdropGraph),
      backdropGraph,
      EXPORT_NODE_ID,
      72,
      72,
      new Map(),
      { skipEffects: true },
    );
    const firstPass = await renderGraphTarget(graphDocument(passGraph), passGraph, EXPORT_NODE_ID, 72, 72, new Map(), {
      skipEffects: true,
    });
    const secondPass = await renderGraphTarget(graphDocument(passGraph), passGraph, EXPORT_NODE_ID, 72, 72, new Map(), {
      skipEffects: true,
    });

    expect(pixelsEqual(allPixels(firstPass), allPixels(secondPass))).toBe(true);
    expect(pixelsEqual(allPixels(firstPass), allPixels(standalone))).toBe(false);
    expect(pixelsEqual(allPixels(firstPass), allPixels(backdrop))).toBe(false);
    expect(uniquePixelCount(firstPass)).toBeGreaterThan(1);
  });

  it('runs custom code shaders as backdrop-aware passes', async () => {
    const baseLayer = makeFillLayer({ id: 'base-fill', color: '#24334f', opacity: 100, blendMode: 'normal' });
    const codeShader = makeGraphShaderNode({
      id: 'code-shader',
      shaderKind: 'customCode',
      opacity: 100,
      blendMode: 'normal',
      distortion: 100,
      customShaderCode: {
        version: 1,
        language: 'glsl-fragment',
        code: `vec4 mainImage(vec2 uv) {
  vec4 base = texture2D(u_backdrop, uv);
  return vec4(1.0 - base.r, base.g + uv.x * 0.25, base.b + uv.y * 0.25, base.a);
}`,
      },
    });
    const baseGraph: CanvasGraph = {
      edges: [{ id: 'e-base-export', fromId: 'base-fill', fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' }],
      positions: {},
      mergeNodes: [],
      colorNodes: [],
    };
    const passGraph: CanvasGraph = {
      edges: [
        { id: 'e-base-code', fromId: 'base-fill', fromPort: 'out', toId: 'code-shader', toPort: 'bg' },
        { id: 'e-code-export', fromId: 'code-shader', fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' },
      ],
      positions: {},
      mergeNodes: [],
      colorNodes: [],
      shaderNodes: [codeShader],
    };

    const base = await renderGraphTarget(
      graphDocument(baseGraph, [baseLayer]),
      baseGraph,
      EXPORT_NODE_ID,
      48,
      48,
      new Map(),
      {
        skipEffects: true,
      },
    );
    const pass = await renderGraphTarget(
      graphDocument(passGraph, [baseLayer]),
      passGraph,
      EXPORT_NODE_ID,
      48,
      48,
      new Map(),
      {
        skipEffects: true,
      },
    );

    expect(pixelsEqual(allPixels(pass), allPixels(base))).toBe(false);
    expect(uniquePixelCount(pass)).toBeGreaterThan(1);
  });

  it('keeps the connected backdrop when custom code shader output is transparent', async () => {
    const baseLayer = makeFillLayer({ id: 'base-fill', color: '#230033', opacity: 100, blendMode: 'normal' });
    const codeShader = makeGraphShaderNode({
      id: 'code-shader',
      shaderKind: 'customCode',
      opacity: 100,
      blendMode: 'normal',
      customShaderCode: {
        version: 1,
        language: 'glsl-fragment',
        code: '',
      },
    });
    const graph: CanvasGraph = {
      edges: [
        { id: 'e-base-code', fromId: 'base-fill', fromPort: 'out', toId: 'code-shader', toPort: 'bg' },
        { id: 'e-code-export', fromId: 'code-shader', fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' },
      ],
      positions: {},
      mergeNodes: [],
      colorNodes: [],
      shaderNodes: [codeShader],
    };
    const baseGraph: CanvasGraph = {
      edges: [{ id: 'e-base-export', fromId: 'base-fill', fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' }],
      positions: {},
      mergeNodes: [],
      colorNodes: [],
    };

    const baseCanvas = await renderGraphTarget(
      graphDocument(baseGraph, [baseLayer]),
      baseGraph,
      EXPORT_NODE_ID,
      48,
      48,
      new Map(),
      {
        skipEffects: true,
      },
    );
    const canvas = await renderGraphTarget(
      graphDocument(graph, [baseLayer]),
      graph,
      EXPORT_NODE_ID,
      48,
      48,
      new Map(),
      {
        skipEffects: true,
      },
    );
    expect(pixelsEqual(allPixels(canvas), allPixels(baseCanvas))).toBe(true);
  });

  it('exposes backdrop presence to custom code shader passes', async () => {
    const baseLayer = makeFillLayer({ id: 'base-fill', color: '#203050', opacity: 100, blendMode: 'normal' });
    const codeShader = makeGraphShaderNode({
      id: 'code-shader',
      shaderKind: 'customCode',
      opacity: 70,
      blendMode: 'screen',
      customShaderCode: {
        version: 1,
        language: 'glsl-fragment',
        code: `vec4 mainImage(vec2 uv) {
  vec4 base = texture2D(u_backdrop, uv);
  vec3 fill = vec3(1.0, 0.15, 0.05);
  vec3 pass = mix(base.rgb, vec3(0.1, 0.9, 1.0), 0.35);
  return vec4(mix(fill, pass, u_has_backdrop), 1.0);
}`,
      },
    });
    const standaloneGraph: CanvasGraph = {
      edges: [{ id: 'e-code-export', fromId: 'code-shader', fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' }],
      positions: {},
      mergeNodes: [],
      colorNodes: [],
      shaderNodes: [codeShader],
    };
    const passGraph: CanvasGraph = {
      edges: [
        { id: 'e-base-code', fromId: 'base-fill', fromPort: 'out', toId: 'code-shader', toPort: 'bg' },
        { id: 'e-code-export', fromId: 'code-shader', fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' },
      ],
      positions: {},
      mergeNodes: [],
      colorNodes: [],
      shaderNodes: [codeShader],
    };

    const standalone = await renderGraphTarget(
      graphDocument(standaloneGraph, [baseLayer]),
      standaloneGraph,
      EXPORT_NODE_ID,
      40,
      40,
      new Map(),
      { skipEffects: true },
    );
    const pass = await renderGraphTarget(
      graphDocument(passGraph, [baseLayer]),
      passGraph,
      EXPORT_NODE_ID,
      40,
      40,
      new Map(),
      { skipEffects: true },
    );

    expect(averageRgbDistance(standalone, pass)).toBeGreaterThan(20);
    expect(uniquePixelCount(pass)).toBeGreaterThan(1);
  });

  it('composites shader nodes over an optional backdrop input', async () => {
    const base = makeFillLayer({ id: 'base-fill', color: '#1a3355', opacity: 100, blendMode: 'normal' });
    const graph: CanvasGraph = {
      edges: [
        { id: 'e-base-shader', fromId: base.id, fromPort: 'out', toId: 'shader-a', toPort: 'bg' },
        { id: 'e-shader-export', fromId: 'shader-a', fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' },
      ],
      positions: {},
      mergeNodes: [],
      colorNodes: [],
      shaderNodes: [
        makeGraphShaderNode({
          id: 'shader-a',
          shaderKind: 'staticRadialGradient',
          palette: ['#ff2200', '#ff2200'],
          grain: 0,
          opacity: 45,
          blendMode: 'source-over',
        }),
      ],
    };
    const doc = graphDocument(graph, [base]);
    const baseGraph: CanvasGraph = {
      edges: [{ id: 'e-base-export', fromId: base.id, fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' }],
      positions: {},
      mergeNodes: [],
      colorNodes: [],
    };
    const baseDoc = graphDocument(baseGraph, [base]);

    const baseCanvas = await renderGraphTarget(baseDoc, baseGraph, EXPORT_NODE_ID, 48, 48, new Map(), {
      skipEffects: true,
    });
    const shaderCanvas = await renderGraphTarget(doc, graph, EXPORT_NODE_ID, 48, 48, new Map(), { skipEffects: true });

    expect(centerPixel(shaderCanvas)[3]).toBe(255);
    expect(pixelsEqual(allPixels(baseCanvas), allPixels(shaderCanvas))).toBe(false);
  });

  it('samples the connected backdrop as shader pass input instead of replacing it', async () => {
    const standaloneTopGraph: CanvasGraph = {
      edges: [{ id: 'e-top-export', fromId: 'top-shader', fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' }],
      positions: {},
      mergeNodes: [],
      colorNodes: [],
      shaderNodes: [
        makeGraphShaderNode({
          id: 'top-shader',
          shaderKind: 'staticRadialGradient',
          palette: ['#ff2200', '#ff2200'],
          grain: 0,
          opacity: 100,
          blendMode: 'source-over',
        }),
      ],
    };
    const backdropGraph: CanvasGraph = {
      edges: [
        { id: 'e-backdrop-export', fromId: 'backdrop-shader', fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' },
      ],
      positions: {},
      mergeNodes: [],
      colorNodes: [],
      shaderNodes: [
        makeGraphShaderNode({
          id: 'backdrop-shader',
          shaderKind: 'waterCaustic',
          palette: ['#052d3b', '#8ff8d2', '#ffcf6b', '#ffffff'],
          grain: 0,
        }),
      ],
    };
    const passGraph: CanvasGraph = {
      edges: [
        { id: 'e-backdrop-top', fromId: 'backdrop-shader', fromPort: 'out', toId: 'top-shader', toPort: 'bg' },
        { id: 'e-top-export', fromId: 'top-shader', fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' },
      ],
      positions: {},
      mergeNodes: [],
      colorNodes: [],
      shaderNodes: [
        ...(backdropGraph.shaderNodes ?? []),
        makeGraphShaderNode({
          id: 'top-shader',
          shaderKind: 'staticRadialGradient',
          palette: ['#ff2200', '#ff2200'],
          grain: 0,
          opacity: 100,
          blendMode: 'source-over',
        }),
      ],
    };

    const standaloneTop = await renderGraphTarget(
      graphDocument(standaloneTopGraph),
      standaloneTopGraph,
      EXPORT_NODE_ID,
      72,
      72,
      new Map(),
      { skipEffects: true },
    );
    const backdropOnly = await renderGraphTarget(
      graphDocument(backdropGraph),
      backdropGraph,
      EXPORT_NODE_ID,
      72,
      72,
      new Map(),
      { skipEffects: true },
    );
    const pass = await renderGraphTarget(graphDocument(passGraph), passGraph, EXPORT_NODE_ID, 72, 72, new Map(), {
      skipEffects: true,
    });

    expect(pixelsEqual(allPixels(pass), allPixels(standaloneTop))).toBe(false);
    expect(pixelsEqual(allPixels(pass), allPixels(backdropOnly))).toBe(false);
    expect(uniquePixelCount(pass)).toBeGreaterThan(1);
  });

  it('keeps a custom shader pass image-like instead of replacing the backdrop with shader fill colors', async () => {
    const base = makeFillLayer({ id: 'base-fill', color: '#1a3355', opacity: 100, blendMode: 'normal' });
    const customShader = makeGraphShaderNode({
      id: 'custom-water-pass',
      shaderKind: 'customSpec',
      grain: 0,
      opacity: 100,
      blendMode: 'screen',
      customShaderSpec: {
        version: 1,
        provenance: { source: 'openai' },
        label: 'Transparent shallow-water pass',
        base: 0.55,
        contrast: 1.1,
        palette: ['#bdfaff', '#8befff', '#efffff'],
        operations: [
          { op: 'noise', scale: 5.8, amount: 0.22, octaves: 4, seedOffset: 21 },
          { op: 'rings', frequency: 14, amount: 0.14, centerX: 0.12, centerY: -0.08 },
          { op: 'wave', frequency: 9, amplitude: 0.1, angle: 27 },
        ],
      },
    });
    const baseGraph: CanvasGraph = {
      edges: [{ id: 'e-base-export', fromId: base.id, fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' }],
      positions: {},
      mergeNodes: [],
      colorNodes: [],
    };
    const passGraph: CanvasGraph = {
      edges: [
        { id: 'e-base-custom', fromId: base.id, fromPort: 'out', toId: customShader.id, toPort: 'bg' },
        { id: 'e-custom-export', fromId: customShader.id, fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' },
      ],
      positions: {},
      mergeNodes: [],
      colorNodes: [],
      shaderNodes: [customShader],
    };

    const baseCanvas = await renderGraphTarget(
      graphDocument(baseGraph, [base]),
      baseGraph,
      EXPORT_NODE_ID,
      72,
      72,
      new Map(),
      {
        skipEffects: true,
      },
    );
    const pass = await renderGraphTarget(
      graphDocument(passGraph, [base]),
      passGraph,
      EXPORT_NODE_ID,
      72,
      72,
      new Map(),
      {
        skipEffects: true,
      },
    );

    expect(centerPixel(pass)[3]).toBe(255);
    expect(hasVisiblePixels(pass)).toBe(true);
    expect(pixelsEqual(allPixels(pass), allPixels(baseCanvas))).toBe(false);
  });

  it('keeps low-contrast AI water passes visible on detailed image backdrops', async () => {
    const imageSrc = 'test-cache://detailed-water-pass-input';
    const imageLayer = makeImageLayer(imageSrc, {
      id: 'image-input',
      fit: 'cover',
      opacity: 100,
      blendMode: 'normal',
    });
    const shaderNode = makeGraphShaderNode({
      id: 'ai-water-pass',
      shaderKind: 'customSpec',
      opacity: 100,
      blendMode: 'normal',
      distortion: 56,
      grain: 12,
      customShaderSpec: {
        version: 1,
        provenance: { source: 'openai' },
        label: 'Transparent Shallow-Water Caustic Refraction',
        base: 0.22,
        contrast: 0.36,
        palette: ['#bdfaff', '#8befff', '#efffff'],
        operations: [
          { op: 'noise', scale: 5.8, amount: 0.22, octaves: 4, seedOffset: 21 },
          { op: 'wave', frequency: 9, amplitude: 0.1, angle: 27 },
          { op: 'rings', frequency: 14, amount: 0.14, centerX: 0.12, centerY: -0.08 },
          { op: 'sourceLuma', amount: 0.58 },
          { op: 'edgeGlow', amount: 0.46, softness: 0.16 },
          { op: 'chromaticShift', amount: 0.22, angle: 36 },
          { op: 'gradientMap', amount: 0.48 },
          { op: 'posterize', steps: 5 },
        ],
      },
    });
    const imageGraph: CanvasGraph = {
      edges: [{ id: 'e-image-export', fromId: imageLayer.id, fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' }],
      positions: {},
      mergeNodes: [],
      colorNodes: [],
    };
    const standaloneShaderGraph: CanvasGraph = {
      edges: [{ id: 'e-shader-export', fromId: shaderNode.id, fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' }],
      positions: {},
      mergeNodes: [],
      colorNodes: [],
      shaderNodes: [shaderNode],
    };
    const passGraph: CanvasGraph = {
      edges: [
        { id: 'e-image-shader', fromId: imageLayer.id, fromPort: 'out', toId: shaderNode.id, toPort: 'bg' },
        { id: 'e-shader-export', fromId: shaderNode.id, fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' },
      ],
      positions: {},
      mergeNodes: [],
      colorNodes: [],
      shaderNodes: [shaderNode],
    };
    const imageCache = createDetailedImageCache(imageSrc);

    const baseCanvas = await renderGraphTarget(
      graphDocument(imageGraph, [imageLayer]),
      imageGraph,
      EXPORT_NODE_ID,
      96,
      96,
      imageCache,
      { skipEffects: true },
    );
    const standaloneShader = await renderGraphTarget(
      graphDocument(standaloneShaderGraph),
      standaloneShaderGraph,
      EXPORT_NODE_ID,
      96,
      96,
      imageCache,
      { skipEffects: true },
    );
    const pass = await renderGraphTarget(
      graphDocument(passGraph, [imageLayer]),
      passGraph,
      EXPORT_NODE_ID,
      96,
      96,
      imageCache,
      { skipEffects: true },
    );

    const passDelta = averageRgbDistance(pass, baseCanvas);
    expect(passDelta).toBeGreaterThan(8);
    expect(passDelta).toBeLessThan(averageRgbDistance(standaloneShader, baseCanvas));
  });

  it('keeps shader backdrop unchanged when shader pass opacity is zero', async () => {
    const base = makeFillLayer({ id: 'base-fill', color: '#1a3355', opacity: 100, blendMode: 'normal' });
    const graph: CanvasGraph = {
      edges: [
        { id: 'e-base-shader', fromId: base.id, fromPort: 'out', toId: 'shader-a', toPort: 'bg' },
        { id: 'e-shader-export', fromId: 'shader-a', fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' },
      ],
      positions: {},
      mergeNodes: [],
      colorNodes: [],
      shaderNodes: [makeGraphShaderNode({ id: 'shader-a', opacity: 0, grain: 0 })],
    };
    const baseGraph: CanvasGraph = {
      edges: [{ id: 'e-base-export', fromId: base.id, fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' }],
      positions: {},
      mergeNodes: [],
      colorNodes: [],
    };

    const baseCanvas = await renderGraphTarget(
      graphDocument(baseGraph, [base]),
      baseGraph,
      EXPORT_NODE_ID,
      48,
      48,
      new Map(),
      {
        skipEffects: true,
      },
    );
    const shaderCanvas = await renderGraphTarget(
      graphDocument(graph, [base]),
      graph,
      EXPORT_NODE_ID,
      48,
      48,
      new Map(),
      {
        skipEffects: true,
      },
    );

    expect(pixelsEqual(allPixels(baseCanvas), allPixels(shaderCanvas))).toBe(true);
  });

  it('uses processed-backdrop semantics for shader passes with a connected backdrop', async () => {
    const base = makeFillLayer({ id: 'base-fill', color: '#1a3355', opacity: 100, blendMode: 'normal' });
    const shaderNode = makeGraphShaderNode({
      id: 'shader-a',
      shaderKind: 'staticRadialGradient',
      palette: ['#ff2200', '#ff2200'],
      grain: 0,
    });
    const graph: CanvasGraph = {
      edges: [
        { id: 'e-base-shader', fromId: base.id, fromPort: 'out', toId: 'shader-a', toPort: 'bg' },
        { id: 'e-shader-export', fromId: 'shader-a', fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' },
      ],
      positions: {},
      mergeNodes: [],
      colorNodes: [],
      shaderNodes: [shaderNode],
    };
    const standaloneShaderGraph: CanvasGraph = {
      edges: [{ id: 'e-shader-export', fromId: shaderNode.id, fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' }],
      positions: {},
      mergeNodes: [],
      colorNodes: [],
      shaderNodes: [shaderNode],
    };
    const baseGraph: CanvasGraph = {
      edges: [{ id: 'e-base-export', fromId: base.id, fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' }],
      positions: {},
      mergeNodes: [],
      colorNodes: [],
    };

    const baseCanvas = await renderGraphTarget(
      graphDocument(baseGraph, [base]),
      baseGraph,
      EXPORT_NODE_ID,
      48,
      48,
      new Map(),
      {
        skipEffects: true,
      },
    );
    const shaderCanvas = await renderGraphTarget(
      graphDocument(graph, [base]),
      graph,
      EXPORT_NODE_ID,
      48,
      48,
      new Map(),
      {
        skipEffects: true,
      },
    );
    const standaloneShaderCanvas = await renderGraphTarget(
      graphDocument(standaloneShaderGraph),
      standaloneShaderGraph,
      EXPORT_NODE_ID,
      48,
      48,
      new Map(),
      {
        skipEffects: true,
      },
    );

    const [baseR, baseG, baseB] = centerPixel(baseCanvas);
    const [shaderR, shaderG, shaderB, shaderA] = centerPixel(shaderCanvas);
    const [standaloneR, standaloneG, standaloneB] = centerPixel(standaloneShaderCanvas);

    expect(shaderA).toBe(255);
    expect(rgbDistance([shaderR, shaderG, shaderB], [baseR, baseG, baseB])).toBeGreaterThan(0);
    expect(rgbDistance([shaderR, shaderG, shaderB], [baseR, baseG, baseB])).toBeLessThan(
      rgbDistance([standaloneR, standaloneG, standaloneB], [baseR, baseG, baseB]),
    );
    expect(pixelsEqual(allPixels(baseCanvas), allPixels(shaderCanvas))).toBe(false);
  });

  it('uses shader node output as a material texture input', async () => {
    const graph: CanvasGraph = {
      edges: [{ id: 'e-shader-material', fromId: 'shader-a', fromPort: 'out', toId: 'material-a', toPort: 'albedo' }],
      positions: {},
      mergeNodes: [],
      colorNodes: [],
      materialNodes: [makeGraphMaterialNode({ id: 'material-a', materialPreset: 'chrome' })],
      shaderNodes: [makeGraphShaderNode({ id: 'shader-a', palette: ['#ff0000', '#00ff00'], grain: 0 })],
    };
    const doc = graphDocument(graph);

    const canvas = await renderGraphTarget(doc, graph, 'material-a', 32, 32, new Map(), { skipEffects: true });
    const [, , , a] = centerPixel(canvas);

    expect(a).toBe(255);
  });

  it('uses shader node output directly as a primitive material texture', async () => {
    const primitive = makeSourceLayer('primitive', {
      id: 'primitive-a',
      name: 'Primitive A',
      primitiveShape: 'sphere',
      color: '#cc2020',
      accentColor: '#ff8080',
    });
    const baseGraph: CanvasGraph = {
      edges: [{ id: 'e-primitive-export', fromId: primitive.id, fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' }],
      positions: {},
      mergeNodes: [],
      colorNodes: [],
    };
    const shaderGraph: CanvasGraph = {
      ...baseGraph,
      edges: [
        ...baseGraph.edges,
        { id: 'e-shader-primitive', fromId: 'shader-a', fromPort: 'out', toId: primitive.id, toPort: 'material' },
      ],
      shaderNodes: [
        makeGraphShaderNode({
          id: 'shader-a',
          palette: ['#00ccff', '#ff00cc', '#f8ff00', '#101020'],
          distortion: 80,
          grain: 0,
        }),
      ],
    };
    const baseDoc: CanvasDocument = {
      global: { bg: 'transparent', seed: 1, aspect: '1:1' },
      layers: [primitive],
      graph: baseGraph,
      export: { format: 'png', scale: 1, target: 'cover' },
    };
    const shaderDoc: CanvasDocument = { ...baseDoc, graph: shaderGraph };

    const baseCanvas = await renderGraphTarget(baseDoc, baseGraph, EXPORT_NODE_ID, 96, 96, new Map(), {
      skipEffects: true,
    });
    const shaderCanvas = await renderGraphTarget(shaderDoc, shaderGraph, EXPORT_NODE_ID, 96, 96, new Map(), {
      skipEffects: true,
    });

    expect(pixelsEqual(allPixels(shaderCanvas), allPixels(baseCanvas))).toBe(false);
    expect(centerPixel(shaderCanvas)[3]).toBeGreaterThan(8);
  });

  it.each(
    MATERIAL_TEXTURE_INPUT_PORTS,
  )('routes shader fill output into primitive material %s texture slots', async (port: MaterialTextureInputPort) => {
    const primitive = makeSourceLayer('primitive', {
      id: 'primitive-a',
      name: 'Primitive A',
      primitiveShape: 'sphere',
      color: '#9a281d',
      accentColor: '#f7c26b',
    });
    const graph: CanvasGraph = {
      edges: [
        { id: `e-shader-material-${port}`, fromId: 'shader-a', fromPort: 'out', toId: 'material-a', toPort: port },
        { id: 'e-material-primitive', fromId: 'material-a', fromPort: 'out', toId: primitive.id, toPort: 'material' },
        { id: 'e-primitive-export', fromId: primitive.id, fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' },
      ],
      positions: {},
      mergeNodes: [],
      colorNodes: [],
      materialNodes: [
        makeGraphMaterialNode({
          id: 'material-a',
          materialPreset: 'chrome',
          materialMetalness: 0.75,
          materialRoughness: 0.22,
        }),
      ],
      shaderNodes: [
        makeGraphShaderNode({
          id: 'shader-a',
          shaderKind: 'moire',
          palette: ['#06040a', '#f7e6ff', '#ff6ab7', '#50e3c2'],
          grain: 0,
        }),
      ],
    };
    const doc: CanvasDocument = {
      global: { bg: 'transparent', seed: 13, aspect: '1:1' },
      layers: [primitive],
      graph,
      export: { format: 'png', scale: 1, target: 'cover' },
    };

    const canvas = await renderGraphTarget(doc, graph, EXPORT_NODE_ID, 80, 80, new Map(), {});

    expect(hasVisiblePixels(canvas)).toBe(true);
  });

  it.each(
    MATERIAL_TEXTURE_INPUT_PORTS,
  )('routes input-dependent effect output into primitive material %s texture slots', async (port: MaterialTextureInputPort) => {
    const source = makeFillLayer({ id: 'effect-source', color: '#ff2020', opacity: 100, blendMode: 'normal' });
    const effect = makeEffectLayer({
      id: 'effect-a',
      preset: 'gradientMap',
      gradientMap: 100,
      gradientMapShadow: '#001040',
      gradientMapMid: '#21d4a8',
      gradientMapHighlight: '#fff5a0',
    });
    const primitive = makeSourceLayer('primitive', {
      id: 'primitive-a',
      name: 'Primitive A',
      primitiveShape: 'sphere',
      color: '#885533',
      accentColor: '#ffd36a',
    });
    const graph: CanvasGraph = {
      edges: [
        { id: 'e-source-effect', fromId: source.id, fromPort: 'out', toId: effect.id, toPort: 'in' },
        { id: `e-effect-material-${port}`, fromId: effect.id, fromPort: 'out', toId: 'material-a', toPort: port },
        { id: 'e-material-primitive', fromId: 'material-a', fromPort: 'out', toId: primitive.id, toPort: 'material' },
        { id: 'e-primitive-export', fromId: primitive.id, fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' },
      ],
      positions: {},
      mergeNodes: [],
      colorNodes: [],
      materialNodes: [makeGraphMaterialNode({ id: 'material-a', materialPreset: 'plastic' })],
    };
    const doc: CanvasDocument = {
      global: { bg: 'transparent', seed: 17, aspect: '1:1' },
      layers: [source, effect, primitive],
      graph,
      export: { format: 'png', scale: 1, target: 'cover' },
    };

    const canvas = await renderGraphTarget(doc, graph, EXPORT_NODE_ID, 80, 80, new Map(), {});

    expect(hasVisiblePixels(canvas)).toBe(true);
  });

  it('keeps input-dependent effects transparent when used without an upstream source', async () => {
    const effect = makeEffectLayer({
      id: 'effect-a',
      preset: 'gradientMap',
      gradientMap: 100,
      gradientMapShadow: '#001040',
      gradientMapMid: '#21d4a8',
      gradientMapHighlight: '#fff5a0',
    });
    const graph: CanvasGraph = {
      edges: [{ id: 'e-effect-export', fromId: effect.id, fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' }],
      positions: {},
      mergeNodes: [],
      colorNodes: [],
    };
    const doc: CanvasDocument = {
      global: { bg: 'transparent', seed: 19, aspect: '1:1' },
      layers: [effect],
      graph,
      export: { format: 'png', scale: 1, target: 'cover' },
    };

    const canvas = await renderGraphTarget(doc, graph, EXPORT_NODE_ID, 32, 32, new Map(), {});

    expect(centerPixel(canvas)[3]).toBe(0);
    expect(hasVisiblePixels(canvas)).toBe(false);
  });

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

  it('treats zero-size cached node canvases as transparent fallbacks', async () => {
    const graph: CanvasGraph = {
      edges: [{ id: 'e-red-export', fromId: 'red-fill', fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' }],
      positions: {},
      mergeNodes: [],
      colorNodes: [],
    };
    const doc = graphDocument(graph);
    const zeroCanvas = document.createElement('canvas');
    zeroCanvas.width = 0;
    zeroCanvas.height = 0;
    const cache: GraphRenderCache = {
      namespace: 'zero-canvas-session',
      entries: new Map([['zero-canvas-session:red-fill', Promise.resolve(zeroCanvas)]]),
    };

    const canvas = await renderGraphTarget(doc, graph, EXPORT_NODE_ID, 32, 24, new Map(), { skipEffects: true }, cache);

    expect(canvas.width).toBe(32);
    expect(canvas.height).toBe(24);
    expect(centerPixel(canvas)[3]).toBe(0);
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

  it('keeps primitive sources proportioned inside non-square graph targets', async () => {
    const primitive = makeSourceLayer('primitive', {
      id: 'primitive-wide',
      name: 'Wide Primitive',
      primitiveShape: 'sphere',
      color: '#cc2020',
      accentColor: '#ff8080',
    });
    const graph: CanvasGraph = {
      edges: [{ id: 'e-primitive-export', fromId: primitive.id, fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' }],
      positions: {},
      mergeNodes: [],
      colorNodes: [],
    };
    const doc: CanvasDocument = {
      global: { bg: 'transparent', seed: 7, aspect: '16:9' },
      layers: [primitive],
      graph,
      export: { format: 'png', scale: 1, target: 'cover' },
    };

    const canvas = await renderGraphTarget(doc, graph, EXPORT_NODE_ID, 1920, 1080, new Map(), {
      skipEffects: true,
    });

    const bounds = alphaBounds(canvas);
    expect(bounds.width).toBeGreaterThan(480);
    expect(bounds.height).toBeGreaterThan(480);
    expect(bounds.width / bounds.height).toBeLessThan(1.35);
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

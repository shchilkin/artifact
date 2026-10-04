import { describe, expect, it } from 'vitest';
import {
  type CanvasDocument,
  DEFAULT_EXPORT,
  DEFAULT_GLOBAL,
  DOCUMENT_SCHEMA_VERSION,
  type Layer,
  makeEffectPresetLayer,
  makeEmojiLayer,
  makeFillLayer,
  makeImageLayer,
  makeTextLayer,
} from '../../../types/config';
import { inferLinearGraph } from '../../../utils/nodeGraph';
import {
  CANVAS_NONZERO_EFFECT_KEYS,
  CANVAS_POSITIVE_EFFECT_KEYS,
  GPU_POSITIVE_EFFECT_KEYS,
} from '../../../utils/render/layers';
import {
  activeEffects,
  EDITOR_EFFECT_ORDER,
  type LiveEffectRegistry,
  type LivePlan,
  planLivePackage,
} from './livePlan';

const registryOf = (...ids: string[]): LiveEffectRegistry => ({
  has: (id) => ids.includes(id),
  get: (id) => (ids.includes(id) ? { fields: [id === 'tear' ? 'tearAmt' : id, 'seedOffset'] } : undefined),
});
const registry = registryOf('noiseWarp');

const fill = makeFillLayer({ id: 'fill', name: 'Fill' });
const emoji = makeEmojiLayer({ id: 'emoji', name: 'Emojis' });
const glitch = makeEffectPresetLayer('glitch', { id: 'glitch', name: 'Glitch' });
const warp = makeEffectPresetLayer('noiseWarp', { id: 'warp', name: 'Noise Warp', noiseWarp: 100 });
const warp2 = makeEffectPresetLayer('noiseWarp', { id: 'warp2', name: 'Noise Warp 2', noiseWarp: 30, seedOffset: 4 });
const tear = makeEffectPresetLayer('tear', { id: 'tear', name: 'Tear' });
const image = makeImageLayer('image.png', { id: 'image', name: 'Image' });
const text = makeTextLayer({ id: 'text', name: 'Title' });

function doc(layers: Layer[], overrides: Partial<CanvasDocument> = {}): CanvasDocument {
  return {
    schemaVersion: DOCUMENT_SCHEMA_VERSION,
    global: { ...DEFAULT_GLOBAL, bg: '#101010' },
    layers,
    export: DEFAULT_EXPORT,
    ...overrides,
  };
}

/** The plan as ids: plates as layer ids, chains as `effect@layer`. */
function shape(plan: LivePlan) {
  return plan.stack.map((item) =>
    item.type === 'plate'
      ? { plate: item.layers.map((layer) => layer.id) }
      : { chain: item.passes.map((pass) => `${pass.effect}@${pass.source.id}`) },
  );
}

describe('editor effect order', () => {
  it('covers every effect field the renderer switches on', () => {
    const fields = new Set(EDITOR_EFFECT_ORDER.flatMap((entry) => entry.fields));
    const rendered = new Set([
      ...CANVAS_POSITIVE_EFFECT_KEYS,
      ...CANVAS_NONZERO_EFFECT_KEYS,
      ...GPU_POSITIVE_EFFECT_KEYS,
      'rays',
      'rayInt',
    ]);
    expect([...fields].sort()).toEqual([...rendered].sort());
  });

  it('lists Canvas 2D effects before GPU filters, as one layer applies them', () => {
    const layer = { ...warp, glitch: 20, vignette: 30 };
    expect(activeEffects(layer)).toEqual(['glitch', 'noiseWarp', 'vignette']);
  });
});

describe('planLivePackage', () => {
  it('splits the cover structure into a base plate, a live chain and an overlay plate', () => {
    const plan = planLivePackage(doc([fill, emoji, glitch, warp, warp2, image, text]), registry);
    expect(shape(plan)).toEqual([
      { plate: ['fill', 'emoji', 'glitch'] },
      { chain: ['noiseWarp@warp', 'noiseWarp@warp2'] },
      { plate: ['image', 'text'] },
    ]);
    expect(plan.background).toBe('#101010');
    expect(plan.fallback).toBeUndefined();
    expect(plan.baked).toEqual([
      { id: 'glitch', name: 'Glitch', effects: ['glitch'], reason: 'glitch does not run in the runtime yet' },
    ]);
  });

  it("copies the effect's authored fields into each pass", () => {
    const plan = planLivePackage(doc([fill, warp2]), registry);
    const chain = plan.stack[1];
    expect(chain.type === 'chain' && chain.passes).toEqual([
      { effect: 'noiseWarp', layer: { noiseWarp: 30, seedOffset: 4 }, source: { id: 'warp2', name: 'Noise Warp 2' } },
    ]);
  });

  it('follows the registry: a newly registered effect joins the chain', () => {
    const plan = planLivePackage(doc([fill, warp, tear, text]), registryOf('noiseWarp', 'tear'));
    expect(shape(plan)).toEqual([{ plate: ['fill'] }, { chain: ['noiseWarp@warp', 'tear@tear'] }, { plate: ['text'] }]);
    expect(plan.baked).toEqual([]);
  });

  it('bakes a live effect that an unsupported effect above it reads', () => {
    const plan = planLivePackage(doc([fill, warp, tear, text]), registry);
    expect(shape(plan)).toEqual([{ plate: ['fill', 'warp', 'tear', 'text'] }]);
    expect(plan.fallback).toBe('every live effect sits beneath "Tear", which the editor renders');
    expect(plan.baked).toEqual([
      expect.objectContaining({ id: 'warp', reason: '"Tear" above it is rendered by the editor and needs its pixels' }),
      expect.objectContaining({ id: 'tear', effects: ['tear'], reason: 'tear does not run in the runtime yet' }),
    ]);
  });

  it('approximate mode moves unsupported effects beneath the chain they sit on and says so', () => {
    const plan = planLivePackage(doc([fill, glitch, warp, tear, image]), registry, { approximate: true });
    expect(shape(plan)).toEqual([
      { plate: ['fill', 'glitch', 'tear'] },
      { chain: ['noiseWarp@warp'] },
      { plate: ['image'] },
    ]);
    expect(plan.baked.find((layer) => layer.id === 'tear')?.reason).toBe(
      'tear does not run in the runtime yet; moved beneath the live chain above it, so the resting frame is approximate',
    );
    expect(plan.baked.find((layer) => layer.id === 'glitch')?.reason).toBe('glitch does not run in the runtime yet');
  });

  it('never moves an effect across a source layer', () => {
    const plan = planLivePackage(doc([fill, warp, text, tear]), registry, { approximate: true });
    expect(shape(plan)).toEqual([{ plate: ['fill', 'warp', 'text', 'tear'] }]);
  });

  it('bakes a layer whose whole effect set does not run, and masked or blended effect layers', () => {
    const mixed = { ...warp, id: 'mixed', glitch: 10 };
    const masked = { ...warp, id: 'masked', maskAlpha: true };
    const blended = { ...warp, id: 'blended', blendMode: 'screen' };
    const plan = planLivePackage(doc([fill, mixed, masked, blended]), registry);
    expect(plan.baked.map((layer) => [layer.id, layer.reason])).toEqual([
      ['mixed', 'glitch does not run in the runtime yet'],
      ['masked', 'alpha masking is not supported in the runtime'],
      ['blended', 'blend mode "screen" is not supported in the runtime'],
    ]);
  });

  it('treats a non-normal source layer as a barrier and skips hidden and empty layers', () => {
    const multiply = { ...text, id: 'multiply', blendMode: 'multiply' };
    const hidden = { ...tear, id: 'hidden', visible: false };
    const empty = makeEffectPresetLayer('noiseWarp', { id: 'empty', noiseWarp: 0 });
    const plan = planLivePackage(doc([fill, warp, multiply, warp2, hidden, empty, image]), registry);
    expect(shape(plan)).toEqual([
      { plate: ['fill', 'warp', 'multiply'] },
      { chain: ['noiseWarp@warp2'] },
      { plate: ['image'] },
    ]);
  });

  it('is one still plate when nothing runs live', () => {
    const plan = planLivePackage(doc([fill, glitch, text]), registry);
    expect(plan.fallback).toBe('no effect layer runs in the runtime');
    expect(shape(plan)).toEqual([{ plate: ['fill', 'glitch', 'text'] }]);
  });

  it('plans a linear graph in render order, with no background', () => {
    const layers = [fill, emoji, warp, text];
    const plan = planLivePackage(doc(layers, { graph: inferLinearGraph(layers) }), registry);
    expect(shape(plan)).toEqual([{ plate: ['fill', 'emoji'] }, { chain: ['noiseWarp@warp'] }, { plate: ['text'] }]);
    expect(plan.background).toBeNull();
    // The layer array order differs from the graph's: the graph decides.
    const reordered = planLivePackage(doc([text, warp, emoji, fill], { graph: inferLinearGraph(layers) }), registry);
    expect(shape(reordered)).toEqual(shape(plan));
  });

  it('falls back to one still plate for a graph that is not linear, and says why', () => {
    const graph = inferLinearGraph([fill, warp, text]);
    const merged = {
      ...graph,
      edges: [...graph.edges, { id: 'extra', fromId: 'fill', fromPort: 'out', toId: 'text', toPort: 'material' }],
    };
    const plan = planLivePackage(doc([fill, warp, text], { graph: merged as typeof graph }), registry);
    expect(plan.fallback).toBe('the graph is not linear: "Title" has more than one input');
    expect(shape(plan)).toEqual([{ plate: ['fill', 'warp', 'text'] }]);
    expect(plan.baked.map((layer) => layer.id)).toEqual(['warp']);

    const mergeNode = {
      ...graph,
      edges: graph.edges.map((edge) => (edge.toId === '__export__' ? { ...edge, fromId: 'merge-1' } : edge)),
    };
    expect(planLivePackage(doc([fill, warp, text], { graph: mergeNode }), registry).fallback).toBe(
      'the graph is not linear: node "merge-1" is not a layer',
    );
  });
});

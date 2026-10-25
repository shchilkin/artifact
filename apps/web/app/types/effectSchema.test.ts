import { beforeEach, describe, expect, it, vi } from 'vitest';
import { effectRuns, findEffectEntry } from '../utils/effectStack';
import { EFFECT_PRESET_MENU_ORDER, type EffectLayer, makeDocument, makeEffectPresetLayer } from './config';
import {
  EFFECT_IDS,
  EFFECT_PARAM_DEFAULTS,
  EFFECT_PARAM_KEYS,
  EFFECT_PARAMS,
  EFFECT_PASS_ORDER,
  type EffectId,
  effectDefinition,
  effectOfPreset,
  effectParamKeys,
  isEffectActive,
  isGpuEffect,
  presetParamKeys,
} from './effectSchema';

const workerOps = vi.hoisted(() => [] as string[]);

vi.mock('pixi.js', () => ({
  Filter: class Filter {},
  BlurFilter: class BlurFilter {},
}));

vi.mock('../utils/render/workers/effectPixelTransformClient', async () => {
  const { transformEffectPixels } = await import('../utils/render/workers/effectPixelTransform');
  return {
    renderEffectPixelTransforms: async (request: Parameters<typeof transformEffectPixels>[0]) => {
      workerOps.push(...request.operations.map((operation) => operation.type));
      return transformEffectPixels({ ...request, data: new Uint8ClampedArray(request.data) });
    },
  };
});

const W = 48;
const H = 48;

function gradientCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createLinearGradient(0, 0, W, H);
  gradient.addColorStop(0, '#1a0f3d');
  gradient.addColorStop(0.5, '#e8a33b');
  gradient.addColorStop(1, '#2fd0c4');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(W / 4, H / 4, W / 2, H / 8);
  return canvas;
}

function pixels(canvas: HTMLCanvasElement) {
  return canvas.getContext('2d')!.getImageData(0, 0, W, H).data;
}

async function renderCanvasPass(layer: EffectLayer) {
  const { applyEffectLayerCanvas2DPass } = await import('../utils/render/layers');
  const base = gradientCanvas();
  const doc = makeDocument({
    global: { bg: 'transparent', seed: 7, aspect: '1:1' },
    layers: [layer],
    export: {} as never,
  });
  const output = await applyEffectLayerCanvas2DPass(base, layer, doc, W, H, new Map(), {});
  return { before: pixels(base), after: pixels(output) };
}

function effectLayer(effect: EffectId): EffectLayer {
  return makeEffectPresetLayer(effect);
}

describe('effect parameter schema', () => {
  beforeEach(() => {
    workerOps.length = 0;
  });

  it('lists every effect once in pass order, Canvas 2D and worker effects before GPU effects', () => {
    expect([...EFFECT_PASS_ORDER].sort()).toEqual([...EFFECT_IDS].sort());
    const firstGpu = EFFECT_PASS_ORDER.findIndex(isGpuEffect);
    expect(EFFECT_PASS_ORDER.slice(firstGpu).every(isGpuEffect)).toBe(true);
  });

  it('keeps every effect off at its defaults', () => {
    for (const effect of EFFECT_IDS) expect(isEffectActive(EFFECT_PARAM_DEFAULTS, effect), effect).toBe(false);
  });

  it('gives every effect a backend, parameters, and amounts it owns', () => {
    for (const effect of EFFECT_IDS) {
      const params = effectParamKeys(effect);
      expect(params.length, effect).toBeGreaterThan(0);
      expect(['canvas', 'worker', 'gpu']).toContain(effectDefinition(effect).backend);
      for (const amount of effectDefinition(effect).amounts) expect(params, effect).toContain(amount);
    }
  });

  it('keeps slider ranges and defaults consistent', () => {
    for (const key of EFFECT_PARAM_KEYS) {
      const param = EFFECT_PARAMS[key];
      if (param.type !== 'number') continue;
      expect(param.min, key).toBeLessThan(param.max);
      if (param.overrideMax !== undefined) expect(param.overrideMax, key).toBeGreaterThan(param.max);
      // An amount defaults to 0 (off) even when its slider starts higher.
      const isAmount = (effectDefinition(param.effect).amounts as readonly string[]).includes(key);
      if (!(isAmount && param.default === 0)) expect(param.default, key).toBeGreaterThanOrEqual(param.min);
      expect(param.default, key).toBeLessThanOrEqual(param.overrideMax ?? param.max);
    }
  });

  it('maps every add-menu preset to an effect with inspector controls', () => {
    for (const preset of EFFECT_PRESET_MENU_ORDER) {
      const effect = effectOfPreset(preset);
      expect(presetParamKeys(preset).length, preset).toBeGreaterThan(0);
      for (const key of presetParamKeys(preset)) expect(effectParamKeys(effect), preset).toContain(key);
      expect(isEffectActive(findEffectEntry(makeEffectPresetLayer(preset), effect)?.params ?? {}, effect), preset).toBe(
        true,
      );
    }
  });

  it.each(EFFECT_IDS)('renders %s only on its declared backend', async (effect) => {
    const layer = effectLayer(effect);
    const { backend } = effectDefinition(effect);
    const { buildEffectFilters } = await import('../utils/pixiFilters');
    const gpuFilters = effectRuns(layer)
      .filter((run) => run.pass === 'gpu')
      .flatMap((run) => buildEffectFilters(run.values, 1, W, H) ?? []);
    const { before, after } = await renderCanvasPass(layer);
    const canvasChanged = before.some((value, index) => value !== after[index]);

    expect(gpuFilters.length > 0, 'GPU filters').toBe(backend === 'gpu');
    expect(workerOps.length > 0, 'worker operations').toBe(backend === 'worker');
    expect(canvasChanged, 'Canvas 2D pixels').toBe(backend !== 'gpu');
  });
});

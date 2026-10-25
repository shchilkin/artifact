import { beforeEach, describe, expect, it, vi } from 'vitest';
import { effectRuns } from '../utils/effectStack';
import { EFFECT_PRESET_MENU_ORDER, type EffectLayer, makeDocument, makeEffectPresetLayer } from './config';
import {
  isGpuKernel,
  isKernelActive,
  KERNEL_IDS,
  KERNEL_PARAM_DEFAULTS,
  KERNEL_PARAM_KEYS,
  KERNEL_PARAMS,
  KERNEL_PASS_ORDER,
  type KernelId,
  kernelDefinition,
  kernelOfPreset,
  kernelParamKeys,
  presetParamKeys,
} from './effectKernels';

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
  // A transparent band, so kernels that work from the source's alpha (shadow) have an edge to act on.
  ctx.clearRect(0, (H * 3) / 4, W, H / 4);
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

function effectLayer(effect: KernelId): EffectLayer {
  return makeEffectPresetLayer(effect);
}

describe('effect parameter schema', () => {
  beforeEach(() => {
    workerOps.length = 0;
  });

  it('lists every effect once in pass order, Canvas 2D and worker effects before GPU effects', () => {
    expect([...KERNEL_PASS_ORDER].sort()).toEqual([...KERNEL_IDS].sort());
    const firstGpu = KERNEL_PASS_ORDER.findIndex(isGpuKernel);
    expect(KERNEL_PASS_ORDER.slice(firstGpu).every(isGpuKernel)).toBe(true);
  });

  it('keeps every effect off at its defaults', () => {
    for (const effect of KERNEL_IDS) expect(isKernelActive(KERNEL_PARAM_DEFAULTS, effect), effect).toBe(false);
  });

  it('gives every effect a backend, parameters, and amounts it owns', () => {
    for (const effect of KERNEL_IDS) {
      const params = kernelParamKeys(effect);
      expect(params.length, effect).toBeGreaterThan(0);
      expect(['canvas', 'worker', 'gpu']).toContain(kernelDefinition(effect).backend);
      for (const amount of kernelDefinition(effect).amounts) expect(params, effect).toContain(amount);
    }
  });

  it('keeps slider ranges and defaults consistent', () => {
    for (const key of KERNEL_PARAM_KEYS) {
      const param = KERNEL_PARAMS[key];
      if (param.type !== 'number') continue;
      expect(param.min, key).toBeLessThan(param.max);
      if (param.overrideMax !== undefined) expect(param.overrideMax, key).toBeGreaterThan(param.max);
      // An amount defaults to 0 (off) even when its slider starts higher.
      const isAmount = (kernelDefinition(param.kernel).amounts as readonly string[]).includes(key);
      if (!(isAmount && param.default === 0)) expect(param.default, key).toBeGreaterThanOrEqual(param.min);
      expect(param.default, key).toBeLessThanOrEqual(param.overrideMax ?? param.max);
    }
  });

  it('maps every add-menu preset to an effect with inspector controls', () => {
    for (const preset of EFFECT_PRESET_MENU_ORDER) {
      const effect = kernelOfPreset(preset);
      expect(presetParamKeys(preset).length, preset).toBeGreaterThan(0);
      for (const key of presetParamKeys(preset)) expect(kernelParamKeys(effect), preset).toContain(key);
      const runs = effectRuns(makeEffectPresetLayer(preset));
      expect(
        runs.some((run) => isKernelActive(run.values, effect)),
        preset,
      ).toBe(true);
    }
  });

  it.each(KERNEL_IDS)('renders %s only on its declared backend', async (effect) => {
    const layer = effectLayer(effect);
    const { backend } = kernelDefinition(effect);
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

import { describe, expect, it } from 'vitest';
import { type CanvasDocument, makeDocument, makeEffectPresetLayer, makeFillLayer } from '../../types/config';
import { makeEffectEntry } from '../../types/effectPresets';
import { renderDocument } from '../../utils/renderer';

function tintDoc(patch: { mix?: number; enabled?: boolean } = {}): CanvasDocument {
  const tint = makeEffectPresetLayer('tint', { id: 'tint', tint: '#000000', tintOp: 80 });
  return makeDocument({
    global: { bg: 'transparent', seed: 1, aspect: '1:1' },
    layers: [
      makeFillLayer({ id: 'fill', color: '#ffffff', opacity: 100 }),
      {
        ...tint,
        mix: patch.mix ?? 100,
        effects: tint.effects.map((entry) => ({ ...entry, enabled: patch.enabled ?? true })),
      },
    ],
    export: { format: 'png', scale: 1, target: 'cover' },
  });
}

async function centerRed(doc: CanvasDocument) {
  const canvas = await renderDocument(doc, 20, 20, new Map());
  return canvas.getContext('2d')!.getImageData(10, 10, 1, 1).data[0];
}

describe('effect stack rendering', () => {
  it('blends the effected result over the input by the layer mix', async () => {
    const full = await centerRed(tintDoc());
    const half = await centerRed(tintDoc({ mix: 50 }));
    const none = await centerRed(tintDoc({ mix: 0 }));

    expect(full).toBeLessThan(80);
    expect(none).toBe(255);
    expect(half).toBeGreaterThan(full + 40);
    expect(half).toBeLessThan(none - 40);
  });

  it('skips disabled entries', async () => {
    expect(await centerRed(tintDoc({ enabled: false }))).toBe(255);
  });

  it('applies stack entries top to bottom', async () => {
    const dark = makeEffectEntry('colorOverlay', { mode: 'multiply', color: '#000000', amount: 80 }, 'dark');
    const invert = makeEffectEntry('colorFilter', { mode: 'solarize', amount: 100 }, 'invert');
    const render = (effects: ReturnType<typeof makeEffectEntry>[]) =>
      centerRed(
        makeDocument({
          global: { bg: 'transparent', seed: 1, aspect: '1:1' },
          layers: [
            makeFillLayer({ id: 'fill', color: '#ffffff', opacity: 100 }),
            makeEffectPresetLayer('tint', { id: 'fx', effects }),
          ],
          export: { format: 'png', scale: 1, target: 'cover' },
        }),
      );

    expect(await render([dark, invert])).not.toBe(await render([invert, dark]));
  });
});

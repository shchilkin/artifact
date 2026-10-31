import { describe, expect, it } from 'vitest';
import { migrateV6ToV7 } from './v6ToV7';

describe('migrateV6ToV7', () => {
  it('turns an effect parameter bag into its active effects in schema-6 pass order', () => {
    const doc = migrateV6ToV7({
      schemaVersion: 6,
      layers: [
        { id: 'text', kind: 'text', content: 'A' },
        {
          id: 'fx',
          kind: 'effect',
          name: 'Look',
          visible: true,
          locked: false,
          preset: 'grain',
          maskAlpha: false,
          seedOffset: 3,
          blendMode: 'screen',
          vignette: 40,
          grain: 12,
          rays: 10,
          rayInt: 0,
          rayColor: '#ffffff',
          rgbSplit: 4,
          scanlines: 0,
          scanlineWidth: 2,
        },
      ],
    });

    expect(doc.schemaVersion).toBe(7);
    expect(doc.layers).toEqual([
      { id: 'text', kind: 'text', content: 'A' },
      {
        id: 'fx',
        kind: 'effect',
        name: 'Look',
        visible: true,
        locked: false,
        preset: 'grain',
        maskAlpha: false,
        seedOffset: 3,
        blendMode: 'screen',
        mix: 100,
        effects: [
          { id: 'fx-rgbSplit', effect: 'rgbSplit', enabled: true, params: { rgbSplit: 4 } },
          { id: 'fx-grain', effect: 'grain', enabled: true, params: { grain: 12 } },
          { id: 'fx-vignette', effect: 'vignette', enabled: true, params: { vignette: 40 } },
        ],
      },
    ]);
  });

  it('keeps the preset effect at zero and maps sub-presets to their effect', () => {
    const doc = migrateV6ToV7({
      layers: [
        { id: 'a', kind: 'effect', preset: 'tint', tint: '#350055', tintOp: 0 },
        { id: 'b', kind: 'effect', preset: 'macroblocks', badStream: 72, badStreamBlockSize: 64 },
      ],
    });

    expect(doc.layers).toEqual([
      {
        id: 'a',
        kind: 'effect',
        preset: 'tint',
        mix: 100,
        effects: [{ id: 'a-tint', effect: 'tint', enabled: true, params: { tint: '#350055', tintOp: 0 } }],
      },
      {
        id: 'b',
        kind: 'effect',
        preset: 'macroblocks',
        mix: 100,
        effects: [
          {
            id: 'b-badStream',
            effect: 'badStream',
            enabled: true,
            params: { badStream: 72, badStreamBlockSize: 64, badStreamStages: 'macroblocks' },
          },
        ],
      },
    ]);
  });

  it('treats squeeze as active in either direction and rays only with both amounts', () => {
    const doc = migrateV6ToV7({
      layers: [{ id: 'c', kind: 'effect', squeezeX: -20, squeezeY: 0, rays: 12, rayInt: 0 }],
    });

    expect((doc.layers as Array<{ effects: Array<{ effect: string }> }>)[0].effects.map((item) => item.effect)).toEqual(
      ['squeeze'],
    );
  });

  it('only bumps the version without layers', () => {
    expect(migrateV6ToV7({ global: {} })).toEqual({ global: {}, schemaVersion: 7 });
  });
});

import { describe, expect, it } from 'vitest';
import { migrateV15ToV16 } from './v15ToV16';

describe('migrateV15ToV16', () => {
  it('rewrites the merged effects as modes and leaves other entries alone', () => {
    const doc = migrateV15ToV16({
      schemaVersion: 15,
      layers: [
        {
          id: 'fx',
          kind: 'effect',
          effects: [
            { id: 'a', effect: 'blur', enabled: true, params: { blurAmt: 8 } },
            {
              id: 'b',
              effect: 'pixelStretch',
              enabled: true,
              params: { pixelStretch: 70, pixelStretchLength: 34, pixelStretchAngle: 0 },
            },
            { id: 'c', effect: 'retroResolution', enabled: true, params: { retroResolution: 320 } },
            { id: 'd', effect: 'silhouetteCrush', enabled: true, params: { silhouetteCrush: 55 } },
            { id: 'keep', effect: 'vignette', enabled: true, params: { vignette: 12 } },
          ],
        },
      ],
    });

    expect(doc.schemaVersion).toBe(16);
    expect(doc.layers).toEqual([
      {
        id: 'fx',
        kind: 'effect',
        effects: [
          { id: 'a', effect: 'blur', enabled: true, params: { blurAmt: 8, mode: 'gaussian' } },
          {
            id: 'b',
            effect: 'blur',
            enabled: true,
            params: { pixelStretch: 70, pixelStretchLength: 34, pixelStretchAngle: 0, mode: 'motion' },
          },
          { id: 'c', effect: 'pixelate', enabled: true, params: { retroResolution: 320, mode: 'retro' } },
          { id: 'd', effect: 'alphaCrush', enabled: true, params: { mode: 'chip', amount: 55 } },
          { id: 'keep', effect: 'vignette', enabled: true, params: { vignette: 12 } },
        ],
      },
    ]);
  });
});

import { describe, expect, it } from 'vitest';
import { migrateV14ToV15 } from './v14ToV15';

describe('migrateV14ToV15', () => {
  it('rewrites the merged effects as modes and leaves other entries alone', () => {
    const doc = migrateV14ToV15({
      schemaVersion: 14,
      layers: [
        {
          id: 'fx',
          kind: 'effect',
          effects: [
            { id: 'a', effect: 'morph', enabled: true, params: { morphAmt: 50, morphFreq: 7 } },
            { id: 'b', effect: 'vortex', enabled: true, params: { vortex: 30 } },
            { id: 'c', effect: 'squeeze', enabled: true, params: { squeezeX: -20, squeezeY: 0 } },
            { id: 'd', effect: 'mirror', enabled: true, params: { mirror: 2 } },
            { id: 'keep', effect: 'vignette', enabled: true, params: { vignette: 12 } },
          ],
        },
      ],
    });

    expect(doc.schemaVersion).toBe(15);
    expect(doc.layers).toEqual([
      {
        id: 'fx',
        kind: 'effect',
        effects: [
          { id: 'a', effect: 'displace', enabled: true, params: { morphAmt: 50, morphFreq: 7, mode: 'liquid' } },
          { id: 'b', effect: 'lens', enabled: true, params: { vortex: 30, mode: 'swirl' } },
          { id: 'c', effect: 'lens', enabled: true, params: { squeezeX: -20, squeezeY: 0, mode: 'squeeze' } },
          { id: 'd', effect: 'symmetry', enabled: true, params: { mirror: 2, mode: 'mirror' } },
          { id: 'keep', effect: 'vignette', enabled: true, params: { vignette: 12 } },
        ],
      },
    ]);
  });
});

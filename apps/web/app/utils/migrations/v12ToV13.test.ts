import { describe, expect, it } from 'vitest';
import { migrateV12ToV13 } from './v12ToV13';

describe('migrateV12ToV13', () => {
  it('rewrites the merged effects as modes and leaves other entries alone', () => {
    const doc = migrateV12ToV13({
      schemaVersion: 12,
      layers: [
        {
          id: 'fx',
          kind: 'effect',
          effects: [
            { id: 'a', effect: 'grain', enabled: true, params: { grain: 26 } },
            { id: 'b', effect: 'matte', enabled: true, params: { matte: 40 } },
            { id: 'c', effect: 'dotGrain', enabled: true, params: { dotGrain: 68, dotGrainSize: 4 } },
            { id: 'd', effect: 'edgeDetect', enabled: false, params: { edgeDetect: 55 } },
            { id: 'keep', effect: 'vignette', enabled: true, params: { vignette: 12 } },
          ],
        },
      ],
    });

    expect(doc.schemaVersion).toBe(13);
    expect(doc.layers).toEqual([
      {
        id: 'fx',
        kind: 'effect',
        effects: [
          { id: 'a', effect: 'grain', enabled: true, params: { mode: 'fine', amount: 26 } },
          { id: 'b', effect: 'grain', enabled: true, params: { mode: 'coarse', amount: 40 } },
          { id: 'c', effect: 'halftone', enabled: true, params: { dotGrain: 68, dotGrainSize: 4, mode: 'stochastic' } },
          { id: 'd', effect: 'edges', enabled: false, params: { mode: 'outline', amount: 55 } },
          { id: 'keep', effect: 'vignette', enabled: true, params: { vignette: 12 } },
        ],
      },
    ]);
  });
});

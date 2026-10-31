import { describe, expect, it } from 'vitest';
import { migrateV13ToV14 } from './v13ToV14';

describe('migrateV13ToV14', () => {
  it('rewrites the merged effects as modes and leaves other entries alone', () => {
    const doc = migrateV13ToV14({
      schemaVersion: 13,
      layers: [
        {
          id: 'fx',
          kind: 'effect',
          effects: [
            { id: 'a', effect: 'rgbSplit', enabled: true, params: { rgbSplit: 4 } },
            { id: 'b', effect: 'ca', enabled: true, params: { ca: 18 } },
            { id: 'c', effect: 'tear', enabled: true, params: { tearAmt: 6, tearSize: 3 } },
            { id: 'd', effect: 'badStream', enabled: true, params: { badStream: 72, badStreamStages: 'macroblocks' } },
            { id: 'keep', effect: 'vignette', enabled: true, params: { vignette: 12 } },
          ],
        },
      ],
    });

    expect(doc.schemaVersion).toBe(14);
    expect(doc.layers).toEqual([
      {
        id: 'fx',
        kind: 'effect',
        effects: [
          { id: 'a', effect: 'channelSplit', enabled: true, params: { mode: 'linear', amount: 4 } },
          { id: 'b', effect: 'channelSplit', enabled: true, params: { mode: 'radial', amount: 18 } },
          { id: 'c', effect: 'lineGlitch', enabled: true, params: { tearAmt: 6, tearSize: 3, mode: 'tear' } },
          {
            id: 'd',
            effect: 'compression',
            enabled: true,
            params: { badStream: 72, badStreamStages: 'macroblocks', mode: 'codec' },
          },
          { id: 'keep', effect: 'vignette', enabled: true, params: { vignette: 12 } },
        ],
      },
    ]);
  });
});

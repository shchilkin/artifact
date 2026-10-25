import { describe, expect, it } from 'vitest';
import { migrateV16ToV17 } from './v16ToV17';

describe('migrateV16ToV17', () => {
  it('rewrites the merged effects as modes and leaves other entries alone', () => {
    const doc = migrateV16ToV17({
      schemaVersion: 16,
      layers: [
        {
          id: 'fx',
          kind: 'effect',
          effects: [
            { id: 'a', effect: 'hueShift', enabled: true, params: { hueShift: 60 } },
            { id: 'keep', effect: 'vignette', enabled: true, params: { vignette: 12 } },
          ],
        },
      ],
    });

    expect(doc.schemaVersion).toBe(17);
    expect(doc.layers).toEqual([
      {
        id: 'fx',
        kind: 'effect',
        effects: [
          { id: 'a', effect: 'adjust', enabled: true, params: { hue: 60 } },
          { id: 'keep', effect: 'vignette', enabled: true, params: { vignette: 12 } },
        ],
      },
    ]);
  });
});

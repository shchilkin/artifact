import { describe, expect, it } from 'vitest';
import { migrateV10ToV11 } from './v10ToV11';

describe('migrateV10ToV11', () => {
  it('rewrites the merged effects as modes and leaves other entries alone', () => {
    const doc = migrateV10ToV11({
      schemaVersion: 10,
      layers: [
        {
          id: 'fx',
          kind: 'effect',
          effects: [
            { id: 'a', effect: 'posterize', enabled: true, params: { posterize: 5 } },
            { id: 'b', effect: 'dither', enabled: true, params: { dither: 36 } },
            {
              id: 'c',
              effect: 'indexedPalette',
              enabled: true,
              params: { indexedPalette: 100, indexedPaletteCount: 4, indexedColorA: '#000000' },
            },
            { id: 'keep', effect: 'grain', enabled: true, params: { grain: 12 } },
          ],
        },
      ],
    });

    expect(doc.schemaVersion).toBe(11);
    expect(doc.layers).toEqual([
      {
        id: 'fx',
        kind: 'effect',
        effects: [
          { id: 'a', effect: 'posterize', enabled: true, params: { posterize: 5, mode: 'levels' } },
          { id: 'b', effect: 'posterize', enabled: true, params: { dither: 36, mode: 'dither' } },
          {
            id: 'c',
            effect: 'posterize',
            enabled: true,
            params: { indexedPalette: 100, indexedPaletteCount: 4, indexedColorA: '#000000', mode: 'palette' },
          },
          { id: 'keep', effect: 'grain', enabled: true, params: { grain: 12 } },
        ],
      },
    ]);
  });
});

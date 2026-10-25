import { describe, expect, it } from 'vitest';
import { migrateV8ToV9 } from './v8ToV9';

describe('migrateV8ToV9', () => {
  it('rewrites the merged effects as modes and leaves other entries alone', () => {
    const doc = migrateV8ToV9({
      schemaVersion: 8,
      layers: [
        {
          id: 'fx',
          kind: 'effect',
          effects: [
            { id: 'a', effect: 'duotone', enabled: true, params: { duotone: 60, duoA: '#000000', duoB: '#ffffff' } },
            {
              id: 'b',
              effect: 'gradientMap',
              enabled: true,
              params: {
                gradientMap: 80,
                gradientMapShadow: '#111111',
                gradientMapMid: '#222222',
                gradientMapHighlight: '#333333',
              },
            },
            {
              id: 'c',
              effect: 'splitTone',
              enabled: false,
              params: { splitToneAmt: 30, splitShadow: '#001a4f', splitHighlight: '#ff8040' },
            },
            { id: 'keep', effect: 'grain', enabled: true, params: { grain: 12 } },
          ],
        },
      ],
    });

    expect(doc.schemaVersion).toBe(9);
    expect(doc.layers).toEqual([
      {
        id: 'fx',
        kind: 'effect',
        effects: [
          {
            id: 'a',
            effect: 'gradientMap',
            enabled: true,
            params: { mode: 'duo', amount: 60, shadow: '#000000', highlight: '#ffffff' },
          },
          {
            id: 'b',
            effect: 'gradientMap',
            enabled: true,
            params: { mode: 'tri', amount: 80, shadow: '#111111', mid: '#222222', highlight: '#333333' },
          },
          {
            id: 'c',
            effect: 'gradientMap',
            enabled: false,
            params: { mode: 'split', amount: 30, shadow: '#001a4f', highlight: '#ff8040' },
          },
          { id: 'keep', effect: 'grain', enabled: true, params: { grain: 12 } },
        ],
      },
    ]);
  });
});

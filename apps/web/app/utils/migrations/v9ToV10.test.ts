import { describe, expect, it } from 'vitest';
import { migrateV9ToV10 } from './v9ToV10';

describe('migrateV9ToV10', () => {
  it('rewrites the merged effects as modes and leaves other entries alone', () => {
    const doc = migrateV9ToV10({
      schemaVersion: 9,
      layers: [
        {
          id: 'fx',
          kind: 'effect',
          effects: [
            { id: 'a', effect: 'tint', enabled: true, params: { tint: '#350055', tintOp: 25 } },
            {
              id: 'b',
              effect: 'gradientOverlay',
              enabled: true,
              params: { gradMix: 50, gradA: '#000000', gradB: '#ffffff', gradAngle: 90 },
            },
            { id: 'c', effect: 'fog', enabled: true, params: { fog: 40, fogColor: '#c8d8e8' } },
            { id: 'keep', effect: 'grain', enabled: true, params: { grain: 12 } },
          ],
        },
      ],
    });

    expect(doc.schemaVersion).toBe(10);
    expect(doc.layers).toEqual([
      {
        id: 'fx',
        kind: 'effect',
        effects: [
          {
            id: 'a',
            effect: 'colorOverlay',
            enabled: true,
            params: { mode: 'multiply', amount: 25, color: '#350055' },
          },
          {
            id: 'b',
            effect: 'colorOverlay',
            enabled: true,
            params: { mode: 'gradient', amount: 50, color: '#000000', colorB: '#ffffff', angle: 90 },
          },
          { id: 'c', effect: 'colorOverlay', enabled: true, params: { mode: 'haze', amount: 40, color: '#c8d8e8' } },
          { id: 'keep', effect: 'grain', enabled: true, params: { grain: 12 } },
        ],
      },
    ]);
  });
});

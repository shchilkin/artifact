import { describe, expect, it } from 'vitest';
import { migrateV11ToV12 } from './v11ToV12';

describe('migrateV11ToV12', () => {
  it('rewrites the merged effects as modes and leaves other entries alone', () => {
    const doc = migrateV11ToV12({
      schemaVersion: 11,
      layers: [
        {
          id: 'fx',
          kind: 'effect',
          effects: [
            { id: 'a', effect: 'bloom', enabled: true, params: { bloom: 30 } },
            { id: 'b', effect: 'neonGlow', enabled: true, params: { neonGlow: 42, neonColor: '#67ffd8' } },
            { id: 'c', effect: 'rays', enabled: true, params: { rays: 14, rayInt: 62, rayColor: '#bb00ff' } },
            { id: 'd', effect: 'speedLines', enabled: true, params: { speedLines: 50 } },
            { id: 'keep', effect: 'vignette', enabled: true, params: { vignette: 12 } },
          ],
        },
      ],
    });

    expect(doc.schemaVersion).toBe(12);
    expect(doc.layers).toEqual([
      {
        id: 'fx',
        kind: 'effect',
        effects: [
          { id: 'a', effect: 'glow', enabled: true, params: { mode: 'bloom', amount: 30 } },
          { id: 'b', effect: 'glow', enabled: true, params: { mode: 'neon', amount: 42, color: '#67ffd8' } },
          {
            id: 'c',
            effect: 'rays',
            enabled: true,
            params: { rays: 14, rayInt: 62, rayColor: '#bb00ff', mode: 'beams' },
          },
          { id: 'd', effect: 'rays', enabled: true, params: { speedLines: 50, mode: 'lines' } },
          { id: 'keep', effect: 'vignette', enabled: true, params: { vignette: 12 } },
        ],
      },
    ]);
  });
});

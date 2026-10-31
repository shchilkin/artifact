import { describe, expect, it } from 'vitest';
import { migrateV7ToV8 } from './v7ToV8';

describe('migrateV7ToV8', () => {
  it('turns the fixed color looks and the channel mixer into Color Filter modes', () => {
    const doc = migrateV7ToV8({
      schemaVersion: 7,
      layers: [
        {
          id: 'fx',
          kind: 'effect',
          effects: [
            { id: 'a', effect: 'sepia', enabled: true, params: { sepia: 40 } },
            { id: 'b', effect: 'bleachBypass', enabled: false, params: { bleachBypass: 70 } },
            {
              id: 'c',
              effect: 'channelMixer',
              enabled: true,
              params: { channelMixer: 50, channelRedMix: 10, channelGreenMix: -20, channelBlueMix: 30 },
            },
            { id: 'd', effect: 'grain', enabled: true, params: { grain: 12 } },
          ],
        },
        { id: 'text', kind: 'text' },
      ],
    });

    expect(doc.schemaVersion).toBe(8);
    expect(doc.layers).toEqual([
      {
        id: 'fx',
        kind: 'effect',
        effects: [
          { id: 'a', effect: 'colorFilter', enabled: true, params: { mode: 'sepia', amount: 40 } },
          { id: 'b', effect: 'colorFilter', enabled: false, params: { mode: 'bleach', amount: 70 } },
          {
            id: 'c',
            effect: 'colorFilter',
            enabled: true,
            params: { mode: 'mixer', amount: 50, channelRedMix: 10, channelGreenMix: -20, channelBlueMix: 30 },
          },
          { id: 'd', effect: 'grain', enabled: true, params: { grain: 12 } },
        ],
      },
      { id: 'text', kind: 'text' },
    ]);
  });
});

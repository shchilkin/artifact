import { describe, expect, it } from 'vitest';

import { SCENE3D_RIG_PRESETS } from './Scene3DInspector';

describe('Scene3DInspector rig presets', () => {
  it('offers named lighting rigs with durable scene patches', () => {
    expect(SCENE3D_RIG_PRESETS.map((preset) => preset.name)).toEqual([
      'Product light',
      'Flat console',
      'Harsh key',
      'Backlit',
      'Clay unlit',
    ]);

    for (const preset of SCENE3D_RIG_PRESETS) {
      expect(preset.patch).toMatchObject({
        materialMode: expect.any(String),
        exposure: expect.any(Number),
        ambientIntensity: expect.any(Number),
        keyAzimuth: expect.any(Number),
        keyElevation: expect.any(Number),
        keyIntensity: expect.any(Number),
        fillIntensity: expect.any(Number),
        rimIntensity: expect.any(Number),
      });
    }
  });

  it('includes a direct no-drama material check preset', () => {
    const unlit = SCENE3D_RIG_PRESETS.find((preset) => preset.id === 'unlit');
    expect(unlit?.patch).toMatchObject({
      materialMode: 'unlit',
      keyIntensity: 0,
      fillIntensity: 0,
      rimIntensity: 0,
    });
  });
});

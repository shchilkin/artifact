import { describe, expect, it } from 'vitest';

import { SHADER_ADVANCED_CONTROL_FIELDS, SHADER_PRIMARY_CONTROL_FIELDS } from './ShaderInspectorMetadata';

describe('ShaderInspector metadata', () => {
  it('keeps shader fills focused on no more than five primary controls', () => {
    expect(SHADER_PRIMARY_CONTROL_FIELDS).toEqual(['shaderKind', 'colorA', 'colorB', 'distortion', 'grain']);
    expect(SHADER_PRIMARY_CONTROL_FIELDS).toHaveLength(5);
  });

  it('keeps secondary shader tuning available as advanced controls', () => {
    expect(SHADER_ADVANCED_CONTROL_FIELDS).toEqual([
      'blendMode',
      'opacity',
      'colorC',
      'colorD',
      'swirl',
      'scale',
      'rotation',
      'offsetX',
      'offsetY',
      'seedOffset',
    ]);
  });
});

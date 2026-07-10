import {
  normalizeShaderDefinition,
  normalizeShaderInstance,
  normalizeShaderPropertyValues,
  type ShaderDefinition,
  validateShaderDefinition,
} from '@artifact/shared';
import { describe, expect, it } from 'vitest';

const definition: ShaderDefinition = {
  version: 1,
  id: 'water-effect',
  label: 'Water Effect',
  language: 'glsl-fragment',
  code: `vec4 mainImage(vec2 uv) {
    vec4 source = texture2D(u_backdrop, uv);
    vec3 tinted = mix(source.rgb, source.rgb * u_prop_tint, u_prop_amount);
    return vec4(mix(source.rgb, tinted, u_prop_highlights), source.a);
  }`,
  properties: [
    { key: 'amount', label: 'Amount', type: 'number', default: 0.5, min: 0, max: 1, step: 0.01 },
    { key: 'tint', label: 'Tint', type: 'color', default: '#55ccff' },
    { key: 'highlights', label: 'Highlights', type: 'boolean', default: true },
  ],
};

describe('shader definition contract', () => {
  it('normalizes instance values from the definition manifest', () => {
    expect(
      normalizeShaderPropertyValues(definition, {
        amount: 8,
        tint: 'invalid',
        highlights: false,
        ignored: 42,
      }),
    ).toEqual({ amount: 1, tint: '#55ccff', highlights: false });
  });

  it('normalizes a serializable definition and instance values', () => {
    expect(normalizeShaderDefinition(definition)).toEqual(definition);
    expect(normalizeShaderInstance({ definition, values: { amount: 0.25 } })).toMatchObject({
      definition: { id: 'water-effect' },
      values: { amount: 0.25, tint: '#55ccff', highlights: true },
    });
  });

  it('rejects ambiguous property manifests', () => {
    expect(
      validateShaderDefinition({
        ...definition,
        properties: [definition.properties[0], definition.properties[0]],
      }),
    ).toContain('Shader property key amount is duplicated.');
  });

  it('rejects invalid property ranges instead of silently accepting them', () => {
    expect(
      validateShaderDefinition({
        ...definition,
        properties: [{ key: 'amount', label: 'Amount', type: 'number', default: 3, min: 1, max: 0, step: 0 }],
      }),
    ).toEqual(
      expect.arrayContaining([
        'Shader property 1: minimum must not exceed maximum.',
        'Shader property 1: step must be greater than zero.',
        'Shader property 1: default must be inside the allowed range.',
      ]),
    );
  });

  it('rejects manifest controls that the shader code never reads', () => {
    expect(
      validateShaderDefinition({
        ...definition,
        code: 'vec4 mainImage(vec2 uv) { return texture2D(u_backdrop, uv); }',
      }),
    ).toEqual(
      expect.arrayContaining([
        'Shader property amount is not used by the shader code.',
        'Shader property tint is not used by the shader code.',
        'Shader property highlights is not used by the shader code.',
      ]),
    );
  });

  it('does not count commented uniforms as editable control usage', () => {
    expect(
      validateShaderDefinition({
        ...definition,
        code: `// u_prop_amount u_prop_tint u_prop_highlights
vec4 mainImage(vec2 uv) { return texture2D(u_backdrop, uv); }`,
      }),
    ).toContain('Shader property amount is not used by the shader code.');
  });
});

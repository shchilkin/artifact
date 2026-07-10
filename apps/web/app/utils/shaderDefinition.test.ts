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
  code: 'vec4 mainImage(vec2 uv) { return texture2D(u_backdrop, uv); }',
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
});

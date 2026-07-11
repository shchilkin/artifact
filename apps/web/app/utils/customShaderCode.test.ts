import { describe, expect, it } from 'vitest';
import { makeDefaultCodeShaderInstance, validateCustomShaderCode } from './customShaderCode';

describe('custom shader code validation', () => {
  it('creates an empty serializable shader definition for a new code node', () => {
    expect(makeDefaultCodeShaderInstance('shader-a')).toMatchObject({
      definition: { id: 'shader-a-definition', code: '', properties: [] },
      values: {},
    });
  });

  it('requires a mainImage entry point', () => {
    expect(validateCustomShaderCode('vec4 shade(vec2 uv) { return vec4(uv, 0.0, 1.0); }')).toContainEqual(
      expect.objectContaining({ severity: 'error', message: expect.stringContaining('mainImage') }),
    );
  });

  it('blocks wrapper-owned and expensive shader patterns', () => {
    const issues = validateCustomShaderCode(`
vec4 mainImage(vec2 uv) {
  while (uv.x > 0.0) { uv.x -= 0.1; }
  return vec4(uv, 0.0, 1.0);
}
void main() {}
`);

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ severity: 'error', message: expect.stringContaining('void main') }),
        expect.objectContaining({ severity: 'error', message: expect.stringContaining('while') }),
      ]),
    );
  });

  it('limits for-loop work to a small fixed count', () => {
    expect(
      validateCustomShaderCode(`
vec4 mainImage(vec2 uv) {
  for (int i = 0; i < 64; i++) { uv.x += 0.001; }
  return vec4(uv, 0.0, 1.0);
}
`),
    ).toContainEqual(expect.objectContaining({ severity: 'error', message: expect.stringContaining('32') }));
  });

  it('blocks loop counters that cannot make progress', () => {
    expect(
      validateCustomShaderCode(`
vec4 mainImage(vec2 uv) {
  for (int i = 0; i < 12; i += 0) { uv.x += 0.001; }
  return vec4(uv, 0.0, 1.0);
}
`),
    ).toContainEqual(expect.objectContaining({ severity: 'error', message: expect.stringContaining('Advance') }));
  });

  it('allows only one bounded loop per shader', () => {
    expect(
      validateCustomShaderCode(`
vec4 mainImage(vec2 uv) {
  for (int i = 0; i < 8; i++) { uv.x += 0.001; }
  for (int j = 0; j < 8; j++) { uv.y += 0.001; }
  return vec4(uv, 0.0, 1.0);
}
`),
    ).toContainEqual(expect.objectContaining({ severity: 'error', message: expect.stringContaining('at most one') }));
  });
});

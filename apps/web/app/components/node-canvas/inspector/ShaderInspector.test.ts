import { describe, expect, it } from 'vitest';
import { SHADER_ADVANCED_CONTROL_FIELDS, SHADER_PRIMARY_CONTROL_FIELDS } from './ShaderInspectorMetadata';
import { aiShaderPassEmptyStatus, canCreateAiShaderPass, shaderInspectorRoleNote } from './ShaderInspectorModel';

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

  it('requires a connected source before AI shader generation can start', () => {
    expect(canCreateAiShaderPass('water refraction', false, false)).toBe(false);
    expect(canCreateAiShaderPass('water refraction', true, true)).toBe(false);
    expect(canCreateAiShaderPass('ok', true, false)).toBe(false);
    expect(canCreateAiShaderPass('water refraction', true, false)).toBe(true);
  });

  it('describes AI shader empty state as a source-connected pass', () => {
    expect(aiShaderPassEmptyStatus(false, false)).toEqual({
      title: 'Connect source',
      message: 'This pass transforms an incoming image. Connect a source before creating it.',
    });
    expect(aiShaderPassEmptyStatus(true, true)).toEqual({
      title: 'Ready to create',
      message: 'Create an editable pass that processes the connected source.',
    });
    expect(shaderInspectorRoleNote('customSpec')).toBe(
      'Use as a source-connected pass, then send the processed result onward or into a material map.',
    );
    expect(shaderInspectorRoleNote('customCode')).toBe(
      'Use code as a standalone shader fill or as a pass over the connected backdrop.',
    );
  });
});

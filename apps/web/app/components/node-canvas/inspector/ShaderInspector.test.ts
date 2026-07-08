import { describe, expect, it } from 'vitest';
import {
  SHADER_COLOR_CONTROL_FIELDS,
  SHADER_COMPOSITE_CONTROL_FIELDS,
  SHADER_PATTERN_CONTROL_FIELDS,
  SHADER_PLACEMENT_CONTROL_FIELDS,
  SHADER_PRESET_CONTROL_GROUPS,
} from './ShaderInspectorMetadata';
import {
  aiShaderPassEmptyStatus,
  canCreateAiShaderPass,
  shaderInspectorRoleNote,
  showsPresetShaderControls,
} from './ShaderInspectorModel';

describe('ShaderInspector metadata', () => {
  it('keeps preset shader colors in one group', () => {
    expect(SHADER_COLOR_CONTROL_FIELDS).toEqual(['colorA', 'colorB', 'colorC', 'colorD']);
  });

  it('groups preset shader controls by the job they do', () => {
    expect(SHADER_PATTERN_CONTROL_FIELDS).toEqual(['distortion', 'grain', 'swirl', 'scale', 'seedOffset']);
    expect(SHADER_PLACEMENT_CONTROL_FIELDS).toEqual(['rotation', 'offsetX', 'offsetY']);
    expect(SHADER_COMPOSITE_CONTROL_FIELDS).toEqual(['blendMode', 'opacity']);
    expect(SHADER_PRESET_CONTROL_GROUPS.map((group) => group.title)).toEqual([
      'Colors',
      'Pattern',
      'Placement',
      'Composite',
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

  it('keeps preset-only color/detail controls off custom shader variants', () => {
    expect(showsPresetShaderControls('meshGradient')).toBe(true);
    expect(showsPresetShaderControls('customSpec')).toBe(false);
    expect(showsPresetShaderControls('customCode')).toBe(false);
  });
});

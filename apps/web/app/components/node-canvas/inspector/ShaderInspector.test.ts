import { describe, expect, it } from 'vitest';
import { AI_SHADER_PROMPT_MAX_LENGTH } from '../../../types/aiGeneration';
import { codeShaderUniformControls } from './CodeShaderInspectorModel';
import { shaderPresetControlConfig } from './ShaderInspectorMetadata';
import {
  aiShaderPassEmptyStatus,
  canCreateAiShaderPass,
  shaderInspectorRoleNote,
  shaderInspectorRoleStatus,
  showsPresetShaderControls,
} from './ShaderInspectorModel';

describe('ShaderInspector metadata', () => {
  it('shows the full shape and placement surface only for presets that read every field', () => {
    expect(shaderPresetControlConfig('meshGradient')).toEqual({
      shape: ['distortion', 'swirl', 'scale'],
      placement: ['rotation', 'offsetX', 'offsetY'],
    });
    expect(shaderPresetControlConfig('marble')).toEqual({
      shape: ['distortion', 'swirl', 'scale'],
      placement: ['rotation', 'offsetX', 'offsetY'],
    });
  });

  it('hides preset controls that the selected renderer does not read', () => {
    expect(shaderPresetControlConfig('borderRings')).toEqual({ shape: [], placement: [] });
    expect(shaderPresetControlConfig('staticRadialGradient')).toEqual({
      shape: ['scale'],
      placement: ['offsetX', 'offsetY'],
    });
    expect(shaderPresetControlConfig('colorPanels')).toEqual({ shape: ['scale'], placement: [] });
    expect(shaderPresetControlConfig('dotOrbit')).toEqual({
      shape: ['swirl', 'scale'],
      placement: ['rotation'],
    });
  });

  it('requires a connected source before AI shader generation can start', () => {
    expect(canCreateAiShaderPass('water refraction', false, false)).toBe(false);
    expect(canCreateAiShaderPass('water refraction', true, true)).toBe(false);
    expect(canCreateAiShaderPass('ok', true, false)).toBe(false);
    expect(canCreateAiShaderPass('water refraction', true, false)).toBe(true);
    expect(canCreateAiShaderPass('x'.repeat(AI_SHADER_PROMPT_MAX_LENGTH + 1), true, false)).toBe(false);
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

  it('describes preset shaders as fill or pass from source connection state', () => {
    expect(shaderInspectorRoleStatus('meshGradient', false)).toEqual({
      label: 'Shader Fill',
      message: 'No input is connected, so this shader renders its own texture.',
      mode: 'fill',
    });
    expect(shaderInspectorRoleStatus('meshGradient', true)).toEqual({
      label: 'Shader Pass',
      message: 'Connected artwork is sampled by this shader and sent onward as a pass.',
      mode: 'pass',
    });
    expect(shaderInspectorRoleStatus('customCode', true)).toMatchObject({
      label: 'Code Pass',
      mode: 'pass',
    });
  });

  it('shows Code Shader inputs only when the GLSL reads their uniforms', () => {
    expect(codeShaderUniformControls('vec4 mainImage(vec2 uv) { return vec4(uv, 0.0, 1.0); }')).toEqual([]);
    expect(codeShaderUniformControls('vec4 mainImage(vec2 uv) { return vec4(u_strength + u_seed); }')).toEqual([
      'strength',
      'variation',
    ]);
    expect(codeShaderUniformControls('// u_strength\nvec4 mainImage(vec2 uv) { return vec4(1.0); }')).toEqual([]);
  });
});

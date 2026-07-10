import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import { AI_SHADER_PROMPT_MAX_LENGTH } from '../../../types/aiGeneration';
import { codeShaderUniformControls, makeCodeShaderProperty } from './CodeShaderInspectorModel';
import { shaderPresetControlConfig } from './ShaderInspectorMetadata';
import {
  aiShaderEmptyStatus,
  canCreateAiShader,
  shaderInspectorRoleNote,
  shaderInspectorRoleStatus,
  showsPresetShaderControls,
} from './ShaderInspectorModel';
import { shaderGenerationMachine } from './shaderGenerationMachine';

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
    expect(canCreateAiShader('water refraction', false, false)).toBe(false);
    expect(canCreateAiShader('water refraction', true, true)).toBe(false);
    expect(canCreateAiShader('ok', true, false)).toBe(false);
    expect(canCreateAiShader('water refraction', true, false)).toBe(true);
    expect(canCreateAiShader('x'.repeat(AI_SHADER_PROMPT_MAX_LENGTH + 1), true, false)).toBe(false);
  });

  it('offers local fallback only for recoverable OpenAI failures', () => {
    const recoverable = createActor(shaderGenerationMachine).start();
    recoverable.send({ type: 'CREATE_OPENAI' });
    recoverable.send({ type: 'OPENAI_FAILED', message: 'Provider failed.' });
    expect(recoverable.getSnapshot().matches('fallbackOffered')).toBe(true);

    const blocked = createActor(shaderGenerationMachine).start();
    blocked.send({ type: 'CREATE_OPENAI' });
    blocked.send({ type: 'OPENAI_BLOCKED', message: 'Quota reached.' });
    expect(blocked.getSnapshot().matches('failed')).toBe(true);
    expect(blocked.getSnapshot().context.message).toBe('Quota reached.');
  });

  it('describes AI shader empty state as a source-connected effect', () => {
    expect(aiShaderEmptyStatus(false, false)).toEqual({
      title: 'Connect source',
      message: 'This effect transforms an incoming image. Connect a source before creating it.',
    });
    expect(aiShaderEmptyStatus(true, true)).toEqual({
      title: 'Ready to create',
      message: 'Create an editable effect that processes the connected source.',
    });
    expect(shaderInspectorRoleNote('aiShader', 'effect')).toBe(
      'Use as a source-connected effect, then send the processed result onward or into a material map.',
    );
    expect(shaderInspectorRoleNote('customCode', 'fill')).toBe(
      'This shader creates its own pixels and can feed artwork or a material map.',
    );
  });

  it('keeps preset-only color/detail controls off custom shader variants', () => {
    expect(showsPresetShaderControls('meshGradient')).toBe(true);
    expect(showsPresetShaderControls('aiShader')).toBe(false);
    expect(showsPresetShaderControls('customCode')).toBe(false);
  });

  it('describes shader roles independently from connection state', () => {
    expect(shaderInspectorRoleStatus('meshGradient', 'fill', false)).toEqual({
      label: 'Shader Fill',
      message: 'This shader renders its own texture and does not accept an image input.',
      mode: 'fill',
    });
    expect(shaderInspectorRoleStatus('meshGradient', 'effect', true)).toEqual({
      label: 'Shader Effect',
      message: 'Connected artwork can be transformed by the generated shader.',
      mode: 'pass',
    });
    expect(shaderInspectorRoleStatus('customCode', 'effect', false)).toMatchObject({
      label: 'Shader Effect',
      message: expect.stringContaining('stays transparent'),
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

  it('creates reachable manifest controls with stable unique uniform keys', () => {
    const amount = makeCodeShaderProperty('number', []);
    const secondAmount = makeCodeShaderProperty('number', [amount]);
    const tint = makeCodeShaderProperty('color', [amount, secondAmount]);

    expect(amount).toMatchObject({ key: 'amount', type: 'number', default: 0.5 });
    expect(secondAmount).toMatchObject({ key: 'amount2', label: 'Amount 2' });
    expect(tint).toEqual({ key: 'tint', label: 'Tint', type: 'color', default: '#ffffff' });
  });
});

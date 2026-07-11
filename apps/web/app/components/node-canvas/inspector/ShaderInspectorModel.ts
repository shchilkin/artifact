import { AI_SHADER_PROMPT_MAX_LENGTH } from '../../../types/aiGeneration';
import type { ShaderKind, ShaderRole } from '../../../types/config';

export function canCreateAiShader(prompt: string, sourceConnected: boolean, generating: boolean) {
  const length = prompt.trim().length;
  return length >= 3 && length <= AI_SHADER_PROMPT_MAX_LENGTH && sourceConnected && !generating;
}

export function aiShaderEmptyStatus(hasPrompt: boolean, sourceConnected: boolean) {
  if (!sourceConnected) {
    return {
      title: 'Connect source',
      message: 'This effect transforms an incoming image. Connect a source before creating it.',
    };
  }
  if (hasPrompt) {
    return {
      title: 'Ready to create',
      message: 'Create an editable effect that processes the connected source.',
    };
  }
  return {
    title: 'Start with a prompt',
    message:
      'Connect a source, then describe how the shader should transform it. The output stays transparent until a result exists.',
  };
}

export function shaderInspectorRoleNote(shaderKind: ShaderKind, role: ShaderRole) {
  if (shaderKind === 'aiShader') {
    return 'Use as a source-connected effect, then send the processed result onward or into a material map.';
  }
  return role === 'effect'
    ? 'This shader requires an incoming image and transforms that branch.'
    : 'This shader creates its own pixels and can feed artwork or a material map.';
}

export function shaderInspectorRoleStatus(shaderKind: ShaderKind, role: ShaderRole, sourceConnected: boolean) {
  if (role === 'effect') {
    return {
      label: shaderKind === 'aiShader' ? 'AI Shader Effect' : 'Shader Effect',
      message: sourceConnected
        ? 'Connected artwork can be transformed by the generated shader.'
        : 'Connect artwork first; this shader stays transparent without a source.',
      mode: 'pass' as const,
    };
  }

  return {
    label: shaderKind === 'customCode' ? 'Code Fill' : 'Shader Fill',
    message: 'This shader renders its own texture and does not accept an image input.',
    mode: 'fill' as const,
  };
}

export function showsPresetShaderControls(shaderKind: ShaderKind) {
  return shaderKind !== 'aiShader' && shaderKind !== 'customCode';
}

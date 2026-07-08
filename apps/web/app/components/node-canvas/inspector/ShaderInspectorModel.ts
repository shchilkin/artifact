import type { ShaderKind } from '../../../types/config';

export function canCreateAiShaderPass(prompt: string, sourceConnected: boolean, generating: boolean) {
  return prompt.trim().length >= 3 && sourceConnected && !generating;
}

export function aiShaderPassEmptyStatus(hasPrompt: boolean, sourceConnected: boolean) {
  if (!sourceConnected) {
    return {
      title: 'Connect source',
      message: 'This pass transforms an incoming image. Connect a source before creating it.',
    };
  }
  if (hasPrompt) {
    return {
      title: 'Ready to create',
      message: 'Create an editable pass that processes the connected source.',
    };
  }
  return {
    title: 'Start with a prompt',
    message:
      'Connect a source, then describe how the shader should transform it. The output stays transparent until a result exists.',
  };
}

export function shaderInspectorRoleNote(shaderKind: ShaderKind) {
  if (shaderKind === 'customSpec') {
    return 'Use as a source-connected pass, then send the processed result onward or into a material map.';
  }
  if (shaderKind === 'customCode') {
    return 'Use code as a standalone shader fill or as a pass over the connected backdrop.';
  }
  return 'Use as a fill, place it over a backdrop, or send it into a material.';
}

export function shaderInspectorRoleStatus(shaderKind: ShaderKind, sourceConnected: boolean) {
  if (shaderKind === 'customSpec') {
    return {
      label: 'AI Shader Pass',
      message: sourceConnected
        ? 'Connected artwork can be transformed by the generated shader.'
        : 'Connect artwork first; this pass stays transparent without a source.',
      mode: 'pass' as const,
    };
  }

  if (sourceConnected) {
    return {
      label: shaderKind === 'customCode' ? 'Code Pass' : 'Shader Pass',
      message: 'Connected artwork is sampled by this shader and sent onward as a pass.',
      mode: 'pass' as const,
    };
  }

  return {
    label: shaderKind === 'customCode' ? 'Code Fill' : 'Shader Fill',
    message: 'No input is connected, so this shader renders its own texture.',
    mode: 'fill' as const,
  };
}

export function showsPresetShaderControls(shaderKind: ShaderKind) {
  return shaderKind !== 'customSpec' && shaderKind !== 'customCode';
}

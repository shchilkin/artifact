import { validateShaderCode } from '@artifact/shared';
import type { ShaderDefinition, ShaderInstance } from '../types/config';

export type CustomShaderCodeIssue = ReturnType<typeof validateShaderCode>[number];

export const DEFAULT_CUSTOM_SHADER_DEFINITION: ShaderDefinition = {
  version: 1,
  id: 'code-shader-definition',
  label: 'Code Shader',
  language: 'glsl-fragment',
  code: '',
  properties: [],
  provenance: { source: 'manual' },
};

export function makeDefaultCodeShaderInstance(id: string): ShaderInstance {
  return {
    definition: {
      ...DEFAULT_CUSTOM_SHADER_DEFINITION,
      id: `${id}-definition`,
      provenance: { source: 'manual' },
    },
    values: {},
  };
}

export function validateCustomShaderCode(code: string): CustomShaderCodeIssue[] {
  return validateShaderCode(code);
}

export function customShaderCodeHasBlockingIssues(code: string) {
  return validateCustomShaderCode(code).some((issue) => issue.severity === 'error');
}

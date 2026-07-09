import type { CustomShaderCodeConfig } from '../types/config';

const MAX_CUSTOM_SHADER_CODE_LENGTH = 12_000;
const MAX_CUSTOM_SHADER_LOOP_COUNT = 32;
const MAX_CUSTOM_SHADER_LOOP_STATEMENTS = 1;

export interface CustomShaderCodeIssue {
  severity: 'error' | 'warning';
  message: string;
}

export const DEFAULT_CUSTOM_SHADER_CODE: CustomShaderCodeConfig = {
  version: 1,
  language: 'glsl-fragment',
  code: '',
};

export function normalizeCustomShaderCodeConfig(value: unknown): CustomShaderCodeConfig {
  if (!value || typeof value !== 'object') return DEFAULT_CUSTOM_SHADER_CODE;
  const record = value as Record<string, unknown>;
  const code =
    typeof record.code === 'string'
      ? record.code.slice(0, MAX_CUSTOM_SHADER_CODE_LENGTH)
      : DEFAULT_CUSTOM_SHADER_CODE.code;
  return {
    version: 1,
    language: 'glsl-fragment',
    code,
  };
}

export function validateCustomShaderCode(code: string): CustomShaderCodeIssue[] {
  const issues: CustomShaderCodeIssue[] = [];
  const trimmed = code.trim();
  if (!trimmed) {
    issues.push({ severity: 'error', message: 'Add code for mainImage(uv).' });
    return issues;
  }
  if (code.length > MAX_CUSTOM_SHADER_CODE_LENGTH) {
    issues.push({ severity: 'error', message: 'Keep shader code under 12,000 characters.' });
  }
  if (!/\bvec4\s+mainImage\s*\(\s*vec2\s+\w+\s*\)/.test(code)) {
    issues.push({ severity: 'error', message: 'Add vec4 mainImage(vec2 uv) so the shader knows what to draw.' });
  }
  if (/\bvoid\s+main\s*\(/.test(code)) {
    issues.push({ severity: 'error', message: 'Remove void main(). Artifact adds the final wrapper for you.' });
  }
  if (/\bgl_Frag(Color|Data)\b/.test(code)) {
    issues.push({ severity: 'error', message: 'Return a vec4 from mainImage instead of writing gl_FragColor.' });
  }
  if (/^\s*#/m.test(code)) {
    issues.push({ severity: 'error', message: 'Remove preprocessor lines that start with #.' });
  }
  if (/\b(while|do)\b/.test(code)) {
    issues.push({ severity: 'error', message: 'Use small fixed for-loops. while and do loops are blocked.' });
  }
  collectLoopIssues(code).forEach((message) => issues.push({ severity: 'error', message }));
  return issues;
}

export function customShaderCodeHasBlockingIssues(code: string) {
  return validateCustomShaderCode(code).some((issue) => issue.severity === 'error');
}

function collectLoopIssues(code: string) {
  const issues: string[] = [];
  const loopRe = /\bfor\s*\(([^;]*);([^;]*);([^)]*)\)/g;
  const loops = [...code.matchAll(loopRe)];
  if (loops.length > MAX_CUSTOM_SHADER_LOOP_STATEMENTS) {
    issues.push('Use at most one small fixed for-loop in a code shader.');
  }
  for (const match of loops) {
    const initializer = (match[1] ?? '').trim();
    const condition = (match[2] ?? '').trim();
    const increment = (match[3] ?? '').trim();
    const initializerMatch = initializer.match(/^int\s+([A-Za-z_]\w*)\s*=\s*0$/);
    if (!initializerMatch) {
      issues.push('Start fixed loops at zero, for example for (int i = 0; i < 12; i++).');
      continue;
    }
    const variable = initializerMatch[1];
    const conditionMatch = condition.match(new RegExp(`^${variable}\\s*<\\s*(\\d+)$`));
    if (!conditionMatch) {
      issues.push('Use a fixed numeric loop limit with the same counter, for example i < 12.');
      continue;
    }
    const escapedVariable = variable.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const incrementPattern = new RegExp(
      `^(?:${escapedVariable}\\+\\+|\\+\\+${escapedVariable}|${escapedVariable}\\s*\\+=\\s*[1-9]\\d*)$`,
    );
    if (!incrementPattern.test(increment)) {
      issues.push('Advance the loop counter with i++, ++i, or i += a positive number.');
    }
    const limit = Number(conditionMatch[1]);
    if (!Number.isFinite(limit) || limit > MAX_CUSTOM_SHADER_LOOP_COUNT) {
      issues.push(`Keep for-loops at ${MAX_CUSTOM_SHADER_LOOP_COUNT} steps or fewer.`);
    }
  }
  return issues;
}

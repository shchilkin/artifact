import type { CustomShaderCodeConfig } from '../types/config';

const MAX_CUSTOM_SHADER_CODE_LENGTH = 12_000;
const MAX_CUSTOM_SHADER_LOOP_COUNT = 64;

export interface CustomShaderCodeIssue {
  severity: 'error' | 'warning';
  message: string;
}

export const DEFAULT_CUSTOM_SHADER_CODE: CustomShaderCodeConfig = {
  version: 1,
  language: 'glsl-fragment',
  code: `vec4 mainImage(vec2 uv) {
  vec4 base = texture2D(u_backdrop, uv);
  vec3 baseColor = mix(vec3(0.035, 0.055, 0.09), base.rgb, u_has_backdrop);
  float wave = sin((uv.x + uv.y) * 42.0 + u_seed * 0.01);
  vec2 warpedUv = uv + vec2(wave, -wave) * 0.012 * u_strength;
  vec4 warped = texture2D(u_backdrop, warpedUv);
  vec3 color = mix(baseColor, warped.rgb, base.a * u_has_backdrop);
  vec3 tint = vec3(0.62, 0.92, 1.0);
  float caustic = pow(max(0.0, sin((uv.x - uv.y) * 60.0 + u_seed * 0.02)), 6.0);
  color = mix(color, color * tint + caustic * 0.18, 0.32 * u_strength);
  return vec4(color, mix(1.0, base.a, u_has_backdrop));
}`,
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
  let match: RegExpExecArray | null;
  while ((match = loopRe.exec(code))) {
    const condition = match[2] ?? '';
    const limitMatch = condition.match(/[<]=?\s*(\d+)/);
    if (!limitMatch) {
      issues.push('Use fixed numeric loop limits, for example for (int i = 0; i < 12; i++).');
      continue;
    }
    const limit = Number(limitMatch[1]);
    if (!Number.isFinite(limit) || limit > MAX_CUSTOM_SHADER_LOOP_COUNT) {
      issues.push(`Keep for-loops at ${MAX_CUSTOM_SHADER_LOOP_COUNT} steps or fewer.`);
    }
  }
  return issues;
}

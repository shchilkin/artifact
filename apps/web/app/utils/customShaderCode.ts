import type { CustomShaderCodeConfig } from '../types/config';

const MAX_CUSTOM_SHADER_CODE_LENGTH = 12_000;

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
    typeof record.code === 'string' && record.code.trim().length > 0
      ? record.code.slice(0, MAX_CUSTOM_SHADER_CODE_LENGTH)
      : DEFAULT_CUSTOM_SHADER_CODE.code;
  return {
    version: 1,
    language: 'glsl-fragment',
    code,
  };
}

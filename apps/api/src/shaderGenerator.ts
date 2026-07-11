import { AI_SHADER_PROMPT_MAX_LENGTH, type ShaderInstance } from './contracts.js';

const LOCAL_SHADER_MODEL = 'deterministic-local-shader';

const LOCAL_SHADER_CODE = `
float artifactNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = fract(sin(dot(i, vec2(127.1, 311.7))) * 43758.5453);
  float b = fract(sin(dot(i + vec2(1.0, 0.0), vec2(127.1, 311.7))) * 43758.5453);
  float c = fract(sin(dot(i + vec2(0.0, 1.0), vec2(127.1, 311.7))) * 43758.5453);
  float d = fract(sin(dot(i + vec2(1.0), vec2(127.1, 311.7))) * 43758.5453);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

vec4 mainImage(vec2 uv) {
  float phase = u_seed * 0.017;
  float scale = max(1.0, u_prop_scale);
  float noiseValue = artifactNoise(uv * scale + phase);
  vec2 flow = vec2(
    sin(uv.y * scale + phase + noiseValue * 2.0),
    cos(uv.x * scale * 0.83 - phase + noiseValue * 1.7)
  );
  vec2 warpedUv = clamp(uv + flow * u_prop_amount * u_strength, 0.0, 1.0);
  vec4 source = texture2D(u_backdrop, warpedUv);
  float shimmer = smoothstep(0.62, 0.98, noiseValue + 0.12 * sin((uv.x + uv.y) * scale));
  vec3 treated = source.rgb + u_prop_tint * shimmer * 0.22 * u_strength;
  treated = mix(u_prop_tint * (0.18 + shimmer * 0.55), treated, u_has_backdrop);
  treated = mix(treated, source.rgb, u_prop_preserve_source * 0.35);
  return vec4(treated, mix(1.0, source.a, u_has_backdrop));
}`.trim();

export function normalizeShaderPrompt(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export function validateShaderPrompt(
  value: unknown,
): { ok: true; prompt: string } | { ok: false; code: string; message: string } {
  const prompt = normalizeShaderPrompt(value);
  if (!prompt) return { ok: false, code: 'invalid_prompt', message: 'Prompt is required.' };
  if (prompt.length < 3) return { ok: false, code: 'invalid_prompt', message: 'Prompt is too short.' };
  if (prompt.length > AI_SHADER_PROMPT_MAX_LENGTH) {
    return {
      ok: false,
      code: 'prompt_too_long',
      message: `Prompt must be ${AI_SHADER_PROMPT_MAX_LENGTH} characters or fewer.`,
    };
  }
  return { ok: true, prompt };
}

export function generateLocalShaderInstanceFromPrompt(prompt: string): ShaderInstance {
  const normalized = normalizeShaderPrompt(prompt);
  const text = normalized.toLowerCase();
  const seed = hashPrompt(text);
  const tint = tintForPrompt(text, seed);
  const amount = round(valueFromSeed(seed, 0.018, 0.075), 3);
  const scale = round(valueFromSeed(seed >>> 5, 4, 18), 1);
  const properties = [
    { key: 'amount', label: 'Distortion', type: 'number' as const, default: amount, min: 0, max: 0.12, step: 0.001 },
    { key: 'scale', label: 'Scale', type: 'number' as const, default: scale, min: 1, max: 24, step: 0.1 },
    { key: 'tint', label: 'Tint', type: 'color' as const, default: tint },
    { key: 'preserve_source', label: 'Preserve source', type: 'boolean' as const, default: true },
  ];
  return {
    definition: {
      version: 1,
      id: `local-${seed.toString(36)}`,
      label: labelForPrompt(text),
      language: 'glsl-fragment',
      code: LOCAL_SHADER_CODE,
      properties,
      provenance: { source: 'localFallback', prompt: normalized, model: LOCAL_SHADER_MODEL },
    },
    values: Object.fromEntries(properties.map((property) => [property.key, property.default])),
  };
}

function tintForPrompt(text: string, seed: number) {
  if (mentions(text, ['ocean', 'water', 'aqua', 'ice', 'cyan'])) return '#4ee5dd';
  if (mentions(text, ['fire', 'lava', 'ember', 'heat', 'sunset'])) return '#ff7145';
  if (mentions(text, ['neon', 'cyber', 'vapor', 'club', 'synth'])) return '#ff4ec7';
  if (mentions(text, ['forest', 'moss', 'lichen', 'plant', 'green'])) return '#80d45a';
  if (mentions(text, ['metal', 'chrome', 'silver', 'steel'])) return '#d7e1eb';
  const colors = ['#7b61ff', '#56f0c6', '#ff9f68', '#2f80ed'];
  return colors[seed % colors.length] ?? '#7b61ff';
}

function labelForPrompt(text: string) {
  if (mentions(text, ['water', 'ocean', 'caustic'])) return 'Local Water Effect';
  if (mentions(text, ['fire', 'lava', 'ember'])) return 'Local Heat Effect';
  if (mentions(text, ['neon', 'cyber'])) return 'Local Neon Effect';
  if (mentions(text, ['glass', 'refract', 'prism'])) return 'Local Glass Effect';
  return 'Local Shader Effect';
}

function mentions(text: string, words: string[]) {
  return words.some((word) => text.includes(word));
}

function hashPrompt(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function valueFromSeed(seed: number, min: number, max: number) {
  const next = Math.imul(seed ^ 0x9e3779b9, 2654435761) >>> 0;
  return min + (next / 0xffffffff) * (max - min);
}

function round(value: number, digits: number) {
  const precision = 10 ** digits;
  return Math.round(value * precision) / precision;
}

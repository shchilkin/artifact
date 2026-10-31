/**
 * Compiles the operation list of a pre-schema-3 AI shader spec into GLSL. Used only by the schema 2 -> 3 migration;
 * the output must stay byte-stable so migrated documents keep rendering the same.
 */
import { isRecord } from './shared';

export function legacyAiShaderSpecToGlsl(spec: Record<string, unknown>, palette: string[]) {
  const operations = Array.isArray(spec.operations)
    ? spec.operations
        .map(normalizeLegacyShaderOperation)
        .filter((operation): operation is Record<string, unknown> => Boolean(operation))
        .slice(0, 12)
    : [];
  const normalizedOperations =
    operations.length > 0
      ? operations
      : [
          { op: 'noise', scale: 3.2, amount: 0.34, octaves: 4, seedOffset: 0 },
          { op: 'wave', frequency: 7.5, amplitude: 0.22, angle: 28, phase: 0 },
          { op: 'swirl', amount: 0.18, radius: 1.25 },
        ];
  const operationCode = normalizedOperations.map(legacyAiShaderOperationToGlsl).filter(Boolean).join('\n  ');
  const colors = palette.length > 0 ? palette : ['#ffffff'];
  return `
float legacyHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7)) + u_seed * 0.017) * 43758.5453);
}
float legacyNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(legacyHash(i), legacyHash(i + vec2(1.0, 0.0)), u.x),
    mix(legacyHash(i + vec2(0.0, 1.0)), legacyHash(i + vec2(1.0)), u.x), u.y);
}
float legacyFbm(vec2 p, float octaves, float seedOffset) {
  float value = 0.0;
  float amplitude = 0.5;
  float normalization = 0.0;
  for (int octave = 0; octave < 7; octave++) {
    if (float(octave) < octaves) {
      value += legacyNoise(p + seedOffset * 0.001 + float(octave) * 0.13) * amplitude;
      normalization += amplitude;
    }
    p *= 2.0;
    amplitude *= 0.5;
  }
  return normalization > 0.0 ? value / normalization : 0.0;
}
float legacyLuma(vec3 color) { return dot(color, vec3(0.2126, 0.7152, 0.0722)); }
float legacySmoothstep(float edge0, float edge1, float value) {
  float normalized = clamp((value - edge0) / (edge1 - edge0), 0.0, 1.0);
  return normalized * normalized * (3.0 - 2.0 * normalized);
}
vec3 legacyPalette(float value) {
  value = clamp(value, 0.0, 0.9999);
  ${legacyPaletteSampler(colors)}
}
vec4 mainImage(vec2 uv) {
  vec4 source = texture2D(u_backdrop, uv);
  vec2 point = (uv * 2.0 - 1.0) * vec2(u_resolution.x / max(1.0, u_resolution.y), 1.0);
  float radius = length(point);
  float angle = atan(point.y, point.x);
  float tone = ${legacyClampedNumber(spec.base, 0, 1, 0.46)};
  float contrast = ${legacyClampedNumber(spec.contrast, 0.1, 4, 1.18)};
  vec3 color = source.rgb;
  float mapped = 0.0;
  ${operationCode}
  vec3 proceduralColor = legacyPalette(clamp((tone - 0.5) * contrast + 0.5, 0.0, 1.0));
  color = mix(color, proceduralColor, mapped > 0.5 ? 0.074 : 0.37);
  return vec4(color, source.a);
}`.trim();
}

function normalizeLegacyShaderOperation(operation: unknown): Record<string, unknown> | null {
  if (!isRecord(operation)) return null;
  switch (operation.op) {
    case 'noise':
      return {
        op: 'noise',
        scale: legacyClamp(operation.scale, 0.1, 40, 3),
        amount: legacyClamp(operation.amount, -2, 2, 0.3),
        octaves: Math.round(legacyClamp(operation.octaves, 1, 7, 4)),
        seedOffset: Math.round(legacyClamp(operation.seedOffset, 0, 9999, 0)),
      };
    case 'wave':
      return {
        op: 'wave',
        frequency: legacyClamp(operation.frequency, 0.1, 80, 8),
        amplitude: legacyClamp(operation.amplitude, -2, 2, 0.2),
        angle: legacyClamp(operation.angle, -360, 360, 0),
        phase: legacyClamp(operation.phase, -Math.PI * 8, Math.PI * 8, 0),
      };
    case 'rings':
      return {
        op: 'rings',
        frequency: legacyClamp(operation.frequency, 0.1, 80, 12),
        amount: legacyClamp(operation.amount, -2, 2, 0.24),
        centerX: legacyClamp(operation.centerX, -1, 1, 0),
        centerY: legacyClamp(operation.centerY, -1, 1, 0),
      };
    case 'swirl':
      return {
        op: 'swirl',
        amount: legacyClamp(operation.amount, -2, 2, 0.2),
        radius: legacyClamp(operation.radius, 0.05, 4, 1.1),
      };
    case 'threshold':
      return {
        op: 'threshold',
        value: legacyClamp(operation.value, 0, 1, 0.5),
        softness: legacyClamp(operation.softness, 0, 1, 0.08),
      };
    case 'posterize':
      return { op: 'posterize', steps: Math.round(legacyClamp(operation.steps, 2, 16, 4)) };
    case 'invert':
      return { op: 'invert', amount: legacyClamp(operation.amount, 0, 1, 1) };
    case 'sourceLuma':
      return { op: 'sourceLuma', amount: legacyClamp(operation.amount, 0, 1, 0.45) };
    case 'edgeGlow':
      return {
        op: 'edgeGlow',
        amount: legacyClamp(operation.amount, 0, 2, 0.35),
        softness: legacyClamp(operation.softness, 0, 1, 0.18),
      };
    case 'chromaticShift':
      return {
        op: 'chromaticShift',
        amount: legacyClamp(operation.amount, 0, 1, 0.24),
        angle: legacyClamp(operation.angle, -360, 360, 0),
      };
    case 'gradientMap':
      return { op: 'gradientMap', amount: legacyClamp(operation.amount, 0, 1, 0.65) };
    default:
      return null;
  }
}

function legacyAiShaderOperationToGlsl(operation: Record<string, unknown>) {
  switch (operation.op) {
    case 'noise':
      return `tone += (legacyFbm(point * ${legacyNumber(operation.scale, 4)}, ${legacyNumber(operation.octaves, 4)}, ${legacyNumber(operation.seedOffset, 0)}) - 0.5) * ${legacyNumber(operation.amount, 0)};`;
    case 'wave': {
      const direction = (legacyFiniteNumber(operation.angle, 0) * Math.PI) / 180;
      return `tone += sin(dot(point, vec2(${Math.cos(direction).toFixed(8)}, ${Math.sin(direction).toFixed(8)})) * ${legacyNumber(operation.frequency, 1)} + ${legacyNumber(operation.phase, 0)}) * ${legacyNumber(operation.amplitude, 0)};`;
    }
    case 'rings':
      return `tone += sin(length(point - vec2(${legacyNumber(operation.centerX, 0)}, ${legacyNumber(operation.centerY, 0)})) * ${legacyNumber(operation.frequency, 1)}) * ${legacyNumber(operation.amount, 0)};`;
    case 'swirl':
      return `tone += sin(angle + radius * max(0.05, ${legacyNumber(operation.radius, 1)}) * 8.0) * ${legacyNumber(operation.amount, 0)} * legacySmoothstep(1.7, 0.02, radius);`;
    case 'threshold':
      return `tone = smoothstep(${legacyNumber(operation.value, 0.5)} - ${legacyNumber(operation.softness, 0.08)}, ${legacyNumber(operation.value, 0.5)} + ${legacyNumber(operation.softness, 0.08)}, tone);`;
    case 'posterize':
      return `tone = floor(clamp(tone, 0.0, 1.0) * (max(2.0, ${legacyNumber(operation.steps, 2)}) - 1.0) + 0.5) / (max(2.0, ${legacyNumber(operation.steps, 2)}) - 1.0);`;
    case 'invert':
      return `tone = mix(tone, 1.0 - tone, ${legacyNumber(operation.amount, 0)});`;
    case 'sourceLuma':
      return `tone = mix(tone, legacyLuma(source.rgb), ${legacyNumber(operation.amount, 0)});`;
    case 'edgeGlow':
      return `{
    vec2 pixel = 1.0 / max(u_resolution, vec2(1.0));
    float horizontal = legacyLuma(texture2D(u_backdrop, uv + vec2(pixel.x, 0.0)).rgb) - legacyLuma(texture2D(u_backdrop, uv - vec2(pixel.x, 0.0)).rgb);
    float vertical = legacyLuma(texture2D(u_backdrop, uv + vec2(0.0, pixel.y)).rgb) - legacyLuma(texture2D(u_backdrop, uv - vec2(0.0, pixel.y)).rgb);
    float edge = smoothstep(${legacyNumber(operation.softness, 0.18)}, 1.0, clamp((abs(horizontal) + abs(vertical)) * 3.0, 0.0, 1.0));
    tone += edge * ${legacyNumber(operation.amount, 0)} * 0.5;
    color += legacyPalette(clamp(tone, 0.0, 1.0)) * edge * ${legacyNumber(operation.amount, 0)} * 0.35;
  }`;
    case 'chromaticShift': {
      const direction = (legacyFiniteNumber(operation.angle, 0) * Math.PI) / 180;
      const amount = legacyFiniteNumber(operation.amount, 0) * 0.028;
      return `{
    float shortSide = min(u_resolution.x, u_resolution.y);
    vec2 shift = vec2(${(Math.cos(direction) * amount).toFixed(8)}, ${(Math.sin(direction) * amount).toFixed(8)}) * shortSide / max(u_resolution, vec2(1.0));
    color.r = texture2D(u_backdrop, clamp(uv + shift, 0.0, 1.0)).r;
    color.b = texture2D(u_backdrop, clamp(uv - shift, 0.0, 1.0)).b;
  }`;
    }
    case 'gradientMap':
      return `color = mix(color, legacyPalette(clamp((tone - 0.5) * contrast + 0.5, 0.0, 1.0)), ${legacyNumber(operation.amount, 0)}); mapped = 1.0;`;
    default:
      return '';
  }
}

function legacyPaletteSampler(palette: string[]) {
  if (palette.length === 1) return `return ${legacyHexToGlsl(palette[0]!)};`;
  const last = palette.length - 1;
  const clauses = palette.slice(0, -1).map((color, index) => {
    const start = index / last;
    const end = (index + 1) / last;
    return `if (value <= ${end.toFixed(8)}) return mix(${legacyHexToGlsl(color)}, ${legacyHexToGlsl(palette[index + 1]!)}, (value - ${start.toFixed(8)}) / ${(end - start).toFixed(8)});`;
  });
  return `${clauses.join('\n  ')}\n  return ${legacyHexToGlsl(palette[last]!)};`;
}

function legacyHexToGlsl(color: string) {
  const value = Number.parseInt(color.replace('#', ''), 16);
  const red = ((value >> 16) & 255) / 255;
  const green = ((value >> 8) & 255) / 255;
  const blue = (value & 255) / 255;
  return `vec3(${red.toFixed(8)}, ${green.toFixed(8)}, ${blue.toFixed(8)})`;
}

function legacyFiniteNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function legacyClamp(value: unknown, min: number, max: number, fallback: number) {
  return Math.min(max, Math.max(min, legacyFiniteNumber(Number(value), fallback)));
}

function legacyClampedNumber(value: unknown, min: number, max: number, fallback: number) {
  return legacyClamp(value, min, max, fallback).toFixed(8);
}

function legacyNumber(value: unknown, fallback: number) {
  return legacyFiniteNumber(value, fallback).toFixed(8);
}

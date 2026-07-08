import { type CustomShaderOperation, type CustomShaderSpec, normalizeCustomShaderSpec } from './contracts.js';

const PROMPT_LIMIT = 500;

export function normalizeShaderPrompt(value: unknown) {
  return typeof value === 'string' ? value.trim().slice(0, PROMPT_LIMIT) : '';
}

export function validateShaderPrompt(
  value: unknown,
): { ok: true; prompt: string } | { ok: false; code: string; message: string } {
  const prompt = normalizeShaderPrompt(value);
  if (!prompt) return { ok: false, code: 'invalid_prompt', message: 'Prompt is required.' };
  if (prompt.length < 3) return { ok: false, code: 'invalid_prompt', message: 'Prompt is too short.' };
  return { ok: true, prompt };
}

export function generateCustomShaderSpecFromPrompt(prompt: string): CustomShaderSpec {
  const normalized = normalizeShaderPrompt(prompt);
  const text = normalized.toLowerCase();
  const seed = hashPrompt(text);
  const operations = operationsForPrompt(text, seed);

  return normalizeCustomShaderSpec({
    version: 1,
    label: labelForPrompt(text),
    prompt: normalized,
    base: valueFromSeed(seed, 0.34, 0.62),
    contrast: valueFromSeed(seed >>> 5, 1.02, 1.42),
    palette: paletteForPrompt(text, seed),
    operations,
  });
}

function operationsForPrompt(text: string, seed: number): CustomShaderOperation[] {
  const operations: CustomShaderOperation[] = [];
  operations.push({
    op: 'noise',
    scale: valueFromSeed(seed, 2.8, 8.8),
    amount: valueFromSeed(seed >>> 3, 0.18, 0.48),
    octaves: 3 + (seed % 3),
    seedOffset: seed % 997,
  });

  if (mentions(text, ['wave', 'waves', 'stripe', 'stripes', 'moire', 'scanline', 'scanlines', 'ripple', 'ripples'])) {
    operations.push({
      op: 'wave',
      frequency: valueFromSeed(seed >>> 1, 6, 22),
      amplitude: valueFromSeed(seed >>> 4, 0.08, 0.32),
      angle: valueFromSeed(seed >>> 7, 0, Math.PI),
      phase: valueFromSeed(seed >>> 9, 0, Math.PI * 2),
    });
  }

  if (mentions(text, ['ring', 'rings', 'radial', 'concentric', 'target', 'orbital', 'halo'])) {
    operations.push({
      op: 'rings',
      frequency: valueFromSeed(seed >>> 2, 5, 24),
      amount: valueFromSeed(seed >>> 8, 0.16, 0.46),
      centerX: valueFromSeed(seed >>> 10, 0.36, 0.64),
      centerY: valueFromSeed(seed >>> 12, 0.36, 0.64),
    });
  }

  if (mentions(text, ['swirl', 'spiral', 'vortex', 'twist', 'liquid', 'marble', 'smoke'])) {
    operations.push({
      op: 'swirl',
      amount: valueFromSeed(seed >>> 6, 0.14, 0.55),
      radius: valueFromSeed(seed >>> 11, 0.42, 0.86),
    });
  }

  if (mentions(text, ['poster', 'posterize', 'block', 'blocks', 'panel', 'panels', 'pixel', 'pixelated'])) {
    operations.push({
      op: 'posterize',
      steps: 3 + (seed % 5),
    });
  }

  if (mentions(text, ['threshold', 'halftone', 'ink', 'xerox', 'photocopy', 'stencil'])) {
    operations.push({
      op: 'threshold',
      value: valueFromSeed(seed >>> 13, 0.34, 0.66),
      softness: valueFromSeed(seed >>> 15, 0.04, 0.18),
    });
  }

  if (mentions(text, ['invert', 'negative', 'xray', 'cyanotype'])) {
    operations.push({
      op: 'invert',
      amount: valueFromSeed(seed >>> 16, 0.4, 1),
    });
  }

  if (mentions(text, ['photo', 'image', 'source', 'input', 'portrait', 'face', 'luma', 'luminance', 'light'])) {
    operations.push({
      op: 'sourceLuma',
      amount: valueFromSeed(seed >>> 17, 0.28, 0.72),
    });
  }

  if (mentions(text, ['edge', 'outline', 'rim', 'glow', 'neon', 'hatching', 'xerox', 'ink'])) {
    operations.push({
      op: 'edgeGlow',
      amount: valueFromSeed(seed >>> 18, 0.22, 0.86),
      softness: valueFromSeed(seed >>> 19, 0.08, 0.32),
    });
  }

  if (mentions(text, ['glass', 'water', 'refract', 'refraction', 'caustic', 'prism', 'chromatic', 'rgb'])) {
    operations.push({
      op: 'chromaticShift',
      amount: valueFromSeed(seed >>> 20, 0.12, 0.46),
      angle: valueFromSeed(seed >>> 21, -90, 90),
    });
  }

  if (mentions(text, ['gradient map', 'duotone', 'map', 'tone map', 'poster', 'cyanotype', 'infrared'])) {
    operations.push({
      op: 'gradientMap',
      amount: valueFromSeed(seed >>> 22, 0.35, 0.86),
    });
  }

  if (operations.length === 1) {
    operations.push({
      op: 'wave',
      frequency: valueFromSeed(seed >>> 1, 4, 12),
      amplitude: valueFromSeed(seed >>> 4, 0.05, 0.16),
      angle: valueFromSeed(seed >>> 7, 0, Math.PI),
    });
  }

  return operations.slice(0, 8);
}

function paletteForPrompt(text: string, seed: number) {
  if (mentions(text, ['ocean', 'water', 'aqua', 'ice', 'cyan'])) return ['#071827', '#0c6b7e', '#4ee5dd', '#f5fff7'];
  if (mentions(text, ['fire', 'lava', 'ember', 'heat', 'sunset'])) return ['#180609', '#9c1d1a', '#ff7145', '#ffe28a'];
  if (mentions(text, ['neon', 'cyber', 'vapor', 'club', 'synth'])) return ['#080816', '#7b61ff', '#ff4ec7', '#55f7d5'];
  if (mentions(text, ['forest', 'moss', 'lichen', 'plant', 'green']))
    return ['#07130d', '#24593c', '#80d45a', '#f0f7bc'];
  if (mentions(text, ['metal', 'chrome', 'silver', 'steel'])) return ['#06070a', '#647080', '#d7e1eb', '#fff9df'];
  if (mentions(text, ['paper', 'cream', 'warm', 'sepia'])) return ['#19100c', '#9b6f52', '#d9b98d', '#fff2d0'];
  if (mentions(text, ['mono', 'black', 'white', 'ink', 'xerox'])) return ['#050505', '#3b3b3b', '#bdbdbd', '#ffffff'];

  const palettes = [
    ['#0d1020', '#7b61ff', '#56f0c6', '#fff1a8'],
    ['#130810', '#e23d6f', '#ff9f68', '#f7f2d4'],
    ['#09141d', '#2f80ed', '#80ffdb', '#fff4b8'],
    ['#140f0b', '#7f5539', '#ddb892', '#f8edeb'],
  ];
  return palettes[seed % palettes.length];
}

function labelForPrompt(text: string) {
  if (mentions(text, ['halftone', 'ink', 'xerox'])) return 'AI Halftone';
  if (mentions(text, ['marble', 'stone'])) return 'AI Marble';
  if (mentions(text, ['spiral', 'vortex'])) return 'AI Spiral';
  if (mentions(text, ['wave', 'ripple'])) return 'AI Waves';
  if (mentions(text, ['neon', 'cyber'])) return 'AI Neon';
  return 'AI Shader Pass';
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

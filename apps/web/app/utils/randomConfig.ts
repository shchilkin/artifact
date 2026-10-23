import type {
  AspectRatio,
  CanvasDocument,
  EffectLayer,
  EffectPreset,
  EmojiLayer,
  GlobalConfig,
  NoiseType,
  TextLayer,
} from '../types/config';
import {
  ALL_EMOJIS,
  DEFAULT_EXPORT,
  DOCUMENT_SCHEMA_VERSION,
  EFFECT_PRESET_MENU_ORDER,
  makeDocument,
  makeEffectPresetLayer,
  makeEmojiLayer,
  makeFillLayer,
  makeImageLayer,
  makeSourceLayer,
  makeTextLayer,
} from '../types/config';
import {
  EFFECT_PRESET_VARIANTS,
  type EffectColorRandom,
  type EffectNumberRandom,
  type EffectParamKey,
  effectParam,
  presetParamKeys,
} from '../types/effectSchema';

type Rng = () => number;

function rand(min: number, max: number, rng: Rng = Math.random): number {
  return Math.round(min + rng() * (max - min));
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * c)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function randomHsl(
  hue: number,
  satRange: [number, number],
  litRange: [number, number],
  rng: Rng = Math.random,
): string {
  return hslToHex(hue, rand(satRange[0], satRange[1], rng), rand(litRange[0], litRange[1], rng));
}

function chance(probability: number, rng: Rng = Math.random): boolean {
  return rng() < probability;
}

function optionalRand(probability: number, min: number, max: number, rng: Rng = Math.random): number {
  return chance(probability, rng) ? rand(min, max, rng) : 0;
}

function pick<T>(items: readonly T[], rng: Rng = Math.random): T {
  return items[rand(0, items.length - 1, rng)];
}

function randPercent(min: number, max: number, rng: Rng = Math.random): number {
  return rand(min * 100, max * 100, rng) / 100;
}

function lcg(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const TEXT_RANDOM_ROLES = ['poster', 'title', 'subtitle', 'label', 'credit'] as const;

type TextRandomRole = (typeof TEXT_RANDOM_ROLES)[number];

interface TextRandomRoleConfig {
  fonts: readonly TextLayer['font'][];
  size: readonly [number, number];
  x: readonly [number, number];
  y: readonly [number, number];
  rotation: readonly [number, number];
  scaleX: readonly [number, number];
  scaleY: readonly [number, number];
  align: readonly TextLayer['align'][];
  blendMode: readonly string[];
  opacity: readonly [number, number];
  content: string;
  name: string;
}

const TEXT_ROLE_CONFIGS: Record<TextRandomRole, TextRandomRoleConfig> = {
  poster: {
    name: 'Poster Type',
    content: 'POSTER',
    fonts: ['BUNGEE', 'ANTON', 'ARCHIVO_BLACK', 'RUBIK_MONO'],
    size: [92, 142],
    x: [0.48, 0.52],
    y: [0.42, 0.58],
    rotation: [-6, 6],
    scaleX: [0.86, 1.08],
    scaleY: [0.78, 0.98],
    align: ['center'],
    blendMode: ['normal', 'screen', 'overlay'],
    opacity: [82, 100],
  },
  title: {
    name: 'Title Type',
    content: 'TITLE',
    fonts: ['ARCHIVO_BLACK', 'DISPLAY', 'BEBAS', 'STAATLICHES', 'ANTON'],
    size: [58, 116],
    x: [0.45, 0.55],
    y: [0.34, 0.58],
    rotation: [-9, 9],
    scaleX: [0.92, 1.14],
    scaleY: [0.84, 1],
    align: ['center'],
    blendMode: ['normal', 'screen', 'overlay', 'multiply'],
    opacity: [78, 100],
  },
  subtitle: {
    name: 'Subtitle',
    content: 'SUBTITLE',
    fonts: ['SPACE_MONO', 'MONO', 'SPECIAL', 'VT323'],
    size: [18, 34],
    x: [0.42, 0.58],
    y: [0.58, 0.74],
    rotation: [-4, 4],
    scaleX: [0.96, 1.08],
    scaleY: [0.96, 1.04],
    align: ['center', 'left'],
    blendMode: ['normal', 'screen', 'overlay'],
    opacity: [70, 100],
  },
  label: {
    name: 'Label Type',
    content: 'LABEL',
    fonts: ['SPECIAL', 'SPACE_MONO', 'VT323', 'PRESS_START'],
    size: [14, 34],
    x: [0.16, 0.84],
    y: [0.14, 0.86],
    rotation: [-13, 13],
    scaleX: [0.94, 1.08],
    scaleY: [0.94, 1.08],
    align: ['left', 'center'],
    blendMode: ['normal', 'screen'],
    opacity: [72, 100],
  },
  credit: {
    name: 'Credits',
    content: 'ARTIST\nTRACK',
    fonts: ['SPACE_MONO', 'MONO', 'VT323'],
    size: [12, 22],
    x: [0.44, 0.56],
    y: [0.78, 0.92],
    rotation: [-2, 2],
    scaleX: [0.96, 1.06],
    scaleY: [0.96, 1.04],
    align: ['center'],
    blendMode: ['normal', 'screen'],
    opacity: [68, 100],
  },
};

export function randomGlobal(baseHue?: number, rng: Rng = Math.random): Omit<GlobalConfig, 'aspect'> {
  const h = baseHue ?? rand(0, 359, rng);
  return {
    bg: randomHsl(h, [20, 55], [3, 14], rng),
    seed: Math.floor(rng() * 999999),
  };
}

export function randomEmojiLayer(rng: Rng = Math.random): EmojiLayer {
  const pool = [...ALL_EMOJIS].sort(() => rng() - 0.5);
  const minSz = rand(10, 50, rng);
  return makeEmojiLayer({
    emojis: pool.slice(0, rand(2, 6, rng)),
    density: rand(15, 70, rng),
    minSz,
    maxSz: rand(Math.max(minSz + 10, 40), 130, rng),
    blur: 0,
  });
}

export function randomEffectLayer(baseHue?: number): EffectLayer {
  const baseHueValue = baseHue ?? rand(0, 359);
  const preset = ALL_PRESETS[Math.floor(Math.random() * ALL_PRESETS.length)];
  return randomEffectPresetLayer(preset, baseHueValue);
}

function randomTextPatch(
  role: TextRandomRole,
  baseHue: number,
  layer?: TextLayer,
  rng: Rng = Math.random,
): Partial<TextLayer> {
  const config = TEXT_ROLE_CONFIGS[role];
  const accentHue = (baseHue + rand(130, 230, rng)) % 360;
  const isSmallText = role === 'subtitle' || role === 'label' || role === 'credit';
  const color = isSmallText
    ? randomHsl(accentHue, [45, 95], [58, 88], rng)
    : rng() < 0.72
      ? randomHsl(accentHue, [8, 32], [76, 96], rng)
      : randomHsl(accentHue, [60, 100], [58, 82], rng);

  return {
    name: layer?.name || config.name,
    content: layer?.content?.trim() ? layer.content : config.content,
    font: pick(config.fonts, rng),
    size: rand(config.size[0], config.size[1], rng),
    color,
    opacity: rand(config.opacity[0], config.opacity[1], rng),
    rotation: rand(config.rotation[0], config.rotation[1], rng),
    align: pick(config.align, rng),
    blendMode: pick(config.blendMode, rng),
    x: randPercent(config.x[0], config.x[1], rng),
    y: randPercent(config.y[0], config.y[1], rng),
    scaleX: randPercent(config.scaleX[0], config.scaleX[1], rng),
    scaleY: randPercent(config.scaleY[0], config.scaleY[1], rng),
  };
}

export function randomTextLayer(baseHue?: number, role?: TextRandomRole, rng: Rng = Math.random): TextLayer {
  const baseHueValue = baseHue ?? rand(0, 359, rng);
  const textRole = role ?? pick(TEXT_RANDOM_ROLES, rng);
  return makeTextLayer(randomTextPatch(textRole, baseHueValue, undefined, rng));
}

const ALL_PRESETS: EffectPreset[] = EFFECT_PRESET_MENU_ORDER;
const ALL_ASPECTS: AspectRatio[] = ['1:1', '4:5', '9:16', '16:9'];
const SAMPLE_IMAGE_SRC = '/girl_image_landing.png';

export const RANDOM_FORMULA_IDS = ['imagePoster', 'typePoster', 'texturePlate', 'printDamage'] as const;
export type RandomFormulaId = (typeof RANDOM_FORMULA_IDS)[number];

const POSTER_TITLES = [
  'AFTER\nIMAGE',
  'TYPE\nMIX',
  'STATIC\nFIELD',
  'NOISE\nPOSTER',
  'SOURCE\nFIRST',
  'PRINT\nDAMAGE',
  'LOW\nLIGHT',
  'SIGNAL\nROOM',
] as const;

const SUBTITLE_LINES = [
  'ALPHA / PRINT / SOURCE',
  'LOCAL PROJECT / RASTER EXPORT',
  'FIELD NOTES / VERSION TWO',
  'ARCHIVE / TYPE / DAMAGE',
  'OPEN / CHANGE / EXPORT',
  'SOURCE MATERIAL STUDY',
] as const;

const LABEL_LINES = ['V0.29', 'CAT-420', 'FRIDAY 23:00', 'NO. 014', 'ARTIFACT PRESS', 'LOCAL FIRST'] as const;

function formulaFx(preset: EffectPreset, name: string, value: number, partial: Partial<EffectLayer> = {}): EffectLayer {
  return {
    ...makeEffectPresetLayer(preset, { value }),
    name,
    ...partial,
  };
}

function formulaText(rng: Rng, baseHue: number, role: TextRandomRole, partial: Partial<TextLayer> = {}): TextLayer {
  return makeTextLayer({
    ...randomTextPatch(role, baseHue, undefined, rng),
    ...partial,
  });
}

function randomPlateColor(baseHue: number, rng: Rng): string {
  return randomHsl(baseHue, [22, 54], [4, 12], rng);
}

function buildImagePosterFormula(rng: Rng, baseHue: number): CanvasDocument['layers'] {
  const accentHue = (baseHue + rand(135, 220, rng)) % 360;
  return [
    makeFillLayer({ name: 'ink plate', color: randomPlateColor(baseHue, rng) }),
    makeImageLayer(SAMPLE_IMAGE_SRC, {
      name: 'source photo',
      opacity: rand(58, 88, rng),
      scaleX: randPercent(1, 1.16, rng),
      scaleY: randPercent(1, 1.16, rng),
      rotation: rand(-4, 4, rng),
    }),
    formulaFx('duotone', 'photo wash', rand(22, 58, rng), {
      duoA: randomHsl(baseHue, [24, 48], [3, 10], rng),
      duoB: randomHsl(accentHue, [42, 82], [55, 82], rng),
    }),
    formulaText(rng, baseHue, 'poster', {
      content: pick(POSTER_TITLES, rng),
      y: randPercent(0.36, 0.52, rng),
      color: randomHsl(accentHue, [8, 28], [82, 96], rng),
    }),
    formulaText(rng, baseHue, 'subtitle', {
      content: pick(SUBTITLE_LINES, rng),
      y: randPercent(0.64, 0.78, rng),
    }),
    formulaFx('risoShift', 'registration slip', rand(8, 18, rng), { risoAngle: rand(0, 360, rng) }),
    formulaFx('grain', 'print grain', rand(16, 32, rng)),
  ];
}

function buildTypePosterFormula(rng: Rng, baseHue: number): CanvasDocument['layers'] {
  const accentHue = (baseHue + rand(120, 240, rng)) % 360;
  return [
    makeFillLayer({ name: 'flat plate', color: randomPlateColor(baseHue, rng) }),
    makeSourceLayer('noise', {
      name: 'paper field',
      // 'paper' and 'static' were never valid NoiseTypes and rendered as clouds; keep the
      // same entry count so seeded documents draw the same RNG sequence.
      noiseType: pick<NoiseType>(['clouds', 'clouds', 'clouds'], rng),
      noiseScale: rand(18, 44, rng),
      noiseDetail: rand(3, 7, rng),
      noiseContrast: rand(46, 70, rng),
      noiseBalance: rand(36, 55, rng),
      color: randomHsl(baseHue, [24, 52], [8, 18], rng),
      accentColor: randomHsl(accentHue, [50, 86], [48, 76], rng),
      opacity: rand(18, 44, rng),
      blendMode: pick(['screen', 'overlay'], rng),
    }),
    formulaText(rng, baseHue, 'poster', {
      content: pick(POSTER_TITLES, rng),
      y: randPercent(0.38, 0.56, rng),
      scaleX: randPercent(0.82, 1.12, rng),
      scaleY: randPercent(0.72, 0.96, rng),
      color: randomHsl(accentHue, [8, 28], [82, 96], rng),
      blendMode: pick(['normal', 'screen'], rng),
      opacity: rand(88, 100, rng),
    }),
    formulaText(rng, baseHue, 'label', {
      content: pick(LABEL_LINES, rng),
      x: randPercent(0.14, 0.28, rng),
      y: randPercent(0.12, 0.26, rng),
    }),
    formulaText(rng, baseHue, 'credit', {
      content: pick(SUBTITLE_LINES, rng),
      y: randPercent(0.78, 0.9, rng),
    }),
    formulaFx('scanlines', 'print bands', rand(6, 18, rng), { scanlineWidth: rand(1, 3, rng) }),
    formulaFx('grain', 'paper tooth', rand(12, 28, rng)),
  ];
}

function buildTexturePlateFormula(rng: Rng, baseHue: number): CanvasDocument['layers'] {
  const accentHue = (baseHue + rand(100, 230, rng)) % 360;
  const surfacePreset = pick(['dither', 'halftone', 'scanlines'] as const, rng);
  const surfaceValue =
    surfacePreset === 'scanlines'
      ? rand(6, 18, rng)
      : surfacePreset === 'halftone'
        ? rand(6, 16, rng)
        : rand(18, 38, rng);
  return [
    makeFillLayer({ name: 'base plate', color: randomPlateColor(baseHue, rng) }),
    makeSourceLayer('noise', {
      name: 'source texture',
      // 'paper' and 'static' were never valid NoiseTypes and rendered as clouds; keep the
      // same entry count so seeded documents draw the same RNG sequence.
      noiseType: pick<NoiseType>(['cells', 'clouds', 'clouds', 'clouds'], rng),
      noiseScale: rand(12, 56, rng),
      noiseDetail: rand(4, 8, rng),
      noiseContrast: rand(58, 82, rng),
      noiseBalance: rand(34, 58, rng),
      noiseWarp: rand(10, 34, rng),
      noiseTurbulence: rand(8, 34, rng),
      color: randomHsl(baseHue, [28, 60], [5, 18], rng),
      accentColor: randomHsl(accentHue, [58, 96], [45, 78], rng),
      opacity: rand(74, 96, rng),
      blendMode: 'screen',
    }),
    formulaFx('gradientOverlay', 'tone map', rand(24, 52, rng), {
      gradA: randomHsl(baseHue, [30, 60], [4, 14], rng),
      gradB: randomHsl(accentHue, [55, 92], [52, 78], rng),
      gradAngle: rand(0, 360, rng),
    }),
    formulaFx(surfacePreset, 'print surface', surfaceValue),
    formulaFx('grain', 'finish grain', rand(14, 30, rng)),
  ];
}

function buildPrintDamageFormula(rng: Rng, baseHue: number): CanvasDocument['layers'] {
  const accentHue = (baseHue + rand(135, 230, rng)) % 360;
  return [
    makeFillLayer({ name: 'aged plate', color: randomPlateColor(baseHue, rng) }),
    rng() < 0.56
      ? makeImageLayer(SAMPLE_IMAGE_SRC, {
          name: 'damaged photo',
          opacity: rand(28, 58, rng),
          blendMode: pick(['normal', 'screen', 'overlay'], rng),
          scaleX: randPercent(1.02, 1.2, rng),
          scaleY: randPercent(1.02, 1.2, rng),
        })
      : makeEmojiLayer({
          name: 'source debris',
          emojis: ['✦', '●', '■', '◆', '▦'],
          density: rand(18, 40, rng),
          minSz: rand(12, 28, rng),
          maxSz: rand(42, 82, rng),
          blur: rand(20, 54, rng),
          opacity: rand(44, 78, rng),
        }),
    formulaText(rng, baseHue, 'title', {
      content: pick(POSTER_TITLES, rng),
      color: randomHsl(accentHue, [8, 28], [78, 95], rng),
      y: randPercent(0.42, 0.6, rng),
    }),
    formulaFx('halftone', 'screen dots', rand(7, 18, rng)),
    formulaFx('scanlines', 'press bands', rand(8, 22, rng), { scanlineWidth: rand(1, 3, rng) }),
    formulaFx('risoShift', 'loose registration', rand(8, 18, rng), { risoAngle: rand(0, 360, rng) }),
    formulaFx('grain', 'dust pass', rand(18, 36, rng)),
    formulaFx('vignette', 'edge pressure', rand(22, 58, rng)),
  ];
}

function buildFormulaLayers(formula: RandomFormulaId, rng: Rng, baseHue: number): CanvasDocument['layers'] {
  switch (formula) {
    case 'imagePoster':
      return buildImagePosterFormula(rng, baseHue);
    case 'typePoster':
      return buildTypePosterFormula(rng, baseHue);
    case 'texturePlate':
      return buildTexturePlateFormula(rng, baseHue);
    case 'printDamage':
      return buildPrintDamageFormula(rng, baseHue);
  }
}

export function randomDocumentForFormula(
  formula: RandomFormulaId,
  seed = Math.floor(Math.random() * 999999),
): CanvasDocument {
  const rng = lcg(seed);
  const baseHue = rand(0, 359, rng);
  const aspect = pick(ALL_ASPECTS, rng);
  const layers = buildFormulaLayers(formula, rng, baseHue).map((layer, index) => ({
    ...layer,
    id: `random-${formula}-${seed}-${index}`,
  }));
  return makeDocument({
    schemaVersion: DOCUMENT_SCHEMA_VERSION,
    global: { bg: randomPlateColor(baseHue, rng), seed, aspect },
    layers,
    export: { ...DEFAULT_EXPORT },
  });
}

export function randomDocumentFromSeed(seed: number): CanvasDocument {
  const rng = lcg(seed);
  const formula = pick(RANDOM_FORMULA_IDS, rng);
  return randomDocumentForFormula(formula, seed);
}

type EffectRandomSpec = EffectNumberRandom | EffectColorRandom;

/** Randomizer ranges of a preset: its shown parameters' own `random`, then the preset variant's overrides. */
function presetRandomSpecs(preset: EffectPreset): [EffectParamKey, EffectRandomSpec][] {
  const specs = new Map<EffectParamKey, EffectRandomSpec>();
  for (const key of presetParamKeys(preset)) {
    const { random } = effectParam(key);
    if (random) specs.set(key, random);
  }
  for (const [key, random] of Object.entries(EFFECT_PRESET_VARIANTS[preset]?.random ?? {})) {
    specs.set(key as EffectParamKey, random);
  }
  return [...specs];
}

function randomEffectValue(spec: EffectRandomSpec, baseHue: number, accentHue: number): number | string {
  if ('hue' in spec) {
    const hue = spec.hue === 'base' ? baseHue : spec.hue === 'accent' ? accentHue : rand(0, 359);
    return randomHsl(
      (hue + (spec.hueOffset ?? 0)) % 360,
      [spec.saturation[0], spec.saturation[1]],
      [spec.lightness[0], spec.lightness[1]],
    );
  }
  if ('pick' in spec) return pick(spec.pick);
  if ('chance' in spec) return optionalRand(spec.chance, spec.range[0], spec.range[1]);
  return rand(spec[0], spec[1]);
}

/** Random values for a preset's parameters, from the schema's randomizer ranges. */
export function randomEffectPresetPatch(
  preset: EffectPreset,
  baseHue: number,
  accentHue: number,
): Partial<EffectLayer> {
  return Object.fromEntries(
    presetRandomSpecs(preset).map(([key, spec]) => [key, randomEffectValue(spec, baseHue, accentHue)]),
  ) as Partial<EffectLayer>;
}

function randomEffectPresetLayer(preset: EffectPreset, baseHue: number): EffectLayer {
  const base = makeEffectPresetLayer(preset);
  const ah = (baseHue + rand(120, 240)) % 360;
  return { ...base, ...randomEffectPresetPatch(preset, baseHue, ah) };
}

export function randomDocument(): CanvasDocument {
  const seed = Math.floor(Math.random() * 999999);
  const formula = pick(RANDOM_FORMULA_IDS);
  return randomDocumentForFormula(formula, seed);
}

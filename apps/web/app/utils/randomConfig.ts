import type {
  AspectRatio,
  CanvasDocument,
  EffectLayer,
  EffectPreset,
  EmojiLayer,
  GlobalConfig,
  TextLayer,
} from '../types/config';
import {
  ALL_EMOJIS,
  DEFAULT_EXPORT,
  DOCUMENT_SCHEMA_VERSION,
  EFFECT_PRESET_MENU_ORDER,
  makeEffectPresetLayer,
  makeEmojiLayer,
  makeFillLayer,
  makeImageLayer,
  makeSourceLayer,
  makeTextLayer,
} from '../types/config';

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

function spark(rng: Rng = Math.random): boolean {
  return rng() < 0.4;
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

const TEXT_ROLE_MARKERS: { role: TextRandomRole; markers: readonly string[] }[] = [
  { role: 'poster', markers: ['poster'] },
  { role: 'credit', markers: ['credit', 'artist', 'track'] },
  { role: 'subtitle', markers: ['subtitle'] },
  { role: 'label', markers: ['label'] },
  { role: 'title', markers: ['title'] },
];

function inferTextRandomRole(layer?: TextLayer): TextRandomRole {
  const marker = `${layer?.name ?? ''} ${layer?.content ?? ''}`.toLowerCase();
  return (
    TEXT_ROLE_MARKERS.find((config) => config.markers.some((term) => marker.includes(term)))?.role ??
    pick(TEXT_RANDOM_ROLES)
  );
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
      noiseType: pick(['paper', 'clouds', 'static'], rng),
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
      noiseType: pick(['cells', 'clouds', 'paper', 'static'], rng),
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
  return {
    schemaVersion: DOCUMENT_SCHEMA_VERSION,
    global: { bg: randomPlateColor(baseHue, rng), seed, aspect },
    layers,
    export: { ...DEFAULT_EXPORT },
  };
}

export function randomDocumentFromSeed(seed: number): CanvasDocument {
  const rng = lcg(seed);
  const formula = pick(RANDOM_FORMULA_IDS, rng);
  return randomDocumentForFormula(formula, seed);
}

type EffectPresetRandomizer = (baseHue: number, accentHue: number) => Partial<EffectLayer>;

const EFFECT_PRESET_RANDOMIZERS: Partial<Record<EffectPreset, EffectPresetRandomizer>> = {
  rays: (_baseHue, ah) => ({
    rays: rand(4, 48),
    rayInt: rand(20, 90),
    rayColor: randomHsl(ah, [70, 100], [55, 80]),
  }),
  bloom: () => ({ bloom: rand(15, 80) }),
  filmBurn: () => ({ filmBurn: rand(20, 90) }),
  glitch: () => ({ glitch: rand(0, 18) }),
  rgbSplit: () => ({ rgbSplit: rand(0, 12) }),
  interlace: () => ({ interlace: rand(10, 70) }),
  dataMosh: () => ({ dataMosh: rand(10, 70) }),
  grain: () => ({ grain: rand(8, 42) }),
  dotGrain: () => ({
    dotGrain: rand(45, 90),
    dotGrainSize: rand(2, 7),
    dotGrainDensity: rand(40, 85),
    dotGrainJitter: rand(20, 75),
  }),
  scanlines: () => ({ scanlines: rand(5, 80), scanlineWidth: rand(1, 4) }),
  tint: () => ({ tint: randomHsl(rand(0, 359), [40, 80], [10, 28]), tintOp: rand(15, 65) }),
  noiseWarp: () => ({ noiseWarp: rand(10, 70) }),
  morph: () => ({ morphAmt: rand(10, 80), morphFreq: rand(1, 15) }),
  vortex: () => ({ vortex: rand(5, 60) }),
  barrel: () => ({ barrel: rand(5, 70) }),
  tear: () => ({ tearAmt: rand(1, 15), tearSize: rand(1, 12) }),
  mirror: () => ({ mirror: rand(1, 3) }),
  hueShift: () => ({ hueShift: rand(10, 350) }),
  vignette: () => ({ vignette: rand(0, 80) }),
  retroResolution: () => ({ retroResolution: pick([160, 240, 320, 512]) }),
  pixelate: () => ({ pixelate: rand(2, 10) }),
  posterize: () => ({ posterize: rand(3, 12) }),
  indexedPalette: () => ({
    indexedPalette: rand(65, 100),
    indexedPaletteCount: rand(3, 6),
  }),
  duotone: (baseHue, ah) => ({
    duotone: rand(40, 90),
    duoA: randomHsl(baseHue, [30, 60], [3, 12]),
    duoB: randomHsl(ah, [60, 100], [55, 85]),
  }),
  halftone: () => ({ halftone: rand(5, 20) }),
  risoShift: () => ({ risoShift: rand(4, 18), risoAngle: rand(0, 360) }),
  blur: () => ({ blurAmt: rand(10, 70) }),
  threshold: () => ({ threshold: rand(30, 70) }),
  edgeCrush: () => ({ edgeCrush: rand(35, 85) }),
  edgeDetect: () => ({ edgeDetect: rand(40, 90) }),
  gradientOverlay: (baseHue, ah) => ({
    gradMix: rand(30, 80),
    gradA: randomHsl(baseHue, [40, 80], [10, 30]),
    gradB: randomHsl(ah, [60, 100], [55, 85]),
    gradAngle: rand(0, 360),
  }),
  sepia: () => ({ sepia: rand(40, 90) }),
  neonGlow: (_baseHue, ah) => ({ neonGlow: rand(25, 80), neonColor: randomHsl(ah, [80, 100], [50, 80]) }),
  zoomBlur: () => ({ zoomBlur: rand(15, 65) }),
  vhsTracking: () => ({ vhsTracking: rand(10, 60) }),
  dither: () => ({ dither: rand(18, 54) }),
  infrared: () => ({ infrared: rand(40, 90) }),
  ca: () => ({ ca: rand(5, 25) }),
  wave: () => ({ waveAmt: rand(8, 45), waveFreq: rand(1, 8) }),
  matte: () => ({ matte: rand(15, 65) }),
  overprint: () => ({ overprint: rand(10, 55) }),
  solarize: () => ({ solarize: rand(30, 80) }),
  bleachBypass: () => ({ bleachBypass: rand(20, 70) }),
  cyanotype: () => ({ cyanotype: rand(20, 80) }),
  splitTone: () => ({ splitToneAmt: rand(20, 70) }),
  ripple: () => ({ rippleAmt: rand(10, 60), rippleFreq: rand(1, 8) }),
  kaleidoscope: () => ({ kaleidoscope: rand(20, 80) }),
  squeeze: () => ({ squeezeX: spark() ? rand(-60, 60) : 0, squeezeY: spark() ? rand(-60, 60) : 0 }),
  emboss: () => ({ emboss: rand(20, 80) }),
  linocut: () => ({ linocut: rand(20, 80) }),
  fog: () => ({ fog: rand(20, 70) }),
  speedLines: () => ({ speedLines: rand(10, 80) }),
};

function randomEffectPresetLayer(preset: EffectPreset, baseHue: number): EffectLayer {
  const base = makeEffectPresetLayer(preset);
  const ah = (baseHue + rand(120, 240)) % 360;
  const overrides = EFFECT_PRESET_RANDOMIZERS[preset]?.(baseHue, ah) ?? {};
  return { ...base, ...overrides };
}

export function randomDocument(): CanvasDocument {
  const seed = Math.floor(Math.random() * 999999);
  const formula = pick(RANDOM_FORMULA_IDS);
  return randomDocumentForFormula(formula, seed);
}

export function randomLayerSection(layer: EmojiLayer, section: 'EMOJIS'): Partial<EmojiLayer>;
export function randomLayerSection(layer: EffectLayer, section: string): Partial<EffectLayer>;
export function randomLayerSection(layer: TextLayer, section: 'TEXT'): Partial<TextLayer>;
type RandomLayerSectionFactory = (layer: unknown, h: number, accentHue: number) => Partial<unknown>;

function randomEmojiSection(): Partial<EmojiLayer> {
  const pool = [...ALL_EMOJIS].sort(() => Math.random() - 0.5);
  const minSz = rand(10, 50);
  return {
    emojis: pool.slice(0, rand(2, 6)),
    density: rand(15, 70),
    minSz,
    maxSz: rand(Math.max(minSz + 10, 40), 130),
    blur: 0,
  };
}

const RANDOM_LAYER_SECTION_FACTORIES: Record<string, RandomLayerSectionFactory> = {
  EMOJIS: () => randomEmojiSection(),
  RAYS: (_layer, _h, ah) => ({
    rays: rand(4, 48),
    rayInt: rand(20, 90),
    rayColor: randomHsl(ah, [70, 100], [55, 80]),
    bloom: optionalRand(0.4, 15, 80),
    filmBurn: optionalRand(0.4, 20, 90),
    neonGlow: optionalRand(0.3, 20, 70),
    neonColor: randomHsl(ah, [80, 100], [50, 80]),
    fog: optionalRand(0.2, 20, 70),
    speedLines: optionalRand(0.15, 10, 80),
  }),
  GLITCH: () => ({
    glitch: rand(0, 18),
    rgbSplit: rand(0, 12),
    ca: optionalRand(0.4, 3, 20),
    interlace: optionalRand(0.4, 10, 70),
    dataMosh: optionalRand(0.4, 10, 70),
    vhsTracking: optionalRand(0.4, 10, 55),
  }),
  TEXTURE: () => ({
    grain: rand(0, 42),
    dotGrain: optionalRand(0.25, 35, 85),
    dotGrainSize: rand(2, 7),
    dotGrainDensity: rand(35, 85),
    dotGrainJitter: rand(15, 75),
    scanlines: rand(0, 80),
    scanlineWidth: rand(1, 4),
    blurAmt: optionalRand(0.4, 0, 60),
    matte: optionalRand(0.35, 10, 60),
    dither: optionalRand(0.25, 15, 50),
    emboss: optionalRand(0.2, 20, 80),
    linocut: optionalRand(0.2, 20, 80),
  }),
  TINT: () => ({ tint: randomHsl(rand(0, 359), [40, 80], [10, 28]), tintOp: rand(0, 60) }),
  WARP: () => ({
    morphAmt: optionalRand(0.4, 10, 80),
    morphFreq: rand(1, 15),
    tearAmt: optionalRand(0.4, 1, 15),
    tearSize: rand(1, 12),
    noiseWarp: optionalRand(0.4, 10, 70),
    vortex: optionalRand(0.4, 5, 60),
    barrel: optionalRand(0.4, 5, 70),
    mirror: optionalRand(0.4, 1, 3),
    waveAmt: optionalRand(0.3, 5, 40),
    waveFreq: rand(1, 8),
    zoomBlur: optionalRand(0.2, 10, 55),
    rippleAmt: optionalRand(0.2, 10, 60),
    rippleFreq: rand(1, 8),
    kaleidoscope: optionalRand(0.15, 20, 80),
    squeezeX: optionalRand(0.4, -60, 60),
    squeezeY: optionalRand(0.4, -60, 60),
  }),
  COLORFX: () => ({
    hueShift: optionalRand(0.4, 10, 350),
    rgbSplit: optionalRand(0.4, 3, 25),
    vignette: rand(0, 80),
    retroResolution: optionalRand(0.25, 160, 512),
    pixelate: optionalRand(0.4, 2, 10),
    posterize: optionalRand(0.4, 3, 12),
    indexedPalette: optionalRand(0.25, 50, 100),
    indexedPaletteCount: rand(3, 6),
    threshold: optionalRand(0.2, 30, 70),
    edgeCrush: optionalRand(0.2, 30, 80),
    edgeDetect: optionalRand(0.2, 30, 80),
    gradMix: optionalRand(0.25, 30, 70),
    sepia: optionalRand(0.2, 20, 80),
    infrared: optionalRand(0.15, 30, 80),
    solarize: optionalRand(0.15, 30, 80),
    bleachBypass: optionalRand(0.15, 20, 70),
    cyanotype: optionalRand(0.15, 20, 80),
    splitToneAmt: optionalRand(0.15, 20, 70),
  }),
  RISO: (_layer, h, ah) => ({
    duotone: optionalRand(0.5, 40, 90),
    duoA: randomHsl(h, [30, 60], [3, 12]),
    duoB: randomHsl(ah, [60, 100], [55, 85]),
    halftone: optionalRand(0.5, 5, 20),
    risoShift: optionalRand(0.5, 4, 18),
    risoAngle: rand(0, 360),
    overprint: optionalRand(0.3, 10, 55),
  }),
  TEXT: (layer, h) => randomTextPatch(inferTextRandomRole(layer as TextLayer), h, layer as TextLayer),
};

export function randomLayerSection(layer: unknown, section: string): Partial<unknown> {
  const h = rand(0, 359);
  const ah = (h + rand(120, 240)) % 360;
  return RANDOM_LAYER_SECTION_FACTORIES[section]?.(layer, h, ah) ?? ((layer ?? {}) as Partial<unknown>);
}

export function zeroLayerSection(section: string): Partial<EffectLayer> | Partial<EmojiLayer> | Partial<TextLayer> {
  switch (section) {
    case 'EMOJIS':
      return { density: 0, blur: 0 };
    case 'RAYS':
      return {
        rays: 0,
        rayInt: 0,
        rayColor: '#bb00ff',
        bloom: 0,
        filmBurn: 0,
        neonGlow: 0,
        neonColor: '#ff00ff',
        fog: 0,
        fogColor: '#c8d8e8',
        speedLines: 0,
      };
    case 'GLITCH':
      return { glitch: 0, rgbSplit: 0, ca: 0, interlace: 0, dataMosh: 0, vhsTracking: 0 };
    case 'TEXTURE':
      return {
        grain: 0,
        dotGrain: 0,
        dotGrainSize: 4,
        dotGrainDensity: 62,
        dotGrainJitter: 35,
        scanlines: 0,
        scanlineWidth: 1,
        blurAmt: 0,
        matte: 0,
        dither: 0,
        emboss: 0,
        linocut: 0,
      };
    case 'TINT':
      return { tint: '#350055', tintOp: 0 };
    case 'WARP':
      return {
        morphAmt: 0,
        morphFreq: 5,
        tearAmt: 0,
        tearSize: 3,
        noiseWarp: 0,
        vortex: 0,
        barrel: 0,
        mirror: 0,
        waveAmt: 0,
        waveFreq: 3,
        zoomBlur: 0,
        rippleAmt: 0,
        rippleFreq: 3,
        kaleidoscope: 0,
        squeezeX: 0,
        squeezeY: 0,
      };
    case 'COLORFX':
      return {
        hueShift: 0,
        rgbSplit: 0,
        vignette: 0,
        retroResolution: 0,
        pixelate: 0,
        posterize: 0,
        indexedPalette: 0,
        indexedPaletteCount: 6,
        indexedColorA: '#12002b',
        indexedColorB: '#3b1590',
        indexedColorC: '#d400b8',
        indexedColorD: '#ff1d1d',
        indexedColorE: '#f6c400',
        indexedColorF: '#fff1df',
        threshold: 0,
        edgeCrush: 0,
        edgeDetect: 0,
        gradMix: 0,
        gradA: '#0a0020',
        gradB: '#ff6ec7',
        gradAngle: 0,
        sepia: 0,
        infrared: 0,
        solarize: 0,
        bleachBypass: 0,
        cyanotype: 0,
        splitToneAmt: 0,
        splitShadow: '#001a4f',
        splitHighlight: '#ff8040',
      };
    case 'RISO':
      return { duotone: 0, duoA: '#0a0020', duoB: '#ff6ec7', halftone: 0, risoShift: 0, risoAngle: 15, overprint: 0 };
    case 'TEXT':
      return { content: '', opacity: 100, rotation: 0, x: 0.5, y: 0.5, scaleX: 1, scaleY: 1 };
    default:
      return {};
  }
}

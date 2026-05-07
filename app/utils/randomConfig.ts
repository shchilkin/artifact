import type {
  AspectRatio,
  CanvasDocument,
  EffectLayer,
  EffectPreset,
  EmojiLayer,
  GlobalConfig,
  TextLayer,
} from '../types/config';
import { ALL_EMOJIS, DEFAULT_EXPORT, EFFECT_PRESET_MENU_ORDER, makeEffectLayer, makeEffectPresetLayer, makeEmojiLayer } from '../types/config';

function rand(min: number, max: number): number {
  return Math.round(min + Math.random() * (max - min));
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * c).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function randomHsl(hue: number, satRange: [number, number], litRange: [number, number]): string {
  return hslToHex(hue, rand(...satRange), rand(...litRange));
}

function spark(): boolean {
  return Math.random() < 0.4;
}

const TEXT_ALIGNS = ['left', 'center', 'right'] as const;
const TEXT_BLENDS = ['normal', 'screen', 'overlay', 'multiply'] as const;

export function randomGlobal(baseHue?: number): Omit<GlobalConfig, 'aspect'> {
  const h = baseHue ?? rand(0, 359);
  return {
    bg: randomHsl(h, [20, 55], [3, 14]),
    seed: Math.floor(Math.random() * 999999),
  };
}

export function randomEmojiLayer(): EmojiLayer {
  const pool = [...ALL_EMOJIS].sort(() => Math.random() - 0.5);
  const minSz = rand(10, 50);
  return makeEmojiLayer({
    emojis: pool.slice(0, rand(2, 6)),
    density: rand(15, 70),
    minSz,
    maxSz: rand(Math.max(minSz + 10, 40), 130),
    blur: rand(0, 80),
  });
}

export function randomEffectLayer(baseHue?: number): EffectLayer {
  const h = baseHue ?? rand(0, 359);
  const ah = (h + rand(120, 240)) % 360;
  return makeEffectLayer({
    grain: rand(0, 60),
    scanlines: rand(0, 40),
    ca: rand(0, 12),
    glitch: rand(0, 18),
    tint: randomHsl(rand(0, 359), [40, 80], [10, 28]),
    tintOp: rand(0, 60),
    rays: rand(4, 24),
    rayInt: rand(20, 90),
    rayColor: randomHsl(ah, [70, 100], [55, 80]),
    morphAmt: spark() ? rand(10, 80) : 0,
    morphFreq: rand(1, 15),
    tearAmt: spark() ? rand(1, 15) : 0,
    tearSize: rand(1, 12),
    noiseWarp: spark() ? rand(10, 70) : 0,
    vortex: spark() ? rand(5, 60) : 0,
    barrel: spark() ? rand(5, 70) : 0,
    mirror: spark() ? rand(1, 3) : 0,
    dataMosh: spark() ? rand(10, 70) : 0,
    interlace: spark() ? rand(10, 70) : 0,
    pixelate: spark() ? rand(2, 15) : 0,
    hueShift: spark() ? rand(10, 350) : 0,
    rgbSplit: spark() ? rand(3, 25) : 0,
    vignette: rand(0, 80),
    bloom: spark() ? rand(15, 80) : 0,
    posterize: spark() ? rand(3, 12) : 0,
    filmBurn: spark() ? rand(20, 90) : 0,
    duotone: Math.random() < 0.3 ? rand(40, 90) : 0,
    duoA: randomHsl(h, [30, 60], [3, 12]),
    duoB: randomHsl(ah, [60, 100], [55, 85]),
    halftone: Math.random() < 0.3 ? rand(5, 20) : 0,
    risoShift: Math.random() < 0.3 ? rand(5, 30) : 0,
    risoAngle: rand(0, 360),
  });
}

const ALL_PRESETS: EffectPreset[] = EFFECT_PRESET_MENU_ORDER;
const ALL_ASPECTS: AspectRatio[] = ['1:1', '4:5', '9:16', '16:9'];

function randomEffectPresetLayer(preset: EffectPreset, baseHue: number): EffectLayer {
  const base = makeEffectPresetLayer(preset);
  const ah = (baseHue + rand(120, 240)) % 360;
  let overrides: Partial<EffectLayer> = {};
  switch (preset) {
    case 'rays':
      overrides = {
        rays: rand(4, 24), rayInt: rand(20, 90),
        rayColor: randomHsl(ah, [70, 100], [55, 80]),
      };
      break;
    case 'bloom':
      overrides = { bloom: rand(15, 80) };
      break;
    case 'filmBurn':
      overrides = { filmBurn: rand(20, 90) };
      break;
    case 'glitch':
      overrides = { glitch: rand(0, 18) };
      break;
    case 'ca':
      overrides = { ca: rand(0, 12) };
      break;
    case 'interlace':
      overrides = { interlace: rand(10, 70) };
      break;
    case 'dataMosh':
      overrides = { dataMosh: rand(10, 70) };
      break;
    case 'grain':
      overrides = { grain: rand(10, 60) };
      break;
    case 'scanlines':
      overrides = { scanlines: rand(5, 40) };
      break;
    case 'tint':
      overrides = { tint: randomHsl(rand(0, 359), [40, 80], [10, 28]), tintOp: rand(15, 65) };
      break;
    case 'noiseWarp':
      overrides = { noiseWarp: rand(10, 70) };
      break;
    case 'morph':
      overrides = { morphAmt: rand(10, 80), morphFreq: rand(1, 15) };
      break;
    case 'vortex':
      overrides = { vortex: rand(5, 60) };
      break;
    case 'barrel':
      overrides = { barrel: rand(5, 70) };
      break;
    case 'tear':
      overrides = { tearAmt: rand(1, 15), tearSize: rand(1, 12) };
      break;
    case 'mirror':
      overrides = { mirror: rand(1, 3) };
      break;
    case 'hueShift':
      overrides = { hueShift: rand(10, 350) };
      break;
    case 'rgbSplit':
      overrides = { rgbSplit: rand(3, 25) };
      break;
    case 'vignette':
      overrides = { vignette: rand(0, 80) };
      break;
    case 'pixelate':
      overrides = { pixelate: rand(2, 15) };
      break;
    case 'posterize':
      overrides = { posterize: rand(3, 12) };
      break;
    case 'duotone':
      overrides = {
        duotone: rand(40, 90),
        duoA: randomHsl(baseHue, [30, 60], [3, 12]),
        duoB: randomHsl(ah, [60, 100], [55, 85]),
      };
      break;
    case 'halftone':
      overrides = { halftone: rand(5, 20) };
      break;
    case 'risoShift':
      overrides = { risoShift: rand(5, 30), risoAngle: rand(0, 360) };
      break;
    case 'warp':
      overrides = {
        morphAmt: spark() ? rand(10, 80) : 0, morphFreq: rand(1, 15),
        tearAmt: spark() ? rand(1, 15) : 0, tearSize: rand(1, 12),
        noiseWarp: spark() ? rand(10, 70) : 0, vortex: spark() ? rand(5, 60) : 0,
        barrel: spark() ? rand(5, 70) : 0, mirror: spark() ? rand(1, 3) : 0,
      };
      break;
    case 'color':
      overrides = {
        hueShift: spark() ? rand(10, 350) : 0, bloom: spark() ? rand(15, 80) : 0,
        posterize: spark() ? rand(3, 12) : 0,
        duotone: Math.random() < 0.6 ? rand(40, 90) : 0,
        duoA: randomHsl(baseHue, [30, 60], [3, 12]),
        duoB: randomHsl(ah, [60, 100], [55, 85]),
      };
      break;
    case 'riso':
      overrides = {
        halftone: Math.random() < 0.5 ? rand(5, 20) : 0,
        risoShift: Math.random() < 0.5 ? rand(5, 30) : 0, risoAngle: rand(0, 360),
        duotone: Math.random() < 0.4 ? rand(40, 90) : 0,
        duoA: randomHsl(baseHue, [30, 60], [3, 12]),
        duoB: randomHsl(ah, [60, 100], [55, 85]),
      };
      break;
  }
  return { ...base, ...overrides };
}

export function randomDocument(): CanvasDocument {
  const baseHue = rand(0, 359);
  const aspect = ALL_ASPECTS[Math.floor(Math.random() * ALL_ASPECTS.length)];
  const shuffled = [...ALL_PRESETS].sort(() => Math.random() - 0.5);
  const n = rand(2, 8);
  const effectLayers = Array.from({ length: n }, (_, i) =>
    randomEffectPresetLayer(shuffled[i % shuffled.length], baseHue),
  );
  return {
    global: { ...randomGlobal(baseHue), aspect },
    layers: [randomEmojiLayer(baseHue), ...effectLayers],
    export: { ...DEFAULT_EXPORT },
  };
}

export function randomLayerSection(layer: EmojiLayer, section: 'EMOJIS'): Partial<EmojiLayer>;
export function randomLayerSection(layer: EffectLayer, section: string): Partial<EffectLayer>;
export function randomLayerSection(layer: TextLayer, section: 'TEXT'): Partial<TextLayer>;
export function randomLayerSection(layer: unknown, section: string): Partial<unknown> {
  const h = rand(0, 359);
  const ah = (h + rand(120, 240)) % 360;

  switch (section) {
    case 'EMOJIS': {
      const pool = [...ALL_EMOJIS].sort(() => Math.random() - 0.5);
      const minSz = rand(10, 50);
      return {
        emojis: pool.slice(0, rand(2, 6)),
        density: rand(15, 70),
        minSz,
        maxSz: rand(Math.max(minSz + 10, 40), 130),
        blur: rand(0, 80),
      };
    }
    case 'RAYS':
      return {
        rays: rand(4, 24),
        rayInt: rand(20, 90),
        rayColor: randomHsl(ah, [70, 100], [55, 80]),
        bloom: spark() ? rand(15, 80) : 0,
        filmBurn: spark() ? rand(20, 90) : 0,
      };
    case 'GLITCH':
      return {
        glitch: rand(0, 18),
        ca: rand(0, 12),
        interlace: spark() ? rand(10, 70) : 0,
        dataMosh: spark() ? rand(10, 70) : 0,
      };
    case 'TEXTURE':
      return { grain: rand(0, 60), scanlines: rand(0, 40) };
    case 'TINT':
      return { tint: randomHsl(rand(0, 359), [40, 80], [10, 28]), tintOp: rand(0, 60) };
    case 'WARP':
      return {
        morphAmt: spark() ? rand(10, 80) : 0,
        morphFreq: rand(1, 15),
        tearAmt: spark() ? rand(1, 15) : 0,
        tearSize: rand(1, 12),
        noiseWarp: spark() ? rand(10, 70) : 0,
        vortex: spark() ? rand(5, 60) : 0,
        barrel: spark() ? rand(5, 70) : 0,
        mirror: spark() ? rand(1, 3) : 0,
      };
    case 'COLORFX':
      return {
        hueShift: spark() ? rand(10, 350) : 0,
        rgbSplit: spark() ? rand(3, 25) : 0,
        vignette: rand(0, 80),
        pixelate: spark() ? rand(2, 15) : 0,
        posterize: spark() ? rand(3, 12) : 0,
      };
    case 'RISO':
      return {
        duotone: Math.random() < 0.5 ? rand(40, 90) : 0,
        duoA: randomHsl(h, [30, 60], [3, 12]),
        duoB: randomHsl(ah, [60, 100], [55, 85]),
        halftone: Math.random() < 0.5 ? rand(5, 20) : 0,
        risoShift: Math.random() < 0.5 ? rand(5, 30) : 0,
        risoAngle: rand(0, 360),
      };
    case 'TEXT':
      return {
        font: ['MONO', 'DISPLAY', 'VT323', 'SPECIAL'][rand(0, 3)] as TextLayer['font'],
        size: rand(28, 96),
        color: randomHsl(ah, [0, 100], [50, 100]),
        opacity: rand(70, 100),
        rotation: rand(-25, 25),
        align: TEXT_ALIGNS[rand(0, TEXT_ALIGNS.length - 1)],
        blendMode: TEXT_BLENDS[rand(0, TEXT_BLENDS.length - 1)],
      };
    default:
      return layer ?? {};
  }
}

export function zeroLayerSection(section: string): Partial<EffectLayer> | Partial<EmojiLayer> | Partial<TextLayer> {
  switch (section) {
    case 'EMOJIS':
      return { density: 0, blur: 0 };
    case 'RAYS':
      return { rays: 0, rayInt: 0, bloom: 0, filmBurn: 0 };
    case 'GLITCH':
      return { glitch: 0, ca: 0, interlace: 0, dataMosh: 0 };
    case 'TEXTURE':
      return { grain: 0, scanlines: 0 };
    case 'TINT':
      return { tintOp: 0 };
    case 'WARP':
      return { morphAmt: 0, tearAmt: 0, noiseWarp: 0, vortex: 0, barrel: 0, mirror: 0 };
    case 'COLORFX':
      return { hueShift: 0, rgbSplit: 0, vignette: 0, pixelate: 0, posterize: 0 };
    case 'RISO':
      return { duotone: 0, halftone: 0, risoShift: 0 };
    case 'TEXT':
      return { content: '', opacity: 100, rotation: 0, x: 0.5, y: 0.5, scaleX: 1, scaleY: 1 };
    default:
      return {};
  }
}

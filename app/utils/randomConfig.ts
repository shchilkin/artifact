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
} from '../types/config';

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
    return Math.round(255 * c)
      .toString(16)
      .padStart(2, '0');
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
  const baseHueValue = baseHue ?? rand(0, 359);
  const preset = ALL_PRESETS[Math.floor(Math.random() * ALL_PRESETS.length)];
  return randomEffectPresetLayer(preset, baseHueValue);
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
        rays: rand(4, 24),
        rayInt: rand(20, 90),
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
    case 'rgbSplit':
      overrides = { rgbSplit: rand(0, 12) };
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
    case 'blur':
      overrides = { blurAmt: rand(10, 70) };
      break;
    case 'threshold':
      overrides = { threshold: rand(30, 70) };
      break;
    case 'edgeDetect':
      overrides = { edgeDetect: rand(40, 90) };
      break;
    case 'gradientOverlay':
      overrides = {
        gradMix: rand(30, 80),
        gradA: randomHsl(baseHue, [40, 80], [10, 30]),
        gradB: randomHsl(ah, [60, 100], [55, 85]),
        gradAngle: rand(0, 360),
      };
      break;
    case 'sepia':
      overrides = { sepia: rand(40, 90) };
      break;
    case 'neonGlow':
      overrides = { neonGlow: rand(25, 80), neonColor: randomHsl(ah, [80, 100], [50, 80]) };
      break;
    case 'zoomBlur':
      overrides = { zoomBlur: rand(15, 65) };
      break;
    case 'vhsTracking':
      overrides = { vhsTracking: rand(10, 60) };
      break;
    case 'dither':
      overrides = { dither: rand(25, 80) };
      break;
    case 'infrared':
      overrides = { infrared: rand(40, 90) };
      break;
    case 'ca':
      overrides = { ca: rand(5, 25) };
      break;
    case 'wave':
      overrides = { waveAmt: rand(8, 45), waveFreq: rand(1, 8) };
      break;
    case 'matte':
      overrides = { matte: rand(15, 65) };
      break;
    case 'overprint':
      overrides = { overprint: rand(10, 55) };
      break;
    case 'solarize':
      overrides = { solarize: rand(30, 80) };
      break;
    case 'bleachBypass':
      overrides = { bleachBypass: rand(20, 70) };
      break;
    case 'cyanotype':
      overrides = { cyanotype: rand(20, 80) };
      break;
    case 'splitTone':
      overrides = { splitToneAmt: rand(20, 70) };
      break;
    case 'ripple':
      overrides = { rippleAmt: rand(10, 60), rippleFreq: rand(1, 8) };
      break;
    case 'kaleidoscope':
      overrides = { kaleidoscope: rand(20, 80) };
      break;
    case 'squeeze':
      overrides = { squeezeX: spark() ? rand(-60, 60) : 0, squeezeY: spark() ? rand(-60, 60) : 0 };
      break;
    case 'emboss':
      overrides = { emboss: rand(20, 80) };
      break;
    case 'linocut':
      overrides = { linocut: rand(20, 80) };
      break;
    case 'fog':
      overrides = { fog: rand(20, 70) };
      break;
    case 'speedLines':
      overrides = { speedLines: rand(10, 80) };
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
    schemaVersion: DOCUMENT_SCHEMA_VERSION,
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
        neonGlow: Math.random() < 0.3 ? rand(20, 70) : 0,
        neonColor: randomHsl(ah, [80, 100], [50, 80]),
        fog: Math.random() < 0.2 ? rand(20, 70) : 0,
        speedLines: Math.random() < 0.15 ? rand(10, 80) : 0,
      };
    case 'GLITCH':
      return {
        glitch: rand(0, 18),
        rgbSplit: rand(0, 12),
        ca: spark() ? rand(3, 20) : 0,
        interlace: spark() ? rand(10, 70) : 0,
        dataMosh: spark() ? rand(10, 70) : 0,
        vhsTracking: spark() ? rand(10, 55) : 0,
      };
    case 'TEXTURE':
      return {
        grain: rand(0, 60),
        scanlines: rand(0, 40),
        blurAmt: Math.random() < 0.4 ? rand(0, 60) : 0,
        matte: Math.random() < 0.35 ? rand(10, 60) : 0,
        dither: Math.random() < 0.25 ? rand(20, 75) : 0,
        emboss: Math.random() < 0.2 ? rand(20, 80) : 0,
        linocut: Math.random() < 0.2 ? rand(20, 80) : 0,
      };
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
        waveAmt: Math.random() < 0.3 ? rand(5, 40) : 0,
        waveFreq: rand(1, 8),
        zoomBlur: Math.random() < 0.2 ? rand(10, 55) : 0,
        rippleAmt: Math.random() < 0.2 ? rand(10, 60) : 0,
        rippleFreq: rand(1, 8),
        kaleidoscope: Math.random() < 0.15 ? rand(20, 80) : 0,
        squeezeX: spark() ? rand(-60, 60) : 0,
        squeezeY: spark() ? rand(-60, 60) : 0,
      };
    case 'COLORFX':
      return {
        hueShift: spark() ? rand(10, 350) : 0,
        rgbSplit: spark() ? rand(3, 25) : 0,
        vignette: rand(0, 80),
        pixelate: spark() ? rand(2, 15) : 0,
        posterize: spark() ? rand(3, 12) : 0,
        threshold: Math.random() < 0.2 ? rand(30, 70) : 0,
        edgeDetect: Math.random() < 0.2 ? rand(30, 80) : 0,
        gradMix: Math.random() < 0.25 ? rand(30, 70) : 0,
        sepia: Math.random() < 0.2 ? rand(20, 80) : 0,
        infrared: Math.random() < 0.15 ? rand(30, 80) : 0,
        solarize: Math.random() < 0.15 ? rand(30, 80) : 0,
        bleachBypass: Math.random() < 0.15 ? rand(20, 70) : 0,
        cyanotype: Math.random() < 0.15 ? rand(20, 80) : 0,
        splitToneAmt: Math.random() < 0.15 ? rand(20, 70) : 0,
      };
    case 'RISO':
      return {
        duotone: Math.random() < 0.5 ? rand(40, 90) : 0,
        duoA: randomHsl(h, [30, 60], [3, 12]),
        duoB: randomHsl(ah, [60, 100], [55, 85]),
        halftone: Math.random() < 0.5 ? rand(5, 20) : 0,
        risoShift: Math.random() < 0.5 ? rand(5, 30) : 0,
        risoAngle: rand(0, 360),
        overprint: Math.random() < 0.3 ? rand(10, 55) : 0,
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
      return { grain: 0, scanlines: 0, blurAmt: 0, matte: 0, dither: 0, emboss: 0, linocut: 0 };
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
        pixelate: 0,
        posterize: 0,
        threshold: 0,
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

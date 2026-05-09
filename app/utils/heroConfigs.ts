import type { CanvasDocument, EffectLayer } from '../types/config';
import { ALL_EMOJIS, makeEmojiLayer, makeEffectLayer } from '../types/config';

export interface HeroFrame {
  doc: CanvasDocument;
}

function mkDoc(
  seed: number,
  bg: string,
  emojis: string[],
  emojiOpts: { density: number; minSz: number; maxSz: number; blur: number },
  fx: Partial<EffectLayer>,
): CanvasDocument {
  return {
    global: { bg, seed, aspect: '1:1' },
    layers: [
      makeEmojiLayer({ emojis, ...emojiOpts }),
      makeEffectLayer(fx),
    ],
  };
}

export const HERO_FRAMES: HeroFrame[] = [
  { doc: mkDoc(42069, '#0d0020', ['👽', '💀', '✦', '🌀', '💜'], { density: 32, minSz: 28, maxSz: 78, blur: 65 }, { grain: 25, scanlines: 15, rayInt: 68, rayColor: '#9900ff', rays: 18, tint: '#1a0035', tintOp: 25, glitch: 8, morphAmt: 50, morphFreq: 7, noiseWarp: 30, rgbSplit: 4, vignette: 40, bloom: 25 }) },
  { doc: mkDoc(13370, '#001008', ['📼', '🔴', '⚡', '💾', '🖥️'], { density: 28, minSz: 20, maxSz: 90, blur: 50 }, { grain: 35, scanlines: 25, rayInt: 45, rayColor: '#00ff88', rays: 8, tint: '#002210', tintOp: 20, glitch: 15, tearAmt: 12, tearSize: 5, dataMosh: 60, interlace: 40, hueShift: 120, rgbSplit: 18, vignette: 55, bloom: 35 }) },
  { doc: mkDoc(77777, '#000820', ['🌀', '🫧', '⭕', '💫', '🔵'], { density: 45, minSz: 15, maxSz: 65, blur: 72 }, { grain: 18, scanlines: 8, rayInt: 55, rayColor: '#0066ff', rays: 24, tint: '#00082a', tintOp: 35, glitch: 4, morphAmt: 30, morphFreq: 10, noiseWarp: 20, vortex: 80, barrel: 60, hueShift: 200, rgbSplit: 8, vignette: 65, bloom: 55 }) },
  { doc: mkDoc(9876, '#140800', ['🎞️', '👻', '🌫️', '✨', '🕯️'], { density: 25, minSz: 40, maxSz: 100, blur: 80 }, { grain: 45, scanlines: 20, rayInt: 40, rayColor: '#ff6600', rays: 6, rgbSplit: 2, tint: '#200a00', tintOp: 40, glitch: 5, noiseWarp: 70, barrel: 25, interlace: 20, vignette: 75, bloom: 45, filmBurn: 80 }) },
  { doc: mkDoc(31415, '#1a0010', ['🌸', '📿', '🌺', '💌', '🎀'], { density: 40, minSz: 25, maxSz: 75, blur: 45 }, { grain: 30, scanlines: 10, rayInt: 60, rayColor: '#ff0080', rays: 12, tint: '#150010', tintOp: 20, glitch: 6, mirror: 1, hueShift: 310, rgbSplit: 6, vignette: 35, bloom: 20, posterize: 8, duotone: 70, duoA: '#0a001a', duoB: '#ff44cc', halftone: 15, risoShift: 25, risoAngle: 220 }) },
  { doc: mkDoc(55555, '#060606', ['📺', '⬜', '▪️', '🔲', '◾'], { density: 50, minSz: 18, maxSz: 60, blur: 30 }, { grain: 50, scanlines: 40, rayInt: 30, rayColor: '#aaaaaa', rays: 6, tint: '#080808', tintOp: 15, glitch: 20, interlace: 70, pixelate: 3, rgbSplit: 28, dataMosh: 45, vignette: 80, bloom: 10 }) },
  { doc: mkDoc(24680, '#030800', ['🌿', '🍄', '✳️', '💊', '🔆'], { density: 38, minSz: 22, maxSz: 82, blur: 55 }, { grain: 40, scanlines: 6, rayInt: 70, rayColor: '#88ff00', rays: 20, tint: '#041200', tintOp: 30, glitch: 10, hueShift: 180, barrel: 65, posterize: 14, noiseWarp: 40, rgbSplit: 12, vignette: 45, bloom: 65 }) },
  { doc: mkDoc(11223, '#1a0500', ['🌡️', '🔴', '🟠', '♨️', '🔥'], { density: 30, minSz: 32, maxSz: 88, blur: 60 }, { grain: 28, scanlines: 14, rayInt: 50, rayColor: '#ff4400', rays: 10, rgbSplit: 3, tint: '#220800', tintOp: 45, glitch: 3, noiseWarp: 55, vignette: 60, bloom: 70, duotone: 85, duoA: '#0a0000', duoB: '#ff3300' }) },
  { doc: mkDoc(66666, '#000508', ['💔', '❌', '🔴', '⬛', '❓'], { density: 35, minSz: 20, maxSz: 70, blur: 40 }, { grain: 32, scanlines: 18, rayInt: 25, rayColor: '#ff0022', rays: 4, tint: '#000508', tintOp: 10, glitch: 25, tearAmt: 18, tearSize: 4, dataMosh: 55, interlace: 35, pixelate: 5, rgbSplit: 35, vignette: 70, bloom: 20 }) },
  { doc: mkDoc(98765, '#0e0800', ['🌻', '🍂', '⚙️', '🪙', '✦'], { density: 36, minSz: 28, maxSz: 80, blur: 52 }, { grain: 35, scanlines: 8, rayInt: 55, rayColor: '#ff8800', rays: 14, rgbSplit: 3, tint: '#1a0e00', tintOp: 35, glitch: 4, noiseWarp: 20, vignette: 50, bloom: 30, duotone: 75, duoA: '#0a0400', duoB: '#ff8800', halftone: 30, risoShift: 15, risoAngle: 45 }) },
];

function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const BG_COLORS = ['#0d0020', '#001008', '#000820', '#140800', '#1a0010', '#060606', '#030800', '#1a0500', '#000508', '#0e0800', '#00001a', '#080010', '#001a00', '#1a1000', '#000a1a'];
const RAY_COLORS = ['#9900ff', '#00ff88', '#0066ff', '#ff6600', '#ff0080', '#aaaaaa', '#88ff00', '#ff4400', '#ff0022', '#ff8800', '#00ffcc', '#ff00aa', '#44aaff', '#ffcc00', '#cc00ff'];
const EFFECT_COMBOS: Array<Partial<EffectLayer>> = [
  { filmBurn: 80, noiseWarp: 40, vignette: 70, bloom: 45 },
  { vortex: 80, barrel: 60, bloom: 55, noiseWarp: 20 },
  { dataMosh: 60, interlace: 40, rgbSplit: 18, glitch: 15 },
  { duotone: 75, bloom: 30, noiseWarp: 20, vignette: 50 },
  { noiseWarp: 70, bloom: 65, barrel: 40, vignette: 55 },
  { morphAmt: 50, morphFreq: 7, rgbSplit: 8, vignette: 45 },
  { posterize: 10, hueShift: 180, barrel: 65, rgbSplit: 12 },
  { halftone: 20, risoShift: 25, duotone: 70, bloom: 20 },
  { glitch: 25, tearAmt: 15, pixelate: 4, rgbSplit: 30 },
  { interlace: 60, scanlines: 30, dataMosh: 45, grain: 45 },
];

function pick<T>(arr: T[], rand: () => number): T {
  return arr[Math.floor(rand() * arr.length)];
}

function pickN<T>(arr: T[], n: number, rand: () => number): T[] {
  const shuffled = [...arr].sort(() => rand() - 0.5);
  return shuffled.slice(0, n);
}

function lerp(min: number, max: number, t: number) {
  return Math.round(min + (max - min) * t);
}

export function generateRandomHeroFrame(seed: number): HeroFrame {
  const rand = lcg(seed);
  const bg = pick(BG_COLORS, rand);
  const rayColor = pick(RAY_COLORS, rand);
  const combo = pick(EFFECT_COMBOS, rand);
  const emojis = pickN(ALL_EMOJIS, lerp(3, 5, rand()), rand);
  const duoA = pick(BG_COLORS, rand);
  const duoB = pick(RAY_COLORS, rand);

  return {
    doc: {
      global: { bg, seed, aspect: '1:1' },
      layers: [
        makeEmojiLayer({
          emojis,
          density: lerp(20, 50, rand()),
          blur: lerp(40, 80, rand()),
        }),
        makeEffectLayer({
          grain: lerp(20, 45, rand()),
          vignette: lerp(30, 70, rand()),
          rays: lerp(6, 24, rand()),
          rgbSplit: lerp(2, 8, rand()),
          rayInt: lerp(30, 80, rand()),
          rayColor,
          tint: bg,
          tintOp: lerp(15, 45, rand()),
          duoA,
          duoB,
          ...combo,
        }),
      ],
    },
  };
}

export const GENERATED_HERO_SEEDS = [111111, 222222, 333333, 444444, 555001, 666001, 777001, 888001, 999001, 101010, 121212, 131313, 141414, 151515, 161616, 171717, 181818, 191919, 202020, 212121];

export const ALL_HERO_FRAMES: HeroFrame[] = [
  ...HERO_FRAMES,
  ...GENERATED_HERO_SEEDS.map(generateRandomHeroFrame),
];

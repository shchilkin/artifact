import type { GeneratorConfig } from '../types/config';
import { DEFAULT_CONFIG } from '../types/config';

export interface HeroFrame { cfg: GeneratorConfig; seed: number; }

export const HERO_FRAMES: HeroFrame[] = [
  // 1. Phantom Violet — morph + rgb split + vignette
  {
    seed: 42069,
    cfg: { ...DEFAULT_CONFIG, bg: '#0d0020', emojis: ['👽', '💀', '✦', '🌀', '💜'], density: 32, minSz: 28, maxSz: 78, blur: 65, grain: 25, scanlines: 15, rayInt: 68, rayColor: '#9900ff', rays: 18, ca: 5, tint: '#1a0035', tintOp: 25, glitch: 8, morphAmt: 50, morphFreq: 7, noiseWarp: 30, rgbSplit: 4, vignette: 40, bloom: 25 },
  },
  // 2. Glitch Tape — tear + datamosh + interlace
  {
    seed: 13370,
    cfg: { ...DEFAULT_CONFIG, bg: '#001008', emojis: ['📼', '🔴', '⚡', '💾', '🖥️'], density: 28, minSz: 20, maxSz: 90, blur: 50, grain: 35, scanlines: 25, rayInt: 45, rayColor: '#00ff88', rays: 8, ca: 3, tint: '#002210', tintOp: 20, glitch: 15, tearAmt: 12, tearSize: 5, dataMosh: 60, interlace: 40, hueShift: 120, rgbSplit: 18, vignette: 55, bloom: 35 },
  },
  // 3. Vortex Dream — vortex + barrel + bloom
  {
    seed: 77777,
    cfg: { ...DEFAULT_CONFIG, bg: '#000820', emojis: ['🌀', '🫧', '⭕', '💫', '🔵'], density: 45, minSz: 15, maxSz: 65, blur: 72, grain: 18, scanlines: 8, rayInt: 55, rayColor: '#0066ff', rays: 24, ca: 7, tint: '#00082a', tintOp: 35, glitch: 4, morphAmt: 30, morphFreq: 10, noiseWarp: 20, vortex: 80, barrel: 60, hueShift: 200, rgbSplit: 8, vignette: 65, bloom: 55 },
  },
  // 4. Film Ghost — filmBurn + noiseWarp + grain
  {
    seed: 9876,
    cfg: { ...DEFAULT_CONFIG, bg: '#140800', emojis: ['🎞️', '👻', '🌫️', '✨', '🕯️'], density: 25, minSz: 40, maxSz: 100, blur: 80, grain: 45, scanlines: 20, rayInt: 40, rayColor: '#ff6600', rays: 6, ca: 2, tint: '#200a00', tintOp: 40, glitch: 5, noiseWarp: 70, barrel: 25, interlace: 20, vignette: 75, bloom: 45, filmBurn: 80 },
  },
  // 5. Riso Print — duotone + halftone + mirror
  {
    seed: 31415,
    cfg: { ...DEFAULT_CONFIG, bg: '#1a0010', emojis: ['🌸', '📿', '🌺', '💌', '🎀'], density: 40, minSz: 25, maxSz: 75, blur: 45, grain: 30, scanlines: 10, rayInt: 60, rayColor: '#ff0080', rays: 12, ca: 4, tint: '#150010', tintOp: 20, glitch: 6, mirror: 1, hueShift: 310, rgbSplit: 6, vignette: 35, bloom: 20, posterize: 8, filmBurn: 0, duotone: 70, duoA: '#0a001a', duoB: '#ff44cc', halftone: 15, risoShift: 25, risoAngle: 220 },
  },
];

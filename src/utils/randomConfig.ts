import type { GeneratorConfig } from '../types/config';
import { ALL_EMOJIS } from '../types/config';

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

/** 40% chance an optional GPU effect fires */
function spark(): boolean {
  return Math.random() < 0.4;
}

export function randomConfig(): GeneratorConfig {
  const baseHue = rand(0, 359);
  const accentHue = (baseHue + rand(120, 240)) % 360;
  const tintHue = (baseHue + rand(20, 60)) % 360;

  // Random emoji subset — 2 to 6 emojis
  const pool = [...ALL_EMOJIS].sort(() => Math.random() - 0.5);
  const emojis = pool.slice(0, rand(2, 6));

  const minSz = rand(10, 50);
  const maxSz = rand(Math.max(minSz + 10, 40), 130);

  return {
    // Background: very dark, low chroma
    bg: randomHsl(baseHue, [20, 55], [3, 14]),

    emojis,
    density: rand(15, 70),
    minSz,
    maxSz,
    blur: rand(0, 80),

    // Light rays: vibrant accent hue
    rays: rand(4, 24),
    rayInt: rand(20, 90),
    rayColor: randomHsl(accentHue, [70, 100], [55, 80]),

    // Glitch / texture
    ca: rand(0, 12),
    glitch: rand(0, 18),
    grain: rand(0, 60),
    scanlines: rand(0, 40),

    // Tint: slightly offset hue, semi-transparent
    tint: randomHsl(tintHue, [40, 80], [10, 28]),
    tintOp: rand(0, 60),

    // GPU warp effects — sparse activation (40% chance each)
    morphAmt: spark() ? rand(10, 80) : 0,
    morphFreq: rand(1, 15),
    tearAmt: spark() ? rand(1, 15) : 0,
    tearSize: rand(1, 12),
    noiseWarp: spark() ? rand(10, 70) : 0,
    vortex: spark() ? rand(5, 60) : 0,
    barrel: spark() ? rand(5, 70) : 0,

    // GPU color effects
    pixelate: spark() ? rand(2, 15) : 0,
    hueShift: spark() ? rand(10, 350) : 0,
    rgbSplit: spark() ? rand(3, 25) : 0,
    vignette: rand(0, 80),
  };
}

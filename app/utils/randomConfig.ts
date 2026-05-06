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

const TEXT_FONTS = ['MONO', 'DISPLAY', 'VT323', 'SPECIAL'] as const;
const TEXT_ALIGNS = ['left', 'center', 'right'] as const;
const TEXT_BLENDS = ['normal', 'screen', 'overlay', 'multiply'] as const;

export function zeroSection(section: string): Partial<GeneratorConfig> {
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
      return { text: '', textOpacity: 100, textRotation: 0, textX: 0.5, textY: 0.5 };
    default:
      return {};
  }
}

export function randomSection(section: string, baseHue?: number): Partial<GeneratorConfig> {
  const h = baseHue ?? rand(0, 359);
  const ah = (h + rand(120, 240)) % 360;

  switch (section) {
    case 'BG':
      return { bg: randomHsl(h, [20, 55], [3, 14]) };

    case 'EMOJIS': {
      const pool = [...ALL_EMOJIS].sort(() => Math.random() - 0.5);
      const emojis = pool.slice(0, rand(2, 6));
      const minSz = rand(10, 50);
      return {
        emojis,
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
      return {
        grain: rand(0, 60),
        scanlines: rand(0, 40),
      };

    case 'TINT':
      return {
        tint: randomHsl(rand(0, 359), [40, 80], [10, 28]),
        tintOp: rand(0, 60),
      };

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
        textFont: TEXT_FONTS[rand(0, TEXT_FONTS.length - 1)],
        textSize: rand(28, 96),
        textColor: randomHsl(ah, [0, 100], [50, 100]),
        textOpacity: rand(70, 100),
        textRotation: rand(-25, 25),
        textAlign: TEXT_ALIGNS[rand(0, TEXT_ALIGNS.length - 1)],
        textBlend: TEXT_BLENDS[rand(0, TEXT_BLENDS.length - 1)],
      };

    default:
      return {};
  }
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
    mirror: spark() ? rand(1, 3) : 0,
    dataMosh: spark() ? rand(10, 70) : 0,
    interlace: spark() ? rand(10, 70) : 0,

    // GPU color effects
    pixelate: spark() ? rand(2, 15) : 0,
    hueShift: spark() ? rand(10, 350) : 0,
    rgbSplit: spark() ? rand(3, 25) : 0,
    vignette: rand(0, 80),
    bloom: spark() ? rand(15, 80) : 0,
    posterize: spark() ? rand(3, 12) : 0,
    filmBurn: spark() ? rand(20, 90) : 0,

    // Riso / print — lower activation rate (30%) since they're strong effects
    duotone: Math.random() < 0.3 ? rand(40, 90) : 0,
    duoA: randomHsl(baseHue, [30, 60], [3, 12]),
    duoB: randomHsl(accentHue, [60, 100], [55, 85]),
    halftone: Math.random() < 0.3 ? rand(5, 20) : 0,
    risoShift: Math.random() < 0.3 ? rand(5, 30) : 0,
    risoAngle: rand(0, 360),

    // Label — always reset on randomize
    parentalAdvisory: false,
    advisoryX: 0.05,
    advisoryY: 0.82,
    advisoryBorder: true,

    // Text — randomize styles but never content
    text: '',
    textFont: TEXT_FONTS[rand(0, TEXT_FONTS.length - 1)],
    textSize: rand(28, 96),
    textColor: randomHsl(accentHue, [0, 100], [50, 100]),
    textOpacity: rand(70, 100),
    textX: rand(30, 70) / 100,
    textY: rand(30, 70) / 100,
    textRotation: rand(-25, 25),
    textAlign: TEXT_ALIGNS[rand(0, TEXT_ALIGNS.length - 1)],
    textBlend: TEXT_BLENDS[rand(0, TEXT_BLENDS.length - 1)],

    // Background image settings — keep defaults on randomize
    bgImageFit: 'cover',
    bgImageOpacity: 85,
    bgImageBlend: 'normal',
  };
}

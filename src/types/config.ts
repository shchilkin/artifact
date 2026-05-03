export interface GeneratorConfig {
  bg: string;
  emojis: string[];
  density: number;
  minSz: number;
  maxSz: number;
  blur: number;
  grain: number;
  scanlines: number;
  rayInt: number;
  rayColor: string;
  rays: number;
  ca: number;
  glitch: number;
  tint: string;
  tintOp: number;
  // GPU effects
  morphAmt: number;    // 0–100 liquid distortion intensity
  morphFreq: number;   // 1–20  wave frequency
  tearAmt: number;     // 0–20  chunk tearing intensity
  tearSize: number;    // 1–20  strip height (% of image)
  noiseWarp: number;   // 0–100 hash-based organic warp
  vortex: number;      // 0–100 rotational twist from center
  barrel: number;      // 0–100 barrel lens distortion
  pixelate: number;    // 0–20  pixelate block size (0 = off)
  hueShift: number;    // 0–360 hue wheel rotation
  rgbSplit: number;    // 0–30  diagonal RGB channel separation
  vignette: number;    // 0–100 edge burn darkening
}

export const DEFAULT_CONFIG: GeneratorConfig = {
  bg: '#120020',
  emojis: ['😂', '😭', '💔', '👽', '💀', '😤', '😮', '✦'],
  density: 40,
  minSz: 24,
  maxSz: 72,
  grain: 22,
  scanlines: 12,
  rayInt: 62,
  rayColor: '#bb00ff',
  rays: 14,
  ca: 4,
  blur: 58,
  tint: '#350055',
  tintOp: 28,
  glitch: 7,
  morphAmt: 0,
  morphFreq: 5,
  tearAmt: 0,
  tearSize: 3,
  noiseWarp: 0,
  vortex: 0,
  barrel: 0,
  pixelate: 0,
  hueShift: 0,
  rgbSplit: 0,
  vignette: 0,
};

export const ALL_EMOJIS = [
  '😂', '😭', '😢', '😞', '😤', '😮', '😩', '😑',
  '💔', '👽', '💀', '✦', '🤡', '🖤', '💜', '🔥',
  '⚡', '🌑', '🥀', '😈',
];

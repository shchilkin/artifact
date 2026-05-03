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
  // GPU warp
  morphAmt: number;    // 0–100 liquid distortion intensity
  morphFreq: number;   // 1–20  wave frequency
  tearAmt: number;     // 0–20  chunk tearing intensity
  tearSize: number;    // 1–20  strip height (% of image)
  noiseWarp: number;   // 0–100 hash-based organic warp
  vortex: number;      // 0–100 rotational twist from center
  barrel: number;      // 0–100 barrel lens distortion
  mirror: number;      // 0–3   0=off 1=fold-x 2=fold-y 3=quad
  dataMosh: number;    // 0–100 block displacement glitch
  interlace: number;   // 0–100 alternating scanline shift
  // GPU color FX
  pixelate: number;    // 0–20  pixelate block size (0 = off)
  hueShift: number;    // 0–360 hue wheel rotation
  rgbSplit: number;    // 0–30  diagonal RGB channel separation
  vignette: number;    // 0–100 edge burn darkening
  bloom: number;       // 0–100 bright-area glow bleed
  posterize: number;   // 0–16  color steps (0 = off)
  filmBurn: number;    // 0–100 hot corner flare
  // Riso / print
  duotone: number;     // 0–100 two-colour mapping strength
  duoA: string;        // shadow / dark ink colour
  duoB: string;        // highlight / light ink colour
  halftone: number;    // 0–30  dot-screen grid density (0 = off)
  risoShift: number;   // 0–40  misregistration offset (0 = off)
  risoAngle: number;   // 0–360 misregistration direction
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
  mirror: 0,
  dataMosh: 0,
  interlace: 0,
  pixelate: 0,
  hueShift: 0,
  rgbSplit: 0,
  vignette: 0,
  bloom: 0,
  posterize: 0,
  filmBurn: 0,
  duotone: 0,
  duoA: '#0a0020',
  duoB: '#ff6ec7',
  halftone: 0,
  risoShift: 0,
  risoAngle: 15,
};

export const ALL_EMOJIS = [
  '😂', '😭', '😢', '😞', '😤', '😮', '😩', '😑',
  '💔', '👽', '💀', '✦', '🤡', '🖤', '💜', '🔥',
  '⚡', '🌑', '🥀', '😈',
];

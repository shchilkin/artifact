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
  morphAmt: number;  // 0–100 liquid distortion
  tearAmt: number;   // 0–20 chunk tearing
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
  tearAmt: 0,
};

export const ALL_EMOJIS = [
  '😂', '😭', '😢', '😞', '😤', '😮', '😩', '😑',
  '💔', '👽', '💀', '✦', '🤡', '🖤', '💜', '🔥',
  '⚡', '🌑', '🥀', '😈',
];

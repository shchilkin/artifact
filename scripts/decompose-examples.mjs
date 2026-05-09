#!/usr/bin/env node
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'app', 'examples');

const ZERO_EFFECT = {
  maskAlpha: false,
  grain: 0, scanlines: 0, ca: 0, glitch: 0,
  tint: '#350055', tintOp: 0,
  rays: 0, rayInt: 0, rayColor: '#bb00ff',
  morphAmt: 0, morphFreq: 5, tearAmt: 0, tearSize: 3,
  noiseWarp: 0, vortex: 0, barrel: 0, mirror: 0, dataMosh: 0, interlace: 0,
  pixelate: 0, hueShift: 0, rgbSplit: 0, vignette: 0, bloom: 0, posterize: 0, filmBurn: 0,
  duotone: 0, duoA: '#0a0020', duoB: '#ff6ec7', halftone: 0, risoShift: 0, risoAngle: 15,
};

const PRESET_NAMES = {
  tint: 'Tint', hueShift: 'Hue Shift', duotone: 'Duotone',
  morph: 'Morph', noiseWarp: 'Noise Warp', vortex: 'Vortex', barrel: 'Barrel', tear: 'Tear', mirror: 'Mirror',
  pixelate: 'Pixelate', posterize: 'Posterize', halftone: 'Halftone', risoShift: 'Misregister',
  glitch: 'Glitch', ca: 'Chromatic', rgbSplit: 'RGB Split', dataMosh: 'Data Mosh', interlace: 'Interlace', scanlines: 'Scanlines',
  rays: 'Rays', bloom: 'Bloom', filmBurn: 'Film Burn',
  grain: 'Grain', vignette: 'Vignette',
};

const ORDER = [
  'tint', 'hueShift', 'duotone',
  'morph', 'noiseWarp', 'vortex', 'barrel', 'tear', 'mirror',
  'pixelate', 'posterize', 'halftone', 'risoShift',
  'glitch', 'ca', 'rgbSplit', 'dataMosh', 'interlace', 'scanlines',
  'rays', 'bloom', 'filmBurn',
  'grain', 'vignette',
];

function buildPresetLayer(preset, overrides, idx) {
  return {
    id: `ex-fx-${preset}-${idx}`,
    name: PRESET_NAMES[preset],
    visible: true,
    locked: false,
    kind: 'effect',
    preset,
    ...ZERO_EFFECT,
    ...overrides,
  };
}

function decompose(legacy) {
  const layers = [];
  let idx = 0;
  for (const preset of ORDER) {
    let overrides = null;
    switch (preset) {
      case 'tint':
        if (legacy.tintOp > 0) overrides = { tint: legacy.tint, tintOp: legacy.tintOp };
        break;
      case 'hueShift':
        if (legacy.hueShift > 0) overrides = { hueShift: legacy.hueShift };
        break;
      case 'duotone':
        if (legacy.duotone > 0) overrides = { duotone: legacy.duotone, duoA: legacy.duoA, duoB: legacy.duoB };
        break;
      case 'morph':
        if (legacy.morphAmt > 0) overrides = { morphAmt: legacy.morphAmt, morphFreq: legacy.morphFreq };
        break;
      case 'noiseWarp':
        if (legacy.noiseWarp > 0) overrides = { noiseWarp: legacy.noiseWarp };
        break;
      case 'vortex':
        if (legacy.vortex > 0) overrides = { vortex: legacy.vortex };
        break;
      case 'barrel':
        if (legacy.barrel > 0) overrides = { barrel: legacy.barrel };
        break;
      case 'tear':
        if (legacy.tearAmt > 0) overrides = { tearAmt: legacy.tearAmt, tearSize: legacy.tearSize };
        break;
      case 'mirror':
        if (legacy.mirror > 0) overrides = { mirror: legacy.mirror };
        break;
      case 'pixelate':
        if (legacy.pixelate > 0) overrides = { pixelate: legacy.pixelate };
        break;
      case 'posterize':
        if (legacy.posterize > 0) overrides = { posterize: legacy.posterize };
        break;
      case 'halftone':
        if (legacy.halftone > 0) overrides = { halftone: legacy.halftone };
        break;
      case 'risoShift':
        if (legacy.risoShift > 0) overrides = { risoShift: legacy.risoShift, risoAngle: legacy.risoAngle };
        break;
      case 'glitch':
        if (legacy.glitch > 0) overrides = { glitch: legacy.glitch };
        break;
      case 'ca':
        if (legacy.ca > 0) overrides = { ca: legacy.ca };
        break;
      case 'rgbSplit':
        if (legacy.rgbSplit > 0) overrides = { rgbSplit: legacy.rgbSplit };
        break;
      case 'dataMosh':
        if (legacy.dataMosh > 0) overrides = { dataMosh: legacy.dataMosh };
        break;
      case 'interlace':
        if (legacy.interlace > 0) overrides = { interlace: legacy.interlace };
        break;
      case 'scanlines':
        if (legacy.scanlines > 0) overrides = { scanlines: legacy.scanlines };
        break;
      case 'rays':
        if (legacy.rays > 0) overrides = { rays: legacy.rays, rayInt: legacy.rayInt, rayColor: legacy.rayColor };
        break;
      case 'bloom':
        if (legacy.bloom > 0) overrides = { bloom: legacy.bloom };
        break;
      case 'filmBurn':
        if (legacy.filmBurn > 0) overrides = { filmBurn: legacy.filmBurn };
        break;
      case 'grain':
        if (legacy.grain > 0) overrides = { grain: legacy.grain };
        break;
      case 'vignette':
        if (legacy.vignette > 0) overrides = { vignette: legacy.vignette };
        break;
    }
    if (overrides) {
      layers.push(buildPresetLayer(preset, overrides, idx++));
    }
  }
  return layers;
}

const files = readdirSync(DIR).filter((f) => f.endsWith('.json'));
for (const file of files) {
  const path = join(DIR, file);
  const data = JSON.parse(readFileSync(path, 'utf-8'));
  const newLayers = [];
  for (const layer of data.layers) {
    if (layer.kind === 'effect' && !layer.preset) {
      const decomposed = decompose(layer);
      newLayers.push(...decomposed);
    } else {
      newLayers.push(layer);
    }
  }
  const out = { ...data, layers: newLayers };
  writeFileSync(path, JSON.stringify(out, null, 2) + '\n');
  console.log(`${file}: ${data.layers.length} → ${newLayers.length} layers`);
}

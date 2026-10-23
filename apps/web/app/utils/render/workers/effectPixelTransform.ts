import {
  applyBleachBypass,
  applyChannelMixer,
  applyColorPass,
  applyCyanotype,
  applyGradientMap,
  applyIndexedPalette,
  applyRgbSplit,
  applySolarize,
  applySplitTone,
} from './effectPixelColor';
import {
  applyBokehBlur,
  applyEdgeCrush,
  applyFog,
  applyGooeyMerge,
  applyHatching,
  applyKaleidoscope,
  applyPatternRefraction,
  applyPixelStretch,
  applyRipple,
  applySilhouetteCrush,
  applySqueeze,
  applyVhsTracking,
  applyWave,
} from './effectPixelSpatial';
import type { EffectPixelTransformRequest, EffectPixelTransformResult } from './effectPixelTypes';

export type * from './effectPixelTypes';

export function transformEffectPixels({
  width,
  height,
  data,
  operations,
}: EffectPixelTransformRequest): EffectPixelTransformResult {
  let current = data;

  for (const operation of operations) {
    if (operation.type === 'rgbSplit') {
      applyRgbSplit(current, width, height, operation.amount);
    } else if (operation.type === 'colorPass') {
      applyColorPass(current, width, height, operation);
    } else if (operation.type === 'indexedPalette') {
      applyIndexedPalette(current, operation.amount, operation.colors);
    } else if (operation.type === 'gradientMap') {
      applyGradientMap(current, operation.amount, operation.shadow, operation.mid, operation.highlight);
    } else if (operation.type === 'channelMixer') {
      applyChannelMixer(current, operation.amount, operation.redMix, operation.greenMix, operation.blueMix);
    } else if (operation.type === 'edgeCrush') {
      applyEdgeCrush(current, width, height, operation.amount);
    } else if (operation.type === 'silhouetteCrush') {
      current = applySilhouetteCrush(current, width, height, operation.amount);
    } else if (operation.type === 'bokehBlur') {
      current = applyBokehBlur(current, width, height, operation.amount, operation.threshold);
    } else if (operation.type === 'hatching') {
      applyHatching(current, width, height, operation.amount, operation.scale, operation.angle);
    } else if (operation.type === 'pixelStretch') {
      current = applyPixelStretch(current, width, height, operation.amount, operation.length, operation.angle);
    } else if (operation.type === 'patternRefraction') {
      current = applyPatternRefraction(current, width, height, operation.amount, operation.scale, operation.angle);
    } else if (operation.type === 'gooeyMerge') {
      current = applyGooeyMerge(current, width, height, operation.amount, operation.radius, operation.threshold);
    } else if (operation.type === 'vhsTracking') {
      current = applyVhsTracking(current, width, height, operation.amount, operation.seed);
    } else if (operation.type === 'wave') {
      current = applyWave(current, width, height, operation.amount, operation.frequency, operation.scale);
    } else if (operation.type === 'solarize') {
      applySolarize(current, operation.amount);
    } else if (operation.type === 'bleachBypass') {
      applyBleachBypass(current, operation.amount);
    } else if (operation.type === 'cyanotype') {
      applyCyanotype(current, operation.amount);
    } else if (operation.type === 'splitTone') {
      applySplitTone(current, operation.amount, operation.shadow, operation.highlight);
    } else if (operation.type === 'ripple') {
      current = applyRipple(current, width, height, operation.amount, operation.frequency, operation.scale);
    } else if (operation.type === 'kaleidoscope') {
      current = applyKaleidoscope(current, width, height, operation.amount);
    } else if (operation.type === 'squeeze') {
      current = applySqueeze(current, width, height, operation.x, operation.y);
    } else {
      applyFog(current, operation.amount, operation.color);
    }
  }

  return { width, height, data: current };
}

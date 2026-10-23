export type EffectPixelTransformOp =
  | { type: 'rgbSplit'; amount: number }
  | { type: 'colorPass'; sepia: number; infrared: number; ca: number; dither: number }
  | { type: 'indexedPalette'; amount: number; colors: string[] }
  | { type: 'gradientMap'; amount: number; shadow: string; mid: string; highlight: string }
  | { type: 'channelMixer'; amount: number; redMix: number; greenMix: number; blueMix: number }
  | { type: 'edgeCrush'; amount: number }
  | { type: 'silhouetteCrush'; amount: number }
  | { type: 'bokehBlur'; amount: number; threshold: number }
  | { type: 'hatching'; amount: number; scale: number; angle: number }
  | { type: 'pixelStretch'; amount: number; length: number; angle: number }
  | { type: 'patternRefraction'; amount: number; scale: number; angle: number }
  | { type: 'gooeyMerge'; amount: number; radius: number; threshold: number }
  | { type: 'vhsTracking'; amount: number; seed: number }
  | { type: 'wave'; amount: number; frequency: number; scale: number }
  | { type: 'solarize'; amount: number }
  | { type: 'bleachBypass'; amount: number }
  | { type: 'cyanotype'; amount: number }
  | { type: 'splitTone'; amount: number; shadow: string; highlight: string }
  | { type: 'ripple'; amount: number; frequency: number; scale: number }
  | { type: 'kaleidoscope'; amount: number }
  | { type: 'squeeze'; x: number; y: number }
  | { type: 'fog'; amount: number; color: string };

export type EffectPixelTransformRequest = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  operations: EffectPixelTransformOp[];
};

export type EffectPixelTransformResult = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};

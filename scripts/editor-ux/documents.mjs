// Reference documents for the editor UX baseline. `default` is the document a first visit opens (no stored
// document); `effect-stack` is a linear document that mixes Canvas 2D and GPU-backed effects.

function layer(id, name, kind, patch) {
  return { id, name, kind, visible: true, locked: false, opacity: 100, blendMode: 'normal', ...patch };
}

const EFFECT_STACK = {
  schemaVersion: 1,
  global: { bg: '#101018', seed: 4242, aspect: '1:1' },
  layers: [
    layer('ux-fill', 'Backdrop', 'fill', { color: '#2a1140' }),
    layer('ux-title', 'Title', 'text', {
      content: 'UX',
      font: 'DISPLAY',
      size: 180,
      color: '#f8f1e8',
      x: 0.5,
      y: 0.5,
      align: 'center',
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
    }),
    layer('ux-bloom', 'Bloom', 'effect', { preset: 'bloom', bloom: 38 }),
    layer('ux-scanlines', 'Scanlines', 'effect', { preset: 'scanlines', scanlines: 24, scanlineWidth: 2 }),
    layer('ux-grain', 'Grain', 'effect', { preset: 'grain', grain: 34 }),
    layer('ux-rgb', 'RGB Split', 'effect', { preset: 'rgbSplit', rgbSplit: 8 }),
    layer('ux-halftone', 'Halftone', 'effect', { preset: 'halftone', halftone: 16 }),
    layer('ux-vignette', 'Vignette', 'effect', { preset: 'vignette', vignette: 46 }),
  ],
  export: { format: 'png', scale: 1, target: 'cover' },
};

/** `doc: null` opens the app default; `sliderLayerId` is the layer whose first slider the latency pass edits. */
export const REFERENCE_DOCUMENTS = [
  { name: 'default', doc: null, sliderLayerId: 'default-scanlines' },
  { name: 'effect-stack', doc: EFFECT_STACK, sliderLayerId: 'ux-scanlines' },
];

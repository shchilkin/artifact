import { describe, expect, it } from 'vitest';

import {
  makeEffectPresetLayer,
  makeEmojiLayer,
  makeFillLayer,
  makeImageLayer,
  makeSourceLayer,
  makeTextLayer,
} from '../../../types/config';
import {
  colorNodeRenderSig,
  edgeRenderSig,
  grimeShadowNodeRenderSig,
  layerRenderSig,
  maskNodeRenderSig,
  mergeNodeRenderSig,
  repeatNodeRenderSig,
  transformNodeRenderSig,
} from '../../../utils/renderSignature';

describe('layerRenderSig', () => {
  it('ignores layer identity and editor-only metadata', () => {
    const base = makeTextLayer({
      id: 'text-1',
      name: 'Title',
      locked: false,
      content: 'ARTIFACT',
    });
    const renamed = {
      ...base,
      id: 'text-2',
      name: 'Renamed title',
      locked: true,
    };

    expect(layerRenderSig(renamed)).toBe(layerRenderSig(base));
  });

  it('changes when text render fields change', () => {
    const base = makeTextLayer({ content: 'ARTIFACT' });
    const edited = { ...base, content: 'SIGNAL' };

    expect(layerRenderSig(edited)).not.toBe(layerRenderSig(base));
  });

  it('changes when fill render fields change', () => {
    const base = makeFillLayer({ color: '#ff0000' });
    const edited = { ...base, color: '#00ff00' };

    expect(layerRenderSig(edited)).not.toBe(layerRenderSig(base));
  });

  it('ignores AI image generation provenance for image layers', () => {
    const base = makeImageLayer('artifact-asset://generated', {
      aiGeneration: { prompt: 'misty album cover' },
    });
    const edited = {
      ...base,
      aiGeneration: { prompt: 'different provenance note', provider: 'openai' },
    };

    expect(layerRenderSig(edited)).toBe(layerRenderSig(base));
  });

  it('ignores editor-only metadata for effect layers', () => {
    const base = makeEffectPresetLayer('grain', {
      id: 'effect-1',
      name: 'Effect',
      locked: false,
      grain: 20,
    });
    const renamed = {
      ...base,
      id: 'effect-2',
      name: 'Renamed effect',
      locked: true,
    };

    expect(layerRenderSig(renamed)).toBe(layerRenderSig(base));
  });

  it('keeps procedural render fields in the signature', () => {
    const base = makeSourceLayer('primitive', { primitiveDepth: 30 });
    const edited = { ...base, primitiveDepth: 70 };

    expect(layerRenderSig(edited)).not.toBe(layerRenderSig(base));
  });

  it('keeps line field render fields in the signature', () => {
    const base = makeSourceLayer('lineField', { lineFieldStrength: 0 });
    const edited = { ...base, lineFieldStrength: 42 };

    expect(layerRenderSig(edited)).not.toBe(layerRenderSig(base));
  });

  it('ignores line field placement fields because line fields render full-frame', () => {
    const base = makeSourceLayer('lineField');
    const edited = { ...base, x: 0.2, y: 0.7, scaleX: 0.25, scaleY: 0.3, rotation: 35 };

    expect(layerRenderSig(edited)).toBe(layerRenderSig(base));
  });

  it('changes when emoji seed offset changes', () => {
    const base = makeEmojiLayer({ seedOffset: 0 });
    const edited = { ...base, seedOffset: 12 };

    expect(layerRenderSig(edited)).not.toBe(layerRenderSig(base));
  });

  it('changes when effect seed offset changes', () => {
    const base = makeEffectPresetLayer('grain', { seedOffset: 0 });
    const edited = { ...base, seedOffset: 12 };

    expect(layerRenderSig(edited)).not.toBe(layerRenderSig(base));
  });
});

describe('graph node render signatures', () => {
  it('ignores merge node identity and name', () => {
    const base = { id: 'merge-1', name: 'Merge', blendMode: 'source-over', opacity: 100 };
    const renamed = { ...base, id: 'merge-2', name: 'Renamed merge' };

    expect(mergeNodeRenderSig(renamed)).toBe(mergeNodeRenderSig(base));
  });

  it('changes when merge render fields change', () => {
    const base = { id: 'merge-1', name: 'Merge', blendMode: 'source-over', opacity: 100 };
    const edited = { ...base, opacity: 50 };

    expect(mergeNodeRenderSig(edited)).not.toBe(mergeNodeRenderSig(base));
  });

  it('ignores color node identity and name', () => {
    const base = {
      id: 'color-1',
      name: 'Color',
      contrast: 100,
      brightness: 100,
      saturation: 100,
      hue: 0,
    };
    const renamed = { ...base, id: 'color-2', name: 'Renamed color' };

    expect(colorNodeRenderSig(renamed)).toBe(colorNodeRenderSig(base));
  });

  it('changes when color render fields change', () => {
    const base = {
      id: 'color-1',
      name: 'Color',
      contrast: 100,
      brightness: 100,
      saturation: 100,
      hue: 0,
    };
    const edited = { ...base, hue: 45 };

    expect(colorNodeRenderSig(edited)).not.toBe(colorNodeRenderSig(base));
  });

  it('ignores repeat node identity and changes for repeat fields', () => {
    const base = {
      id: 'repeat-1',
      name: 'Repeater',
      pattern: 'grid' as const,
      count: 4,
      rows: 3,
      gap: 24,
      radius: 80,
      scale: 50,
      jitter: 0,
      rotation: 0,
      seedOffset: 0,
      opacity: 100,
      blendMode: 'source-over',
    };
    const renamed = { ...base, id: 'repeat-2', name: 'Renamed repeat' };
    const edited = { ...base, rotationMode: 'step' as const, rotationStep: 22 };

    expect(repeatNodeRenderSig(renamed)).toBe(repeatNodeRenderSig(base));
    expect(repeatNodeRenderSig(edited)).not.toBe(repeatNodeRenderSig(base));
  });

  it('ignores mask node identity and changes for mask fields', () => {
    const base = {
      id: 'mask-1',
      name: 'Mask',
      mode: 'alpha' as const,
      invert: false,
      threshold: 50,
      feather: 0,
      expand: 0,
      opacity: 100,
    };
    const renamed = { ...base, id: 'mask-2', name: 'Renamed mask' };
    const edited = { ...base, mode: 'threshold' as const, threshold: 65 };

    expect(maskNodeRenderSig(renamed)).toBe(maskNodeRenderSig(base));
    expect(maskNodeRenderSig(edited)).not.toBe(maskNodeRenderSig(base));
  });

  it('ignores transform node identity and changes for transform fields', () => {
    const base = {
      id: 'transform-1',
      name: 'Transform',
      x: 0,
      y: 0,
      scaleX: 100,
      scaleY: 100,
      uniformScale: true,
      rotation: 0,
      pivotMode: 'canvas' as const,
      opacity: 100,
    };
    const renamed = { ...base, id: 'transform-2', name: 'Renamed transform' };
    const edited = { ...base, x: 18, rotation: 45 };
    const scaleLockChanged = { ...base, uniformScale: false };
    const pivotChanged = { ...base, pivotMode: 'visible' as const };

    expect(transformNodeRenderSig(renamed)).toBe(transformNodeRenderSig(base));
    expect(transformNodeRenderSig(scaleLockChanged)).toBe(transformNodeRenderSig(base));
    expect(transformNodeRenderSig(pivotChanged)).not.toBe(transformNodeRenderSig(base));
    expect(transformNodeRenderSig(edited)).not.toBe(transformNodeRenderSig(base));
  });

  it('ignores grime shadow node identity and changes for render fields', () => {
    const base = {
      id: 'shadow-1',
      name: 'Grime Shadow',
      x: 8,
      y: 10,
      layers: 5,
      blur: 10,
      spread: 14,
      grime: 45,
      jitter: 10,
      opacity: 58,
      color: '#090606',
      seedOffset: 0,
      shadowOnly: false,
    };
    const renamed = { ...base, id: 'shadow-2', name: 'Renamed shadow' };
    const edited = { ...base, grime: 80, shadowOnly: true };

    expect(grimeShadowNodeRenderSig(renamed)).toBe(grimeShadowNodeRenderSig(base));
    expect(grimeShadowNodeRenderSig(edited)).not.toBe(grimeShadowNodeRenderSig(base));
  });
});

describe('edgeRenderSig', () => {
  it('ignores edge id but changes for topology', () => {
    const base = { id: 'edge-1', fromId: 'fill-1', fromPort: 'out' as const, toId: 'text-1', toPort: 'bg' as const };
    const renamed = { ...base, id: 'edge-2' };
    const rerouted = { ...base, toPort: 'in' as const };

    expect(edgeRenderSig(renamed)).toBe(edgeRenderSig(base));
    expect(edgeRenderSig(rerouted)).not.toBe(edgeRenderSig(base));
  });
});

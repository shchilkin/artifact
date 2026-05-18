import { describe, expect, it } from 'vitest';

import { makeEffectPresetLayer, makeFillLayer, makeSourceLayer, makeTextLayer } from '../../../types/config';
import {
  colorNodeRenderSig,
  edgeRenderSig,
  layerRenderSig,
  mergeNodeRenderSig,
  repeatNodeRenderSig,
} from './renderSignature';

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
    const edited = { ...base, seedOffset: 12 };

    expect(repeatNodeRenderSig(renamed)).toBe(repeatNodeRenderSig(base));
    expect(repeatNodeRenderSig(edited)).not.toBe(repeatNodeRenderSig(base));
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

import { describe, expect, it } from 'vitest';
import { makeEffectPresetLayer, makeImageLayer, makeSourceLayer, makeTextLayer } from '../../types/config';
import { getLayerControlSections, layerHasPlacementControls } from './controlModel';

describe('layer control model', () => {
  it('keeps text and image placement as durable controls', () => {
    expect(getLayerControlSections(makeTextLayer()).map((section) => section.id)).toEqual([
      'content',
      'placement',
      'style',
    ]);
    expect(layerHasPlacementControls(makeImageLayer('data:image/png;base64,'))).toBe(true);
  });

  it('keeps primitive placement out of durable controls', () => {
    const primitive = makeSourceLayer('primitive');

    expect(getLayerControlSections(primitive).map((section) => section.id)).toEqual(['content', 'structure', 'style']);
    expect(layerHasPlacementControls(primitive)).toBe(false);
  });

  it('keeps procedural source placement separate from primitive camera controls', () => {
    expect(layerHasPlacementControls(makeSourceLayer('noise'))).toBe(true);
    expect(layerHasPlacementControls(makeSourceLayer('array'))).toBe(true);
  });

  it('models effect controls as their own inspector surface', () => {
    expect(getLayerControlSections(makeEffectPresetLayer('grain'))).toEqual([{ id: 'effect', title: 'Effect' }]);
  });
});

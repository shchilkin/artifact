import { describe, expect, it } from 'vitest';
import { makeEffectPresetLayer, makeImageLayer, makeSourceLayer, makeTextLayer } from '../../types/config';
import { getLayerControlSections, layerHasPlacementControls } from './controlModel';
import { BLEND_MODE_HELP, BLEND_OPTIONS } from './fieldDefs';

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

  it('keeps only transformable procedural sources in placement controls', () => {
    expect(getLayerControlSections(makeSourceLayer('noise')).map((section) => section.id)).toEqual([
      'content',
      'structure',
      'style',
    ]);
    expect(layerHasPlacementControls(makeSourceLayer('noise'))).toBe(false);
    expect(layerHasPlacementControls(makeSourceLayer('array'))).toBe(true);
  });

  it('keeps imported model framing out of durable placement controls', () => {
    expect(getLayerControlSections(makeSourceLayer('model')).map((section) => section.id)).toEqual([
      'content',
      'structure',
      'style',
    ]);
    expect(getLayerControlSections(makeSourceLayer('model')).map((section) => section.title)).toContain('Model');
    expect(layerHasPlacementControls(makeSourceLayer('model'))).toBe(false);
  });

  it('models effect controls as their own inspector surface', () => {
    expect(getLayerControlSections(makeEffectPresetLayer('grain'))).toEqual([{ id: 'effect', title: 'Effect' }]);
  });

  it('documents every blend mode surfaced by the controls', () => {
    for (const mode of BLEND_OPTIONS) {
      expect(BLEND_MODE_HELP[mode]).toContain('.');
    }
  });
});

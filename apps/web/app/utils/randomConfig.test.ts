import { describe, expect, it } from 'vitest';
import { DOCUMENT_SCHEMA_VERSION, EFFECT_PRESETS } from '../types/config';
import { RANDOM_FORMULA_IDS, randomDocument, randomDocumentForFormula } from './randomConfig';

function expectValidTextAndEffectLayers(doc: ReturnType<typeof randomDocument>) {
  const textLayers = doc.layers.filter((layer) => layer.kind === 'text');
  const effectLayers = doc.layers.filter((layer) => layer.kind === 'effect');
  expect(textLayers.every((layer) => layer.content.trim().length > 0)).toBe(true);
  expect(effectLayers.every((layer) => layer.kind === 'effect' && layer.preset && layer.preset in EFFECT_PRESETS)).toBe(
    true,
  );
}

describe('randomDocument', () => {
  it('returns a CanvasDocument with global and layers', () => {
    const doc = randomDocument();
    expect(doc.schemaVersion).toBe(DOCUMENT_SCHEMA_VERSION);
    expect(doc).toHaveProperty('global');
    expect(doc).toHaveProperty('layers');
  });

  it('global has bg, seed, and aspect', () => {
    const doc = randomDocument();
    expect(doc.global).toHaveProperty('bg');
    expect(doc.global).toHaveProperty('seed');
    expect(doc.global).toHaveProperty('aspect');
  });

  it('layers is a non-empty array with at least one layer', () => {
    const doc = randomDocument();
    expect(Array.isArray(doc.layers)).toBe(true);
    expect(doc.layers.length).toBeGreaterThanOrEqual(1);
  });

  it('starts from one of the v2 random formula source layers', () => {
    const doc = randomDocument();
    expect(['fill', 'image', 'emoji', 'noise']).toContain(doc.layers[0].kind);
  });

  it('adds valid text layers when a formula includes type and focused effect preset layers', () => {
    const doc = randomDocument();
    expectValidTextAndEffectLayers(doc);
  });

  it('can build each v2 random formula as a valid document', () => {
    for (const formula of RANDOM_FORMULA_IDS) {
      const doc = randomDocumentForFormula(formula, 12000 + RANDOM_FORMULA_IDS.indexOf(formula));

      expect(doc.schemaVersion).toBe(DOCUMENT_SCHEMA_VERSION);
      expect(doc.layers.length).toBeGreaterThanOrEqual(4);
      expectValidTextAndEffectLayers(doc);
    }
  });

  it('covers image, type, texture, and print-damage formula shapes', () => {
    const imagePoster = randomDocumentForFormula('imagePoster', 1001);
    const typePoster = randomDocumentForFormula('typePoster', 1002);
    const texturePlate = randomDocumentForFormula('texturePlate', 1003);
    const printDamage = randomDocumentForFormula('printDamage', 1004);

    expect(imagePoster.layers.some((layer) => layer.kind === 'image')).toBe(true);
    expect(typePoster.layers.filter((layer) => layer.kind === 'text').length).toBeGreaterThanOrEqual(3);
    expect(texturePlate.layers.some((layer) => layer.kind === 'noise')).toBe(true);
    expect(printDamage.layers.some((layer) => layer.kind === 'effect' && layer.preset === 'halftone')).toBe(true);
  });
});

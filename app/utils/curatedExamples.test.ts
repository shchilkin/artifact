import { describe, expect, it } from 'vitest';
import { CURATED_EXAMPLES } from './curatedExamples';
import { renderDocument } from './renderer';
import { GRAPH_RECIPE_STARTER_DOCUMENTS, getStarterDocument, TEXTURE_TYPE_STACK_STARTER } from './starterDocuments';

describe('CURATED_EXAMPLES', () => {
  it('contains unique example ids', () => {
    const ids = CURATED_EXAMPLES.map((example) => example.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('includes the layer-first starter document', () => {
    expect(CURATED_EXAMPLES.some((example) => example.id === TEXTURE_TYPE_STACK_STARTER.id)).toBe(true);
  });

  it('includes graph recipe starters as editable documents', () => {
    for (const starter of GRAPH_RECIPE_STARTER_DOCUMENTS) {
      const example = CURATED_EXAMPLES.find((item) => item.id === starter.id);
      expect(example?.category, starter.id).toBe('Graph recipe');
      expect(example?.doc.graph, starter.id).toBeTruthy();
      expect(getStarterDocument(starter.id)?.doc.graph, starter.id).toBeTruthy();
    }
  });

  it('defines teaching metadata for every curated example', () => {
    for (const example of CURATED_EXAMPLES) {
      expect(example.category, example.id).toBeTruthy();
      expect(example.summary.length, example.id).toBeGreaterThan(24);
      expect(example.startCopy.length, example.id).toBeGreaterThan(24);
      expect(example.usedNodes.length, example.id).toBeGreaterThanOrEqual(3);
    }
  });

  it('renders every curated document in smoke mode', async () => {
    for (const example of CURATED_EXAMPLES) {
      const canvas = await renderDocument(example.doc, 160, 160, new Map(), {
        draft: true,
        skipEffects: true,
      });
      expect(canvas.width, example.id).toBe(160);
      expect(canvas.height, example.id).toBe(160);
    }
  });
});

import { describe, expect, it } from 'vitest';
import { CURATED_EXAMPLES } from './curatedExamples';
import { renderDocument } from './renderer';
import { TEXTURE_TYPE_STACK_STARTER } from './starterDocuments';

describe('CURATED_EXAMPLES', () => {
  it('contains unique example ids', () => {
    const ids = CURATED_EXAMPLES.map((example) => example.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('includes the layer-first starter document', () => {
    expect(CURATED_EXAMPLES.some((example) => example.id === TEXTURE_TYPE_STACK_STARTER.id)).toBe(true);
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

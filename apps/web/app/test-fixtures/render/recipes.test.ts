import { describe, expect, it } from 'vitest';
import { DEFAULT_DOCUMENT, makeDocument } from '../../types/config';
import { EXPORT_NODE_ID } from '../../utils/nodeGraph';
import { insertRecipeInDocument, RECIPES } from '../../utils/recipes';
import { collectGraphRenderReach } from '../../utils/render/graphInputs';
import { renderDocument } from '../../utils/renderer';

let counter = 0;
const createId = (base: string) => `${base}-test-${(counter += 1)}`;

const empty = makeDocument({
  global: { bg: 'transparent', seed: 1, aspect: '1:1' },
  layers: [],
  export: { format: 'png', scale: 1, target: 'cover' },
});

describe('recipes', () => {
  it.each(RECIPES.map((recipe) => recipe.id))('inserts %s as a wired, rendering graph', async (id) => {
    const { doc, outputId } = insertRecipeInDocument(empty, id, { x: 100, y: 200 }, createId);
    const nodeIds = new Set([...doc.layers.map((layer) => layer.id), ...Object.keys(doc.graph.nodes), EXPORT_NODE_ID]);

    for (const edge of doc.graph.edges) {
      expect(nodeIds.has(edge.fromId), edge.id).toBe(true);
      expect(nodeIds.has(edge.toId), edge.id).toBe(true);
    }
    expect(outputId).not.toBeNull();
    expect(doc.graph.edges).toContainEqual(expect.objectContaining({ fromId: outputId, toId: EXPORT_NODE_ID }));
    expect(doc.graph.areas).toHaveLength(1);
    const placed = Object.entries(doc.graph.positions)
      .filter(([id]) => !(id in empty.graph.positions))
      .map(([, point]) => point);
    expect(Math.min(...placed.map((point) => point.x))).toBe(100);
    expect(Math.min(...placed.map((point) => point.y))).toBe(200);
    // Everything the recipe added reaches its output.
    const reach = collectGraphRenderReach(doc, doc.graph);
    expect(doc.layers.filter((layer) => !reach.has(layer.id)).map((layer) => layer.id)).toEqual([]);

    const canvas = await renderDocument(doc, 60, 60, new Map(), { skipEffects: true });
    const pixels = canvas.getContext('2d')!.getImageData(0, 0, 60, 60).data;
    expect(pixels.some((value, index) => index % 4 === 3 && value > 0)).toBe(true);
  });

  it('leaves a connected Output alone and keeps the existing graph', () => {
    const before = DEFAULT_DOCUMENT;
    const { doc, outputId } = insertRecipeInDocument(before, 'photo-type', { x: 0, y: 0 }, createId);
    const outputEdges = doc.graph.edges.filter((edge) => edge.toId === EXPORT_NODE_ID);

    expect(outputEdges).toEqual(before.graph.edges.filter((edge) => edge.toId === EXPORT_NODE_ID));
    expect(doc.graph.edges.slice(0, before.graph.edges.length)).toEqual(before.graph.edges);
    expect(doc.layers.slice(0, before.layers.length)).toEqual(before.layers);
    expect(doc.graph.edges.some((edge) => edge.fromId === outputId && edge.toId === EXPORT_NODE_ID)).toBe(false);
  });

  it('gives every inserted node a new id', () => {
    const first = insertRecipeInDocument(empty, 'noise-matte', { x: 0, y: 0 }, createId).doc;
    const second = insertRecipeInDocument(first, 'noise-matte', { x: 400, y: 0 }, createId).doc;
    const ids = [...second.layers.map((layer) => layer.id), ...Object.keys(second.graph.nodes)];
    expect(new Set(ids).size).toBe(ids.length);
  });
});

import { describe, expect, it } from 'vitest';

import { makeEffectPresetLayer, makeTextLayer } from '../../types/config';
import { EXPORT_NODE_ID } from '../../utils/nodeGraph';
import { collectDocumentOutputNodeIds, collectGraphRenderReach } from '../../utils/renderer';
import { documentFor, edge, fill, GRAPH_REACH_FIXTURES, graph, renderedNodeIds } from './graphReachFixtures';

describe('collectGraphRenderReach', () => {
  for (const fixture of GRAPH_REACH_FIXTURES) {
    it(`matches the nodes the renderer visits: ${fixture.name}`, async () => {
      const doc = documentFor(fixture.layers, fixture.graph);
      const reach = collectGraphRenderReach(doc, fixture.graph);
      const rendered = await renderedNodeIds(doc, fixture.graph);
      const readOnly = new Set(fixture.readOnly ?? []);

      expect([...reach].filter((id) => !readOnly.has(id)).sort()).toEqual([...rendered].sort());
      for (const id of readOnly) expect(reach.has(id)).toBe(true);
    });
  }

  it('keeps every link of a GPU-only effect chain the renderer collapses into one pass', () => {
    const layers = [
      fill('base'),
      makeEffectPresetLayer('grain', { id: 'grain' }),
      makeEffectPresetLayer('grain', { id: 'grain-2' }),
    ];
    const canvasGraph = graph([
      edge('base', 'grain', 'in'),
      edge('grain', 'grain-2', 'in'),
      edge('grain-2', EXPORT_NODE_ID, 'in'),
    ]);
    expect([...collectGraphRenderReach(documentFor(layers, canvasGraph), canvasGraph)].sort()).toEqual(
      [EXPORT_NODE_ID, 'base', 'grain', 'grain-2'].sort(),
    );
  });
});

describe('collectDocumentOutputNodeIds', () => {
  it('counts every layer of a document without a graph, like the stack renderer', () => {
    const doc = documentFor([fill('a'), makeTextLayer({ id: 'b' })]);
    expect(collectDocumentOutputNodeIds(doc)).toEqual(new Set([EXPORT_NODE_ID, 'a', 'b']));
  });

  it('follows the document graph when there is one', () => {
    const doc = documentFor([fill('a'), fill('loose')], graph([edge('a', EXPORT_NODE_ID, 'in')]));
    expect(collectDocumentOutputNodeIds(doc).has('loose')).toBe(false);
  });
});

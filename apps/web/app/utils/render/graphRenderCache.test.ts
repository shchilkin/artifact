import { describe, expect, it } from 'vitest';

import { type CanvasDocument, makeFillLayer } from '../../types/config';
import { renderGraphTarget } from '../renderer';

describe('graph render cache pruning', () => {
  it('evicts the least recently used entry, not the oldest one', async () => {
    const layers = ['a', 'b', 'c'].map((id) => makeFillLayer({ id, color: '#336699' }));
    const graph = { edges: [], positions: {}, mergeNodes: [], colorNodes: [] };
    const doc: CanvasDocument = {
      global: { bg: '#000000', seed: 1, aspect: '1:1' },
      layers,
      graph,
      export: { format: 'png', scale: 1, target: 'cover' },
    };
    const entries = new Map<string, Promise<HTMLCanvasElement>>();
    const cache = { namespace: 'lru', entries, entryKey: (id: string) => id, limit: 2 };
    const render = (id: string) => renderGraphTarget(doc, graph, id, 8, 8, new Map(), {}, cache);

    await render('a');
    await render('b');
    await render('a');
    await render('c');

    expect([...entries.keys()]).toEqual(['lru:a', 'lru:c']);
  });
});

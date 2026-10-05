import { describe, expect, it } from 'vitest';

import type { CanvasDocument, GraphEdge } from '../../types/config';
import {
  makeFillLayer,
  makeGraphMaskNode,
  makeGraphMergeNode,
  makeGraphRepeatNode,
  makeTextLayer,
} from '../../types/config';
import { buildGraphLayerTree } from '../../utils/graphLayerTree';
import { EXPORT_NODE_ID } from '../../utils/nodeGraph';
import {
  defaultFolderCollapsed,
  graphTreeAncestorFolders,
  graphTreeLayerOrder,
  NOT_IN_OUTPUT_KEY,
  visibleGraphTreeItems,
} from './graphTreeItems';

function edge(fromId: string, toId: string, toPort: GraphEdge['toPort']): GraphEdge {
  return { id: `${fromId}-${toId}-${toPort}`, fromId, fromPort: 'out', toId, toPort };
}

// Output ← merge(a: base, b: mask(in: title, mask: matte)); `orphan` is not connected.
const doc: CanvasDocument = {
  global: { bg: '#000000', seed: 1, aspect: '1:1' },
  layers: [
    makeFillLayer({ id: 'base', name: 'Base' }),
    makeTextLayer({ id: 'title', name: 'Title' }),
    makeTextLayer({ id: 'matte', name: 'Matte' }),
    makeFillLayer({ id: 'orphan', name: 'Orphan' }),
  ],
  graph: {
    edges: [
      edge('base', 'merge', 'a'),
      edge('title', 'mask', 'in'),
      edge('matte', 'mask', 'mask'),
      edge('mask', 'merge', 'b'),
      edge('merge', EXPORT_NODE_ID, 'in'),
    ],
    positions: {},
    mergeNodes: [makeGraphMergeNode({ id: 'merge', name: 'Group' })],
    colorNodes: [],
    maskNodes: [makeGraphMaskNode({ id: 'mask' })],
    repeatNodes: [makeGraphRepeatNode({ id: 'unused-repeat' })],
  },
  export: { format: 'png', scale: 1, target: 'cover' },
};
const tree = buildGraphLayerTree(doc);

function outline(items: ReturnType<typeof visibleGraphTreeItems>) {
  return items.map((item) => {
    const name = item.type === 'row' ? item.row.nodeId : item.label;
    const state = item.expanded === undefined ? '' : item.expanded ? ' [-]' : ' [+]';
    return `${'  '.repeat(item.level - 1)}${name}${state}`;
  });
}

describe('visibleGraphTreeItems', () => {
  it('nests merge stacks, mask clips, and the Not in output section', () => {
    expect(outline(visibleGraphTreeItems(tree, new Map(), false))).toEqual([
      'merge [-]',
      '  mask [-]',
      '    Mask [-]',
      '      matte',
      '  title',
      'base',
      'Not in output [-]',
      '  orphan',
      '  unused-repeat',
    ]);
  });

  it('gives every item its tree position and parent', () => {
    const items = visibleGraphTreeItems(tree, new Map(), false);
    const title = items.find((item) => item.key === 'title')!;
    expect(title).toMatchObject({ level: 2, setSize: 2, posInSet: 2, parentKey: 'merge' });
    expect(items.find((item) => item.key === 'merge')).toMatchObject({ folderKey: 'merge:group' });
  });

  it('hides the rows of collapsed folders', () => {
    const collapse = new Map([
      ['merge:group', true],
      [NOT_IN_OUTPUT_KEY, true],
    ]);
    expect(outline(visibleGraphTreeItems(tree, collapse, false))).toEqual(['merge [+]', 'base', 'Not in output [+]']);
  });

  it('collapses nested folders and Not in output by default on narrow screens', () => {
    expect(defaultFolderCollapsed('merge:group', 1, true)).toBe(false);
    expect(defaultFolderCollapsed('mask:row', 2, true)).toBe(true);
    expect(defaultFolderCollapsed(NOT_IN_OUTPUT_KEY, 1, true)).toBe(true);
    expect(defaultFolderCollapsed('mask:row', 4, false)).toBe(false);
    expect(outline(visibleGraphTreeItems(tree, new Map(), true))).toEqual([
      'merge [-]',
      '  mask [+]',
      '  title',
      'base',
      'Not in output [+]',
    ]);
  });
});

describe('graphTreeAncestorFolders', () => {
  it('lists the folders to expand to reveal a full entry', () => {
    const ancestors = graphTreeAncestorFolders(tree);
    expect(ancestors.get('matte')).toEqual(['merge:group', 'mask:row', 'mask:mask']);
    expect(ancestors.get('base')).toEqual([]);
    expect(ancestors.get('orphan')).toEqual([NOT_IN_OUTPUT_KEY]);
  });
});

describe('graphTreeLayerOrder', () => {
  it('orders layers as the tree shows them', () => {
    const layerIds = new Set(doc.layers.map((layer) => layer.id));
    expect(graphTreeLayerOrder(tree, (id) => layerIds.has(id))).toEqual(['matte', 'title', 'base', 'orphan']);
  });
});

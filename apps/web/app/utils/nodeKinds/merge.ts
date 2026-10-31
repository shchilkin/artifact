import { type GraphNodeBase, type GraphNodeKindModel, newGraphNodeId } from './types';

export interface GraphMergeNode extends GraphNodeBase<'merge'> {
  blendMode: string;
  opacity: number;
}

export function makeGraphMergeNode(partial: Partial<Omit<GraphMergeNode, 'kind'>> = {}): GraphMergeNode {
  return {
    id: newGraphNodeId('merge'),
    name: 'Merge',
    blendMode: 'source-over',
    opacity: 100,
    ...partial,
    kind: 'merge',
  };
}

export const mergeNodeModel: GraphNodeKindModel<GraphMergeNode> = {
  kind: 'merge',
  label: 'Merge',
  description: 'Combines two upstream branches before sending pixels downstream.',
  make: makeGraphMergeNode,
  normalize: (stored) => ({ ...stored, kind: 'merge' }) as GraphMergeNode,
  inputs: () => [
    { port: 'a', role: 'primary', mode: 'render' },
    { port: 'b', role: 'overlay', mode: 'render' },
  ],
  insertion: () => ({ through: 'a' }),
  look: {
    canvasSymbol: '⊕',
    accent: 'var(--node-kind-merge)',
    edgeColor: 'oklch(74% 0.17 152)',
    layersIcon: '◇',
    layersLabel: 'merge',
  },
  library: {
    intent: 'structure',
    colorKind: 'merge',
    resultLabel: 'Adds merge node',
    entry: {
      label: 'Merge',
      symbol: '⊕',
      description: 'Blend two branches into one result.',
      group: 'utility',
      surfaces: ['nodes'],
      tags: ['utility', 'blend'],
      keywords: 'blend combine branches graph recipe',
    },
  },
  renderSignature: (node) => JSON.stringify([node.blendMode, node.opacity]),
};

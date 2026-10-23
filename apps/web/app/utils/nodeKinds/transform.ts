import { type GraphNodeBase, type GraphNodeKindModel, newGraphNodeId, SINGLE_INPUT, withDefaults } from './types';

export interface GraphTransformNode extends GraphNodeBase<'transform'> {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  uniformScale: boolean;
  rotation: number;
  pivotMode?: 'canvas' | 'visible';
  opacity: number;
}

const TRANSFORM_DEFAULTS = {
  x: 0,
  y: 0,
  scaleX: 100,
  scaleY: 100,
  uniformScale: true,
  rotation: 0,
  pivotMode: 'canvas',
  opacity: 100,
} as const satisfies Omit<GraphTransformNode, 'id' | 'name' | 'kind'>;

export function makeGraphTransformNode(partial: Partial<Omit<GraphTransformNode, 'kind'>> = {}): GraphTransformNode {
  return { id: newGraphNodeId('transform'), name: 'Transform', ...TRANSFORM_DEFAULTS, ...partial, kind: 'transform' };
}

export const transformNodeModel: GraphNodeKindModel<GraphTransformNode> = {
  kind: 'transform',
  label: 'Transform',
  description: 'Moves, scales, rotates, or fades a completed upstream branch.',
  make: makeGraphTransformNode,
  normalize: (stored) => ({ ...withDefaults<GraphTransformNode>(TRANSFORM_DEFAULTS, stored), kind: 'transform' }),
  inputs: () => SINGLE_INPUT,
  insertion: () => ({ through: 'in' }),
  look: {
    canvasSymbol: '↻',
    accent: 'var(--node-kind-color)',
    edgeColor: 'oklch(70% 0.17 265)',
    layersIcon: '↻',
    layersLabel: 'transform',
  },
  library: {
    intent: 'structure',
    colorKind: 'color',
    resultLabel: 'Adds transform node',
    entry: {
      label: 'Transform',
      symbol: '↻',
      description: 'Move, scale, rotate, and fade a completed upstream branch.',
      group: 'utility',
      surfaces: ['nodes'],
      tags: ['utility', 'transform'],
      keywords: 'transform rotate rotation move offset position scale resize opacity branch token',
    },
  },
  renderSignature: (node) =>
    JSON.stringify([node.x, node.y, node.scaleX, node.scaleY, node.rotation, node.pivotMode ?? 'canvas', node.opacity]),
};

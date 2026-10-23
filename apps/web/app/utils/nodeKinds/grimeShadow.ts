import { type GraphNodeBase, type GraphNodeKindModel, newGraphNodeId, SINGLE_INPUT, withDefaults } from './types';

export interface GraphGrimeShadowNode extends GraphNodeBase<'grimeShadow'> {
  x: number;
  y: number;
  layers: number;
  blur: number;
  spread: number;
  grime: number;
  jitter: number;
  opacity: number;
  color: string;
  seedOffset: number;
  shadowOnly: boolean;
}

const GRIME_SHADOW_DEFAULTS = {
  x: 8,
  y: 10,
  layers: 5,
  blur: 10,
  spread: 14,
  grime: 45,
  jitter: 10,
  opacity: 58,
  color: '#090606',
  seedOffset: 0,
  shadowOnly: false,
} as const satisfies Omit<GraphGrimeShadowNode, 'id' | 'name' | 'kind'>;

export function makeGraphGrimeShadowNode(
  partial: Partial<Omit<GraphGrimeShadowNode, 'kind'>> = {},
): GraphGrimeShadowNode {
  return {
    id: newGraphNodeId('grime-shadow'),
    name: 'Grime Shadow',
    ...GRIME_SHADOW_DEFAULTS,
    ...partial,
    kind: 'grimeShadow',
  };
}

export const grimeShadowNodeModel: GraphNodeKindModel<GraphGrimeShadowNode> = {
  kind: 'grimeShadow',
  label: 'Grime Shadow',
  description: 'Builds a layered dirty shadow from the visible alpha of an upstream branch.',
  make: makeGraphGrimeShadowNode,
  normalize: (stored) => ({
    ...withDefaults<GraphGrimeShadowNode>(GRIME_SHADOW_DEFAULTS, stored),
    kind: 'grimeShadow',
  }),
  inputs: () => SINGLE_INPUT,
  insertion: () => ({ through: 'in' }),
  look: {
    canvasSymbol: '◖',
    accent: 'var(--node-kind-effect)',
    edgeColor: 'oklch(72% 0.18 35)',
    layersIcon: '◖',
    layersLabel: 'shadow',
  },
  library: {
    intent: 'structure',
    colorKind: 'merge',
    resultLabel: 'Adds grime shadow node',
    entry: {
      label: 'Grime Shadow',
      symbol: '◖',
      description: 'Create layered dirty shadow from the alpha of a source branch.',
      group: 'utility',
      surfaces: ['nodes'],
      tags: ['utility', 'shadow', 'texture'],
      keywords: 'shadow drop shadow grime dirty dirt layered volume depth alpha blur spread noise dust',
    },
  },
  renderSignature: (node) =>
    JSON.stringify([
      node.x,
      node.y,
      node.layers,
      node.blur,
      node.spread,
      node.grime,
      node.jitter,
      node.opacity,
      node.color,
      node.seedOffset,
      node.shadowOnly,
    ]),
};

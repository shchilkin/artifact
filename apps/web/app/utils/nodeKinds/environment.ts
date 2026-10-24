import { type GraphNodeBase, type GraphNodeKindModel, newGraphNodeId, SINGLE_INPUT, withDefaults } from './types';

export interface GraphEnvironmentNode extends GraphNodeBase<'environment'> {
  environmentSrc: string;
  environmentName: string;
  environmentMime: string;
  environmentBytes: number;
}

const ENVIRONMENT_DEFAULTS = {
  environmentSrc: '',
  environmentName: '',
  environmentMime: '',
  environmentBytes: 0,
} as const satisfies Omit<GraphEnvironmentNode, 'id' | 'name' | 'kind'>;

export function makeGraphEnvironmentNode(
  partial: Partial<Omit<GraphEnvironmentNode, 'kind'>> = {},
): GraphEnvironmentNode {
  return {
    id: newGraphNodeId('environment'),
    name: 'Environment Map',
    ...ENVIRONMENT_DEFAULTS,
    ...partial,
    kind: 'environment',
  };
}

export const environmentNodeModel: GraphNodeKindModel<GraphEnvironmentNode> = {
  kind: 'environment',
  label: 'Environment Map',
  description: 'Provides an EXR or HDR lighting environment to a 3D Scene.',
  make: makeGraphEnvironmentNode,
  normalize: (stored) => ({
    ...withDefaults<GraphEnvironmentNode>(ENVIRONMENT_DEFAULTS, stored),
    kind: 'environment',
  }),
  inputs: () => SINGLE_INPUT,
  insertion: () => ({ through: 'in' }),
  hideable: false,
  look: {
    canvasSymbol: '◇',
    accent: 'var(--node-kind-color)',
    edgeColor: 'oklch(74% 0.16 190)',
    layersIcon: '◇',
    layersLabel: 'env',
  },
  library: {
    intent: 'threeD',
    colorKind: 'color',
    resultLabel: 'Adds environment node',
    entry: {
      label: 'Environment Map',
      symbol: '◇',
      description: 'Provide an EXR or HDR environment map to a 3D Scene.',
      group: 'primitive',
      surfaces: ['nodes'],
      tags: ['utility', '3d', 'environment'],
      keywords: 'environment env map hdri hdr exr lighting reflection panorama equirectangular',
    },
  },
  renderSignature: (node) =>
    JSON.stringify([node.environmentSrc, node.environmentName, node.environmentMime, node.environmentBytes]),
};

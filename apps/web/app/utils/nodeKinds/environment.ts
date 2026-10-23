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
  // Existing behavior: the dropped-on connection feeds `env`, which the renderer does not read for this node.
  insertion: () => ({ through: 'env' }),
  renderSignature: (node) =>
    JSON.stringify([node.environmentSrc, node.environmentName, node.environmentMime, node.environmentBytes]),
};

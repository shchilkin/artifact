import { type GraphNodeBase, type GraphNodeKindModel, newGraphNodeId } from './types';

export interface GraphMaskNode extends GraphNodeBase<'mask'> {
  mode: 'alpha' | 'luma' | 'threshold';
  invert: boolean;
  threshold: number;
  feather: number;
  expand: number;
  opacity: number;
}

export function makeGraphMaskNode(partial: Partial<Omit<GraphMaskNode, 'kind'>> = {}): GraphMaskNode {
  return {
    id: newGraphNodeId('mask'),
    name: 'Mask',
    mode: 'alpha',
    invert: false,
    threshold: 50,
    feather: 0,
    expand: 0,
    opacity: 100,
    ...partial,
    kind: 'mask',
  };
}

export const maskNodeModel: GraphNodeKindModel<GraphMaskNode> = {
  kind: 'mask',
  label: 'Mask',
  description: 'Cuts one upstream branch by alpha or brightness from another branch.',
  make: makeGraphMaskNode,
  normalize: (stored) => ({ ...stored, kind: 'mask' }) as GraphMaskNode,
  inputs: () => [
    { port: 'in', role: 'primary', mode: 'render' },
    { port: 'mask', role: 'mask', mode: 'render' },
  ],
  insertion: () => ({ through: 'in' }),
  renderSignature: (node) =>
    JSON.stringify([node.mode, node.invert, node.threshold, node.feather, node.expand, node.opacity]),
};

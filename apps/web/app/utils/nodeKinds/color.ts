import { type GraphNodeBase, type GraphNodeKindModel, newGraphNodeId, SINGLE_INPUT } from './types';

export interface GraphColorNode extends GraphNodeBase<'color'> {
  contrast: number; // CSS %, 0–200 (100 = neutral)
  brightness: number; // CSS %, 0–200 (100 = neutral)
  saturation: number; // CSS %, 0–200 (100 = neutral)
  hue: number; // degrees, -180 to 180 (0 = neutral)
}

export function makeGraphColorNode(partial: Partial<Omit<GraphColorNode, 'kind'>> = {}): GraphColorNode {
  return {
    id: newGraphNodeId('color'),
    name: 'Color',
    contrast: 100,
    brightness: 100,
    saturation: 100,
    hue: 0,
    ...partial,
    kind: 'color',
  };
}

export const colorNodeModel: GraphNodeKindModel<GraphColorNode> = {
  kind: 'color',
  label: 'Color',
  description: 'Adjusts tone and color on its upstream branch.',
  make: makeGraphColorNode,
  normalize: (stored) => ({ ...stored, kind: 'color' }) as GraphColorNode,
  inputs: () => SINGLE_INPUT,
  insertion: () => ({ through: 'in' }),
  renderSignature: (node) => JSON.stringify([node.contrast, node.brightness, node.saturation, node.hue]),
};

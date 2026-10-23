import type { ArrayPattern } from '../../types/config';
import { type GraphNodeBase, type GraphNodeKindModel, newGraphNodeId, withDefaults } from './types';

export interface GraphRepeatNode extends GraphNodeBase<'repeat'> {
  pattern: ArrayPattern;
  count: number;
  rows: number;
  gap: number;
  radius: number;
  scale: number;
  jitter: number;
  rotation: number;
  rotationMode?: 'fixed' | 'radial' | 'step' | 'random';
  rotationStep?: number;
  rotationJitter?: number;
  seedOffset: number;
  opacity: number;
  blendMode: string;
}

export function makeGraphRepeatNode(partial: Partial<Omit<GraphRepeatNode, 'kind'>> = {}): GraphRepeatNode {
  return {
    id: newGraphNodeId('repeat'),
    name: 'Repeater',
    pattern: 'grid',
    count: 4,
    rows: 3,
    gap: 120,
    radius: 90,
    scale: 28,
    jitter: 0,
    rotation: 0,
    rotationMode: 'fixed',
    rotationStep: 0,
    rotationJitter: 0,
    seedOffset: 0,
    opacity: 58,
    blendMode: 'screen',
    ...partial,
    kind: 'repeat',
  };
}

export const repeatNodeModel: GraphNodeKindModel<GraphRepeatNode> = {
  kind: 'repeat',
  label: 'Repeat',
  description: 'Repeats an upstream source over an optional backdrop.',
  make: makeGraphRepeatNode,
  normalize: (stored) => ({
    ...withDefaults<GraphRepeatNode>(
      { rotationMode: 'fixed', rotationStep: 0, rotationJitter: 0, seedOffset: 0 },
      stored,
    ),
    kind: 'repeat',
  }),
  inputs: () => [
    { port: 'bg', role: 'primary', mode: 'render' },
    { port: 'in', role: 'pattern', mode: 'render' },
  ],
  insertion: () => ({ through: 'in' }),
  renderSignature: (node) =>
    JSON.stringify([
      node.pattern,
      node.count,
      node.rows,
      node.gap,
      node.radius,
      node.scale,
      node.jitter,
      node.rotation,
      node.rotationMode ?? 'fixed',
      node.rotationStep ?? 0,
      node.rotationJitter ?? 0,
      node.seedOffset,
      node.opacity,
      node.blendMode,
    ]),
};

import { describe, expect, it } from 'vitest';
import { type CanvasGraph, makeGraphMaterialNode, makeGraphShaderNode } from '../../../types/config';
import { isGraphPortConnectionAllowed } from './useNodeGraphEvents';

function shaderMaterialGraph(role: 'fill' | 'effect', connected: boolean): CanvasGraph {
  return {
    edges: connected
      ? [{ id: 'e-source-shader', fromId: 'source', fromPort: 'out', toId: 'shader', toPort: 'bg' }]
      : [],
    positions: {},
    mergeNodes: [],
    colorNodes: [],
    shaderNodes: [makeGraphShaderNode({ id: 'shader', role })],
    materialNodes: [makeGraphMaterialNode({ id: 'material' })],
  };
}

describe('shader graph connection validation', () => {
  const connection = { source: 'shader', sourceHandle: 'out', target: 'material', targetHandle: 'albedo' };

  it('allows shader fills to feed material maps directly', () => {
    expect(isGraphPortConnectionAllowed(connection, shaderMaterialGraph('fill', false), [])).toBe(true);
  });

  it('requires shader effects to have an image input before feeding a material map', () => {
    expect(isGraphPortConnectionAllowed(connection, shaderMaterialGraph('effect', false), [])).toBe(false);
    expect(isGraphPortConnectionAllowed(connection, shaderMaterialGraph('effect', true), [])).toBe(true);
  });
});

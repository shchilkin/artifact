import { describe, expect, it } from 'vitest';

import type { CanvasGraph } from '../../types/config';
import { EXPORT_NODE_ID } from '../../utils/nodeGraph';
import {
  inputPortForAddedAction,
  resolveEdgeInsertion,
  resolveNearestEdgeInsertionTarget,
  resolveNodeInsertionTarget,
} from './graphInsertion';

const graph: CanvasGraph = {
  edges: [
    { id: 'e-fill-text', fromId: 'fill-a', fromPort: 'out', toId: 'text-a', toPort: 'bg' },
    { id: 'e-text-export', fromId: 'text-a', fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' },
  ],
  positions: {
    'fill-a': { x: 0, y: 80 },
    'text-a': { x: 500, y: 80 },
    [EXPORT_NODE_ID]: { x: 1000, y: 80 },
  },
  mergeNodes: [],
  colorNodes: [],
  repeatNodes: [],
};

describe('graphInsertion', () => {
  it('maps add actions to the input port used by inserted nodes', () => {
    expect(inputPortForAddedAction({ kind: 'effect', preset: 'pixelate' })).toBe('in');
    expect(inputPortForAddedAction({ kind: 'color' })).toBe('in');
    expect(inputPortForAddedAction({ kind: 'repeatPreset', preset: 'stickerGrid' })).toBe('in');
    expect(inputPortForAddedAction({ kind: 'merge' })).toBe('a');
    expect(inputPortForAddedAction({ kind: 'material', preset: 'chrome' })).toBe('material');
    expect(inputPortForAddedAction({ kind: 'shader', role: 'effect' })).toBe('bg');
    expect(inputPortForAddedAction({ kind: 'shader', role: 'fill' })).toBeNull();
    expect(inputPortForAddedAction({ kind: 'layer', layerKind: 'text' })).toBe('bg');
    expect(inputPortForAddedAction({ kind: 'noisePreset', preset: 'crtDirt' })).toBe('bg');
  });

  it('converts an edge into a replace-edge insertion config', () => {
    expect(resolveEdgeInsertion({ kind: 'effect', preset: 'grain' }, graph.edges[0])).toEqual({
      sourceId: 'fill-a',
      targetId: 'text-a',
      targetPort: 'bg',
      replaceEdgeId: 'e-fill-text',
    });
  });

  it('does not split pixel edges with material nodes', () => {
    expect(resolveEdgeInsertion({ kind: 'material', preset: 'chrome' }, graph.edges[0])).toBeNull();
  });

  it('does not turn a shader fill into an effect when dropped on an edge', () => {
    expect(resolveEdgeInsertion({ kind: 'shader', role: 'fill' }, graph.edges[0])).toBeNull();
  });

  it('targets 3D scene material slots when material nodes are dropped on scene nodes', () => {
    const sceneGraph: CanvasGraph = {
      ...graph,
      scene3dNodes: [
        {
          id: 'scene-a',
          name: 'Scene A',
          environmentSrc: '',
          environmentName: '',
          environmentMime: '',
          environmentBytes: 0,
          materialMode: 'original',
          transparent: true,
          exposure: 100,
          environmentStrength: 100,
          environmentRotation: 0,
          ambientIntensity: 115,
          keyAzimuth: 38,
          keyElevation: 42,
          keyIntensity: 145,
          fillIntensity: 65,
          rimIntensity: 55,
        },
      ],
      positions: { ...graph.positions, 'scene-a': { x: 240, y: 160 } },
    };

    expect(
      resolveNodeInsertionTarget({
        action: { kind: 'material', preset: 'chrome' },
        graph: sceneGraph,
        layers: [],
        nodes: [{ id: 'scene-a', position: { x: 240, y: 160 }, measured: { width: 320, height: 360 } }],
        point: { x: 360, y: 240 },
      })?.insertion,
    ).toEqual({ targetId: 'scene-a', targetPort: 'material' });
  });

  it('targets environment map source inputs when render nodes are dropped on environment nodes', () => {
    const envGraph: CanvasGraph = {
      ...graph,
      environmentNodes: [
        {
          id: 'env-a',
          name: 'Environment Map',
          environmentSrc: '',
          environmentName: '',
          environmentMime: '',
          environmentBytes: 0,
        },
      ],
      positions: { ...graph.positions, 'env-a': { x: 240, y: 160 } },
    };

    expect(
      resolveNodeInsertionTarget({
        action: { kind: 'effect', preset: 'bloom' },
        graph: envGraph,
        layers: [],
        nodes: [{ id: 'env-a', position: { x: 240, y: 160 }, measured: { width: 320, height: 360 } }],
        point: { x: 360, y: 240 },
      })?.insertion,
    ).toEqual({ targetId: 'env-a', targetPort: 'in' });
  });

  it('targets primitive model inputs when 3D scene nodes are dropped on primitives', () => {
    expect(
      resolveNodeInsertionTarget({
        action: { kind: 'scene3d' },
        graph,
        layers: [{ id: 'primitive-a', kind: 'primitive' } as never],
        nodes: [{ id: 'primitive-a', position: { x: 240, y: 160 }, measured: { width: 320, height: 360 } }],
        point: { x: 360, y: 240 },
      })?.insertion,
    ).toEqual({ targetId: 'primitive-a', targetPort: 'model' });
  });

  it('resolves the nearest edge to a graph-space drop point', () => {
    const target = resolveNearestEdgeInsertionTarget({
      action: { kind: 'effect', preset: 'scanlines' },
      graph,
      nodes: [
        { id: 'fill-a', position: { x: 0, y: 80 }, measured: { width: 320, height: 360 } },
        { id: 'text-a', position: { x: 500, y: 80 }, measured: { width: 320, height: 360 } },
        { id: EXPORT_NODE_ID, position: { x: 1000, y: 80 }, measured: { width: 320, height: 360 } },
      ],
      point: { x: 410, y: 260 },
      threshold: 64,
    });

    expect(target?.edge.id).toBe('e-fill-text');
    expect(target?.insertion).toMatchObject({ replaceEdgeId: 'e-fill-text', sourceId: 'fill-a', targetId: 'text-a' });
  });

  it('returns null when the drop point is not close enough to an edge', () => {
    expect(
      resolveNearestEdgeInsertionTarget({
        action: { kind: 'effect', preset: 'scanlines' },
        graph,
        nodes: [],
        point: { x: 410, y: 640 },
        threshold: 64,
      }),
    ).toBeNull();
  });
});

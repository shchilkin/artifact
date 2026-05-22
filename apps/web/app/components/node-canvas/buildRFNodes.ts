import type { Node as RFNode } from '@xyflow/react';

import type { CanvasDocument, CanvasGraph } from '../../types/config';
import { EXPORT_NODE_ID } from '../../utils/nodeGraph';
import type { PrimitiveRenderMode, PrimitiveViewportState } from '../PrimitiveViewportState';
import { NODE_W } from './constants';
import type { ColorNodeData, ExportNodeData, LayerNodeData, MergeNodeData, RepeatNodeData } from './types';

export function buildRFNodes(
  doc: CanvasDocument,
  graph: CanvasGraph,
  selectedNodeIds: Set<string>,
  editorNodeId: string | null,
  connected: { sources: Set<string>; targets: Set<string> },
  primitiveViewStates: Record<string, PrimitiveViewportState>,
  primitiveRenderModes: Record<string, PrimitiveRenderMode>,
): RFNode[] {
  const nodes: RFNode[] = [];

  doc.layers.forEach((layer, i) => {
    const pos = graph.positions[layer.id] ?? { x: i * (NODE_W + 56), y: 80 };
    nodes.push({
      id: layer.id,
      type: 'layerNode',
      position: pos,
      selected: selectedNodeIds.has(layer.id),
      data: {
        layer,
        previewTargetId: layer.id,
        selected: selectedNodeIds.has(layer.id),
        editing: editorNodeId === layer.id,
        connected,
        primitiveViewState: layer.kind === 'primitive' ? primitiveViewStates[layer.id] : undefined,
        primitiveRenderMode: layer.kind === 'primitive' ? primitiveRenderModes[layer.id] : undefined,
      } satisfies LayerNodeData,
    });
  });

  graph.mergeNodes.forEach((mn) => {
    const pos = graph.positions[mn.id] ?? { x: 400, y: 300 };
    nodes.push({
      id: mn.id,
      type: 'mergeNode',
      position: pos,
      selected: selectedNodeIds.has(mn.id),
      data: {
        mergeNode: mn,
        previewTargetId: mn.id,
        selected: selectedNodeIds.has(mn.id),
        editing: editorNodeId === mn.id,
        connected,
      } satisfies MergeNodeData,
    });
  });

  (graph.colorNodes ?? []).forEach((cn) => {
    const pos = graph.positions[cn.id] ?? { x: 400, y: 300 };
    nodes.push({
      id: cn.id,
      type: 'colorNode',
      position: pos,
      selected: selectedNodeIds.has(cn.id),
      data: {
        colorNode: cn,
        previewTargetId: cn.id,
        selected: selectedNodeIds.has(cn.id),
        editing: editorNodeId === cn.id,
        connected,
      } satisfies ColorNodeData,
    });
  });

  (graph.repeatNodes ?? []).forEach((rn) => {
    const pos = graph.positions[rn.id] ?? { x: 400, y: 300 };
    nodes.push({
      id: rn.id,
      type: 'repeatNode',
      position: pos,
      selected: selectedNodeIds.has(rn.id),
      data: {
        repeatNode: rn,
        previewTargetId: rn.id,
        selected: selectedNodeIds.has(rn.id),
        editing: editorNodeId === rn.id,
        connected,
      } satisfies RepeatNodeData,
    });
  });

  const exportPos = graph.positions[EXPORT_NODE_ID] ?? {
    x: doc.layers.length * (NODE_W + 56),
    y: 80,
  };
  nodes.push({
    id: EXPORT_NODE_ID,
    type: 'exportNode',
    position: exportPos,
    selected: selectedNodeIds.has(EXPORT_NODE_ID),
    data: {
      exportConfig: doc.export,
      aspect: doc.global.aspect,
      previewTargetId: EXPORT_NODE_ID,
      selected: selectedNodeIds.has(EXPORT_NODE_ID),
      editing: editorNodeId === EXPORT_NODE_ID,
      connected,
    } satisfies ExportNodeData,
  });

  return nodes;
}

import type { Node as RFNode } from '@xyflow/react';
import type { CanvasDocument, CanvasGraph, Layer } from '../../types/config';
import { EXPORT_NODE_ID, graphNodesOfKind } from '../../utils/nodeGraph';
import type { PrimitiveRenderMode, PrimitiveViewportState } from '../PrimitiveViewportState';
import { NODE_W } from './constants';
import { type BuildRFNodeContext, buildGraphNodeRFNode, GRAPH_NODE_UI_KINDS } from './nodeKinds';
import type { ExportNodeData, FallbackNodeData, LayerNodeData, ShaderNodeGenerationStatus } from './types';

const SUPPORTED_LAYER_KINDS = new Set([
  'text',
  'image',
  'emoji',
  'effect',
  'fill',
  'primitive',
  'noise',
  'array',
  'lineField',
  'model',
]);

export function buildRFNodes(
  doc: CanvasDocument,
  graph: CanvasGraph,
  selectedNodeIds: Set<string>,
  editorNodeId: string | null,
  outputPathNodeIds: Set<string>,
  connected: { sources: Set<string>; targets: Set<string> },
  primitiveViewStates: Record<string, PrimitiveViewportState>,
  primitiveRenderModes: Record<string, PrimitiveRenderMode>,
  shaderGenerationStatusById: Record<string, ShaderNodeGenerationStatus>,
): RFNode[] {
  const incomingNodeId = (toId: string, toPort: string) =>
    graph.edges.find((edge) => edge.toId === toId && edge.toPort === toPort)?.fromId ?? null;
  const context: BuildRFNodeContext = {
    graph,
    doc,
    selectedNodeIds,
    editorNodeId,
    outputPathNodeIds,
    connected,
    primitiveViewStates,
    primitiveRenderModes,
    shaderGenerationStatusById,
    incomingNodeId,
  };

  return [
    ...doc.layers.map((layer, i) => buildLayerRFNode(layer, i, context)),
    ...buildUtilityRFNodes(context),
    buildExportRFNode(context),
  ];
}

function commonNodeData(id: string, context: BuildRFNodeContext) {
  return {
    previewTargetId: id,
    selected: context.selectedNodeIds.has(id),
    outputPath: context.outputPathNodeIds.has(id),
    editing: context.editorNodeId === id,
    connected: context.connected,
  };
}

function buildLayerRFNode(layer: Layer, index: number, context: BuildRFNodeContext): RFNode {
  if (!SUPPORTED_LAYER_KINDS.has((layer as { kind?: string }).kind ?? '')) {
    return buildFallbackRFNode(
      {
        id: (layer as { id?: string }).id ?? `unsupported-layer-${index}`,
        name: (layer as { name?: string }).name ?? 'Unsupported node',
        label: (layer as { kind?: string }).kind ? `${(layer as { kind?: string }).kind}` : 'unsupported',
      },
      index,
      context,
    );
  }
  const primitiveData =
    layer.kind === 'primitive' || layer.kind === 'model' ? layerPrimitiveData(layer.id, context) : {};
  return {
    id: layer.id,
    type: 'layerNode',
    position: context.graph.positions[layer.id] ?? {
      x: index * (NODE_W + 56),
      y: 80,
    },
    selected: context.selectedNodeIds.has(layer.id),
    data: {
      layer,
      ...commonNodeData(layer.id, context),
      ...primitiveData,
    } satisfies LayerNodeData,
  };
}

function buildFallbackRFNode(
  node: { id: string; name: string; label: string },
  index: number,
  context: BuildRFNodeContext,
): RFNode {
  return {
    id: node.id,
    type: 'fallbackNode',
    position: context.graph.positions[node.id] ?? {
      x: index * (NODE_W + 56),
      y: 80,
    },
    selected: context.selectedNodeIds.has(node.id),
    data: {
      id: node.id,
      name: node.name,
      label: node.label,
      selected: context.selectedNodeIds.has(node.id),
      outputPath: context.outputPathNodeIds.has(node.id),
      editing: context.editorNodeId === node.id,
    } satisfies FallbackNodeData,
  };
}

function layerPrimitiveData(layerId: string, context: BuildRFNodeContext) {
  return {
    primitiveViewState: context.primitiveViewStates[layerId],
    primitiveRenderMode: context.primitiveRenderModes[layerId],
  };
}

function utilityPosition(id: string, context: BuildRFNodeContext) {
  return context.graph.positions[id] ?? { x: 400, y: 300 };
}

function buildUtilityRFNodes(context: BuildRFNodeContext): RFNode[] {
  return GRAPH_NODE_UI_KINDS.flatMap((kind) =>
    graphNodesOfKind(context.graph, kind).map((node) =>
      buildGraphNodeRFNode(node, context, commonNodeData(node.id, context), utilityPosition(node.id, context)),
    ),
  );
}

function buildExportRFNode(context: BuildRFNodeContext): RFNode {
  const exportPos = context.graph.positions[EXPORT_NODE_ID] ?? {
    x: context.doc.layers.length * (NODE_W + 56),
    y: 80,
  };
  return {
    id: EXPORT_NODE_ID,
    type: 'exportNode',
    position: exportPos,
    selected: context.selectedNodeIds.has(EXPORT_NODE_ID),
    data: {
      exportConfig: context.doc.export,
      aspect: context.doc.global.aspect,
      ...commonNodeData(EXPORT_NODE_ID, context),
    } satisfies ExportNodeData,
  };
}

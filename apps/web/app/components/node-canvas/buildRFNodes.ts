import type { Node as RFNode } from '@xyflow/react';

import type {
  CanvasDocument,
  CanvasGraph,
  GraphColorNode,
  GraphGrimeShadowNode,
  GraphMaskNode,
  GraphMergeNode,
  GraphRepeatNode,
  GraphTransformNode,
  Layer,
} from '../../types/config';
import { EXPORT_NODE_ID } from '../../utils/nodeGraph';
import type { PrimitiveRenderMode, PrimitiveViewportState } from '../PrimitiveViewportState';
import { NODE_W } from './constants';
import type {
  ColorNodeData,
  ExportNodeData,
  GrimeShadowNodeData,
  LayerNodeData,
  MaskNodeData,
  MergeNodeData,
  RepeatNodeData,
  TransformNodeData,
} from './types';

export function buildRFNodes(
  doc: CanvasDocument,
  graph: CanvasGraph,
  selectedNodeIds: Set<string>,
  editorNodeId: string | null,
  outputPathNodeIds: Set<string>,
  connected: { sources: Set<string>; targets: Set<string> },
  primitiveViewStates: Record<string, PrimitiveViewportState>,
  primitiveRenderModes: Record<string, PrimitiveRenderMode>,
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
    incomingNodeId,
  };

  return [
    ...doc.layers.map((layer, i) => buildLayerRFNode(layer, i, context)),
    ...buildUtilityRFNodes(context),
    buildExportRFNode(context),
  ];
}

type BuildRFNodeContext = {
  doc: CanvasDocument;
  graph: CanvasGraph;
  selectedNodeIds: Set<string>;
  editorNodeId: string | null;
  outputPathNodeIds: Set<string>;
  connected: { sources: Set<string>; targets: Set<string> };
  primitiveViewStates: Record<string, PrimitiveViewportState>;
  primitiveRenderModes: Record<string, PrimitiveRenderMode>;
  incomingNodeId: (toId: string, toPort: string) => string | null;
};

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
  const primitiveData = layer.kind === 'primitive' ? layerPrimitiveData(layer.id, context) : {};
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
  return RF_UTILITY_NODE_BUILDERS.flatMap(({ nodes, build }) =>
    nodes(context.graph).map((node) => build(node as never, context)),
  );
}

const RF_UTILITY_NODE_BUILDERS = [
  { nodes: (graph: CanvasGraph) => graph.mergeNodes, build: buildMergeRFNode },
  { nodes: (graph: CanvasGraph) => graph.colorNodes, build: buildColorRFNode },
  { nodes: (graph: CanvasGraph) => graph.repeatNodes ?? [], build: buildRepeatRFNode },
  { nodes: (graph: CanvasGraph) => graph.maskNodes ?? [], build: buildMaskRFNode },
  { nodes: (graph: CanvasGraph) => graph.transformNodes ?? [], build: buildTransformRFNode },
  { nodes: (graph: CanvasGraph) => graph.grimeShadowNodes ?? [], build: buildGrimeShadowRFNode },
];

function buildMergeRFNode(mn: GraphMergeNode, context: BuildRFNodeContext): RFNode {
  return {
    id: mn.id,
    type: 'mergeNode',
    position: utilityPosition(mn.id, context),
    selected: context.selectedNodeIds.has(mn.id),
    data: {
      mergeNode: mn,
      ...commonNodeData(mn.id, context),
    } satisfies MergeNodeData,
  };
}

function buildColorRFNode(cn: GraphColorNode, context: BuildRFNodeContext): RFNode {
  return {
    id: cn.id,
    type: 'colorNode',
    position: utilityPosition(cn.id, context),
    selected: context.selectedNodeIds.has(cn.id),
    data: {
      colorNode: cn,
      ...commonNodeData(cn.id, context),
    } satisfies ColorNodeData,
  };
}

function buildRepeatRFNode(rn: GraphRepeatNode, context: BuildRFNodeContext): RFNode {
  return {
    id: rn.id,
    type: 'repeatNode',
    position: utilityPosition(rn.id, context),
    selected: context.selectedNodeIds.has(rn.id),
    data: {
      repeatNode: rn,
      ...commonNodeData(rn.id, context),
    } satisfies RepeatNodeData,
  };
}

function buildMaskRFNode(mn: GraphMaskNode, context: BuildRFNodeContext): RFNode {
  return {
    id: mn.id,
    type: 'maskNode',
    position: utilityPosition(mn.id, context),
    selected: context.selectedNodeIds.has(mn.id),
    data: {
      maskNode: mn,
      ...commonNodeData(mn.id, context),
    } satisfies MaskNodeData,
  };
}

function buildTransformRFNode(tn: GraphTransformNode, context: BuildRFNodeContext): RFNode {
  return {
    id: tn.id,
    type: 'transformNode',
    position: utilityPosition(tn.id, context),
    selected: context.selectedNodeIds.has(tn.id),
    data: {
      transformNode: tn,
      sourcePreviewTargetId: context.incomingNodeId(tn.id, 'in'),
      ...commonNodeData(tn.id, context),
    } satisfies TransformNodeData,
  };
}

function buildGrimeShadowRFNode(sn: GraphGrimeShadowNode, context: BuildRFNodeContext): RFNode {
  return {
    id: sn.id,
    type: 'grimeShadowNode',
    position: utilityPosition(sn.id, context),
    selected: context.selectedNodeIds.has(sn.id),
    data: {
      grimeShadowNode: sn,
      ...commonNodeData(sn.id, context),
    } satisfies GrimeShadowNodeData,
  };
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

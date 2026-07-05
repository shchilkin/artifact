import type { Node as RFNode } from '@xyflow/react';

import type {
  CanvasDocument,
  CanvasGraph,
  GraphColorNode,
  GraphEnvironmentNode,
  GraphGrimeShadowNode,
  GraphMaskNode,
  GraphMaterialNode,
  GraphMergeNode,
  GraphRepeatNode,
  GraphScene3DNode,
  GraphShaderNode,
  GraphTransformNode,
  Layer,
} from '../../types/config';
import { EXPORT_NODE_ID } from '../../utils/nodeGraph';
import type { PrimitiveRenderMode, PrimitiveViewportState } from '../PrimitiveViewportState';
import { NODE_W } from './constants';
import type {
  ColorNodeData,
  EnvironmentNodeData,
  ExportNodeData,
  FallbackNodeData,
  GrimeShadowNodeData,
  LayerNodeData,
  MaskNodeData,
  MaterialNodeData,
  MergeNodeData,
  RepeatNodeData,
  Scene3DNodeData,
  ShaderNodeData,
  TransformNodeData,
} from './types';

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
  return RF_UTILITY_NODE_BUILDERS.flatMap(({ nodes, build }) =>
    nodes(context.graph).map((node) => build(node as never, context)),
  );
}

const RF_UTILITY_NODE_BUILDERS = [
  { nodes: (graph: CanvasGraph) => graph.mergeNodes, build: buildMergeRFNode },
  { nodes: (graph: CanvasGraph) => graph.colorNodes, build: buildColorRFNode },
  { nodes: (graph: CanvasGraph) => graph.repeatNodes ?? [], build: buildRepeatRFNode },
  { nodes: (graph: CanvasGraph) => graph.materialNodes ?? [], build: buildMaterialRFNode },
  { nodes: (graph: CanvasGraph) => graph.maskNodes ?? [], build: buildMaskRFNode },
  { nodes: (graph: CanvasGraph) => graph.transformNodes ?? [], build: buildTransformRFNode },
  { nodes: (graph: CanvasGraph) => graph.grimeShadowNodes ?? [], build: buildGrimeShadowRFNode },
  { nodes: (graph: CanvasGraph) => graph.scene3dNodes ?? [], build: buildScene3DRFNode },
  { nodes: (graph: CanvasGraph) => graph.environmentNodes ?? [], build: buildEnvironmentRFNode },
  { nodes: (graph: CanvasGraph) => graph.shaderNodes ?? [], build: buildShaderRFNode },
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

function buildMaterialRFNode(mn: GraphMaterialNode, context: BuildRFNodeContext): RFNode {
  return {
    id: mn.id,
    type: 'materialNode',
    position: utilityPosition(mn.id, context),
    selected: context.selectedNodeIds.has(mn.id),
    data: {
      materialNode: mn,
      ...commonNodeData(mn.id, context),
    } satisfies MaterialNodeData,
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

function buildScene3DRFNode(sn: GraphScene3DNode, context: BuildRFNodeContext): RFNode {
  const modelPreviewTargetId = context.incomingNodeId(sn.id, 'model');
  const materialPreviewTargetId = context.incomingNodeId(sn.id, 'material');
  const environmentPreviewTargetId = context.incomingNodeId(sn.id, 'env');
  const modelLayer =
    context.doc.layers.find(
      (layer) => layer.id === modelPreviewTargetId && (layer.kind === 'model' || layer.kind === 'primitive'),
    ) ?? null;
  const materialNode = (context.graph.materialNodes ?? []).find((node) => node.id === materialPreviewTargetId) ?? null;
  const environmentNode =
    (context.graph.environmentNodes ?? []).find((node) => node.id === environmentPreviewTargetId) ?? null;
  return {
    id: sn.id,
    type: 'scene3dNode',
    position: utilityPosition(sn.id, context),
    selected: context.selectedNodeIds.has(sn.id),
    data: {
      scene3dNode: sn,
      modelPreviewTargetId,
      modelLayer,
      materialNode,
      backdropPreviewTargetId: context.incomingNodeId(sn.id, 'bg'),
      environmentPreviewTargetId,
      environmentSource: environmentNode?.environmentSrc ?? null,
      sceneViewState: context.primitiveViewStates[sn.id],
      ...commonNodeData(sn.id, context),
    } satisfies Scene3DNodeData,
  };
}

function buildEnvironmentRFNode(en: GraphEnvironmentNode, context: BuildRFNodeContext): RFNode {
  return {
    id: en.id,
    type: 'environmentNode',
    position: utilityPosition(en.id, context),
    selected: context.selectedNodeIds.has(en.id),
    data: {
      environmentNode: en,
      sourcePreviewTargetId: context.incomingNodeId(en.id, 'in'),
      ...commonNodeData(en.id, context),
    } satisfies EnvironmentNodeData,
  };
}

function buildShaderRFNode(sn: GraphShaderNode, context: BuildRFNodeContext): RFNode {
  return {
    id: sn.id,
    type: 'shaderNode',
    position: utilityPosition(sn.id, context),
    selected: context.selectedNodeIds.has(sn.id),
    data: {
      shaderNode: sn,
      backdropPreviewTargetId: context.incomingNodeId(sn.id, 'bg'),
      ...commonNodeData(sn.id, context),
    } satisfies ShaderNodeData,
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

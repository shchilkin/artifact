import type { ReactNode } from 'react';
import type { CanvasGraph, MaterialTextureInputPort } from '../../../types/config';
import { MATERIAL_TEXTURE_INPUT_PORTS } from '../../../types/config';
import type { GraphNodeKind, GraphNodeOfKind } from '../../../utils/nodeKinds';
import { ColorInspector } from '../inspector/ColorInspector';
import { EnvironmentInspector } from '../inspector/EnvironmentInspector';
import { GrimeShadowInspector } from '../inspector/GrimeShadowInspector';
import { MaskInspector } from '../inspector/MaskInspector';
import { MaterialInspector } from '../inspector/MaterialInspector';
import { MergeInspector } from '../inspector/MergeInspector';
import { RepeatInspector } from '../inspector/RepeatInspector';
import { SceneTargetInspector } from '../inspector/SceneTargetInspector';
import { ShaderInspector } from '../inspector/ShaderInspector';
import { TransformInspector } from '../inspector/TransformInspector';
import type { GraphNodeInspectorProps } from './types';

type GraphNodeInspectorUi<K extends GraphNodeKind> = (props: GraphNodeInspectorProps<GraphNodeOfKind<K>>) => ReactNode;

function connectedMaterialTextureInputs(graph: CanvasGraph, nodeId: string): Set<MaterialTextureInputPort> {
  const inputPorts = new Set<string>(MATERIAL_TEXTURE_INPUT_PORTS);
  const connected = new Set<MaterialTextureInputPort>();
  for (const edge of graph.edges) {
    if (edge.toId !== nodeId || !inputPorts.has(edge.toPort)) continue;
    connected.add(edge.toPort as MaterialTextureInputPort);
  }
  return connected;
}

/**
 * The Properties panel inspector of every graph-only node kind. Kept apart from `GRAPH_NODE_UIS` so surfaces that
 * show an inspector do not load the React Flow node components.
 */
export const GRAPH_NODE_INSPECTORS: { [K in GraphNodeKind]: GraphNodeInspectorUi<K> } = {
  merge: ({ node, onChange }) => <MergeInspector key={node.id} mergeNode={node} onChange={onChange} detached />,
  color: ({ node, onChange }) => <ColorInspector key={node.id} colorNode={node} onChange={onChange} />,
  repeat: ({ node, onChange }) => <RepeatInspector key={node.id} repeatNode={node} onChange={onChange} detached />,
  material: ({ node, graph, onChange }) => (
    <MaterialInspector
      key={node.id}
      materialNode={node}
      connectedTextureInputs={connectedMaterialTextureInputs(graph, node.id)}
      onChange={onChange}
      detached
    />
  ),
  mask: ({ node, onChange }) => <MaskInspector key={node.id} maskNode={node} onChange={onChange} detached />,
  transform: ({ node, onChange }) => (
    <TransformInspector key={node.id} transformNode={node} onChange={onChange} detached />
  ),
  grimeShadow: ({ node, onChange }) => (
    <GrimeShadowInspector key={node.id} grimeShadowNode={node} onChange={onChange} detached />
  ),
  scene3d: ({ node, doc, onChange, onUpdateGraphNode, onReplaceEnvironmentNodeFile }) => (
    <SceneTargetInspector
      doc={doc}
      scene={node}
      onUpdateScene={onChange}
      onUpdateEnvironment={onUpdateGraphNode}
      onLoadEnvironmentFile={onReplaceEnvironmentNodeFile}
    />
  ),
  environment: ({ node, onChange, onReplaceEnvironmentNodeFile }) => (
    <EnvironmentInspector
      key={node.id}
      environmentNode={node}
      onChange={onChange}
      onLoadFile={onReplaceEnvironmentNodeFile ? (file) => onReplaceEnvironmentNodeFile(node.id, file) : undefined}
      detached
    />
  ),
  shader: ({ node, graph, onChange }) => (
    <ShaderInspector
      key={node.id}
      shaderNode={node}
      sourceConnected={graph.edges.some((edge) => edge.toId === node.id && edge.toPort === 'bg')}
      onChange={onChange}
      detached
    />
  ),
};

export function GraphNodeInspector<K extends GraphNodeKind>(props: GraphNodeInspectorProps<GraphNodeOfKind<K>>) {
  const Inspector: GraphNodeInspectorUi<K> = GRAPH_NODE_INSPECTORS[props.node.kind as K];
  return Inspector(props);
}

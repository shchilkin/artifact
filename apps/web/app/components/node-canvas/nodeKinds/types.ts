import type { Node, NodeProps } from '@xyflow/react';
import type { ReactNode } from 'react';
import type { CanvasDocument, CanvasGraph } from '../../../types/config';
import type { GraphNode, GraphNodeKind, GraphNodeOfKind, GraphNodePatch } from '../../../utils/nodeKinds';
import type { PrimitiveRenderMode, PrimitiveViewportState } from '../../PrimitiveViewportState';
import type { ConnectedNodePorts, ShaderNodeGenerationStatus } from '../types';

/** What a node builder knows about the canvas when it turns a document node into a React Flow node. */
export interface BuildRFNodeContext {
  doc: CanvasDocument;
  graph: CanvasGraph;
  selectedNodeIds: Set<string>;
  editorNodeId: string | null;
  outputPathNodeIds: Set<string>;
  connected: { sources: Set<string>; targets: Set<string> };
  primitiveViewStates: Record<string, PrimitiveViewportState>;
  primitiveRenderModes: Record<string, PrimitiveRenderMode>;
  shaderGenerationStatusById: Record<string, ShaderNodeGenerationStatus>;
  incomingNodeId: (toId: string, toPort: string) => string | null;
}

/** React Flow data every graph-only node gets; `Extra` is what its kind adds. */
export type GraphNodeData<N extends GraphNode, Extra extends object = object> = {
  node: N;
  previewTargetId: string;
  selected: boolean;
  outputPath: boolean;
  editing: boolean;
  connected: ConnectedNodePorts;
} & Extra;

export type GraphNodeComponentProps<N extends GraphNode, Extra extends object = object> = NodeProps<
  Node<GraphNodeData<N, Extra>>
>;

export interface GraphNodeInspectorProps<N extends GraphNode> {
  node: N;
  doc: CanvasDocument;
  graph: CanvasGraph;
  onChange: (patch: Partial<Omit<N, 'id' | 'kind'>>) => void;
  onUpdateGraphNode: (id: string, patch: GraphNodePatch) => void;
  onReplaceEnvironmentNodeFile?: (id: string, file: File) => void;
}

/**
 * The editor half of a graph node kind: its React Flow node and the data that node needs. Its inspector
 * lives in `GRAPH_NODE_INSPECTORS`.
 * The document model lives in `utils/nodeKinds/` and rendering in `utils/render/nodeKinds/`.
 */
export interface GraphNodeKindUi<K extends GraphNodeKind, Extra extends object = object> {
  /** React Flow node type; also the `react-flow__node-<type>` class name. */
  rfType: string;
  /** Data the node component needs beyond the node itself and the common fields. */
  rfData?: (node: GraphNodeOfKind<K>, context: BuildRFNodeContext) => Extra;
  Component: (props: GraphNodeComponentProps<GraphNodeOfKind<K>, Extra>) => ReactNode;
}

/** A kind's UI as the registry stores it: kind-specific React Flow data is opaque outside the kind's module. */
export interface RegisteredGraphNodeUi<K extends GraphNodeKind> {
  rfType: string;
  rfData?: (node: GraphNodeOfKind<K>, context: BuildRFNodeContext) => object;
  Component: (props: GraphNodeComponentProps<GraphNodeOfKind<K>, never>) => ReactNode;
}

import type { MutableRefObject, MouseEvent as ReactMouseEvent, ReactNode, RefObject } from 'react';

import type {
  AspectRatio,
  CanvasDocument,
  CanvasGraph,
  GraphColorNode,
  GraphEdge,
  GraphGrimeShadowNode,
  GraphMaskNode,
  GraphMergeNode,
  GraphRepeatNode,
  GraphTransformNode,
  ImageLayer,
  Layer,
  PrimitiveLayer,
  TextLayer,
} from '../../types/config';
import type { AddAction } from '../../utils/addActions';
import type { PrimitiveRenderMode, PrimitiveViewportState } from '../PrimitiveViewportState';

export type GalleryEligibleLayer =
  | PrimitiveLayer
  | ImageLayer
  | TextLayer
  | Extract<Layer, { kind: 'noise' | 'array' }>;

export interface InsertConnectionConfig {
  sourceId?: string;
  targetId?: string;
  targetPort?: GraphEdge['toPort'];
  replaceEdgeId?: string;
}

export interface NodeCanvasProps {
  doc: CanvasDocument;
  imageCache: Map<string, HTMLImageElement>;
  initialPrimitiveViewStates?: Record<string, PrimitiveViewportState>;
  onPrimitiveViewStatesChange?: (viewStates: Record<string, PrimitiveViewportState>) => void;
  selectedLayerId: string | null;
  onSelectLayer: (id: string | null) => void;
  onGraphChange: (graph: CanvasGraph) => void;
  onUpdateLayer: (id: string, patch: Partial<Layer>) => void;
  onUpdateMergeNode: (id: string, patch: Partial<GraphMergeNode>) => void;
  onUpdateColorNode: (id: string, patch: Partial<GraphColorNode>) => void;
  onUpdateRepeatNode: (id: string, patch: Partial<GraphRepeatNode>) => void;
  onUpdateMaskNode: (id: string, patch: Partial<GraphMaskNode>) => void;
  onUpdateTransformNode: (id: string, patch: Partial<GraphTransformNode>) => void;
  onUpdateGrimeShadowNode: (id: string, patch: Partial<GraphGrimeShadowNode>) => void;
  onUpdateExportConfig: (patch: Partial<CanvasDocument['export']>) => void;
  onUpdateAspectRatio: (aspect: AspectRatio) => void;
  exportBusy: boolean;
  onExport: () => void;
  onAddLayerAt: (action: AddAction, position: { x: number; y: number }, insertion?: InsertConnectionConfig) => void;
  onImageFileDrop?: (file: File, position: { x: number; y: number }) => void;
  onDeleteNodes: (ids: string[]) => void;
  onDuplicateLayer: (id: string) => void;
}

export interface NodeShellProps {
  kind: string;
  label: string;
  name: string;
  selected?: boolean;
  outputPath?: boolean;
  muted?: boolean;
  expanded?: boolean;
  expandable?: boolean;
  onToggleExpanded?: () => void;
  children: ReactNode;
  onToggleMuted?: () => void;
  onDelete?: () => void;
  onDragHandlePointerDown?: () => void;
  deleteDisabled?: boolean;
}

export type LayerNodeData = {
  layer: Layer;
  previewTargetId: string;
  selected: boolean;
  outputPath: boolean;
  editing: boolean;
  connected: { sources: Set<string>; targets: Set<string> };
  primitiveViewState?: PrimitiveViewportState;
  primitiveRenderMode?: PrimitiveRenderMode;
};

export type MergeNodeData = {
  mergeNode: GraphMergeNode;
  previewTargetId: string;
  selected: boolean;
  outputPath: boolean;
  editing: boolean;
  connected: { sources: Set<string>; targets: Set<string> };
};

export type ColorNodeData = {
  colorNode: GraphColorNode;
  previewTargetId: string;
  selected: boolean;
  outputPath: boolean;
  editing: boolean;
  connected: { sources: Set<string>; targets: Set<string> };
};

export type RepeatNodeData = {
  repeatNode: GraphRepeatNode;
  previewTargetId: string;
  selected: boolean;
  outputPath: boolean;
  editing: boolean;
  connected: { sources: Set<string>; targets: Set<string> };
};

export type MaskNodeData = {
  maskNode: GraphMaskNode;
  previewTargetId: string;
  selected: boolean;
  outputPath: boolean;
  editing: boolean;
  connected: { sources: Set<string>; targets: Set<string> };
};

export type TransformNodeData = {
  transformNode: GraphTransformNode;
  previewTargetId: string;
  sourcePreviewTargetId: string | null;
  selected: boolean;
  outputPath: boolean;
  editing: boolean;
  connected: { sources: Set<string>; targets: Set<string> };
};

export type GrimeShadowNodeData = {
  grimeShadowNode: GraphGrimeShadowNode;
  previewTargetId: string;
  selected: boolean;
  outputPath: boolean;
  editing: boolean;
  connected: { sources: Set<string>; targets: Set<string> };
};

export type ExportNodeData = {
  exportConfig: CanvasDocument['export'];
  aspect: AspectRatio;
  previewTargetId: string;
  selected: boolean;
  outputPath: boolean;
  editing: boolean;
  connected: { sources: Set<string>; targets: Set<string> };
};

export interface NodeCanvasPreviewContextValue {
  doc: CanvasDocument;
  graph: CanvasGraph;
  imageCache: Map<string, HTMLImageElement>;
  primitiveViewStates: Record<string, PrimitiveViewportState>;
  isGraphDraggingRef: MutableRefObject<boolean>;
}

export interface NodeCanvasActionsContextValue {
  selectNode: (id: string, event?: ReactMouseEvent) => void;
  toggleNodeEditor: (id: string) => void;
  updateLayer: (id: string, patch: Partial<Layer>) => void;
  updateMergeNode: (id: string, patch: Partial<GraphMergeNode>) => void;
  updateColorNode: (id: string, patch: Partial<GraphColorNode>) => void;
  updateRepeatNode: (id: string, patch: Partial<GraphRepeatNode>) => void;
  updateMaskNode: (id: string, patch: Partial<GraphMaskNode>) => void;
  updateTransformNode: (id: string, patch: Partial<GraphTransformNode>) => void;
  updateGrimeShadowNode: (id: string, patch: Partial<GraphGrimeShadowNode>) => void;
  updateExportConfig: (patch: Partial<CanvasDocument['export']>) => void;
  updateAspectRatio: (aspect: AspectRatio) => void;
  exportNode: () => void;
  deleteNode: (id: string) => void;
  openGallery: (id: string) => void;
  updatePrimitiveView: (id: string, viewState: PrimitiveViewportState) => void;
  setPrimitiveViewportActive: (id: string, active: boolean) => void;
}

export type ContextMenuState =
  | { type: 'pane-add'; x: number; y: number; flowPos: { x: number; y: number } }
  | { type: 'pane-insert'; x: number; y: number; flowPos: { x: number; y: number }; insertion: InsertConnectionConfig }
  | { type: 'node'; x: number; y: number; nodeId: string; isMerge: boolean; isExport: boolean }
  | null;

export interface NodeCanvasUiState {
  selectedNodeIds: string[];
  selectedEdgeId: string | null;
  expandedNodeId: string | null;
}

export type NodeCanvasUiAction =
  | { type: 'PANE_CLICKED' }
  | { type: 'NODE_SELECTED'; id: string | null; additive: boolean }
  | { type: 'NODE_EDITOR_TOGGLED'; id: string }
  | { type: 'EDGE_SELECTED'; id: string }
  | { type: 'SELECTION_CHANGED'; nodeIds: string[]; edgeIds: string[] }
  | { type: 'EDGE_IDS_REMOVED'; ids: string[] }
  | { type: 'NODE_IDS_REMOVED'; ids: string[] }
  | { type: 'SYNC_EXTERNAL_NODE'; id: string }
  | { type: 'FILTER_INVALID_REFERENCES'; validNodeIds: string[]; validEdgeIds: string[] };

export interface ThumbProps {
  previewTargetId: string;
  priority?: boolean;
}

export type ThumbnailRenderTask = () => Promise<void>;

export interface PortRowProps {
  inputs: Array<{ label: string; portId: string; nodeId: string }>;
  outputs: Array<{ label: string; portId: string; nodeId: string }>;
  connected: { sources: Set<string>; targets: Set<string> };
}

export type EffectSectionId = 'node' | 'rays' | 'glitch' | 'texture' | 'tint' | 'warp' | 'color' | 'riso' | 'graphic';

export interface PaneMenuProps {
  x: number;
  y: number;
  mode: 'add' | 'insert';
  onAdd: (action: AddAction) => void;
  onDragAdd?: (action: AddAction, point: { x: number; y: number }) => boolean;
  onClose: () => void;
  menuRef: RefObject<HTMLDivElement | null>;
}

export interface NodeMenuProps {
  x: number;
  y: number;
  isMerge: boolean;
  isExport: boolean;
  muted?: boolean;
  removeFromArea?: { areaId: string; nodeId: string; areaName?: string };
  onDuplicate: () => void;
  onToggleMuted?: () => void;
  onRemoveFromArea?: (areaId: string, nodeId: string) => void;
  onDelete: () => void;
  deleteDisabled?: boolean;
  onClose: () => void;
  menuRef: RefObject<HTMLDivElement | null>;
}

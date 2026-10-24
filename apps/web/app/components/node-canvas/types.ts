import type { MutableRefObject, MouseEvent as ReactMouseEvent, ReactNode, RefObject } from 'react';
import type {
  AspectRatio,
  CanvasDocument,
  CanvasGraph,
  GraphEdge,
  ImageLayer,
  Layer,
  ModelLayer,
  PrimitiveLayer,
  TextLayer,
} from '../../types/config';
import type { EffectControlSectionId } from '../../types/effectSchema';
import type { AddAction } from '../../utils/addActions';
import type { GraphEditKind } from '../../utils/documentDispatch';
import type { DocumentUpdateMode } from '../../utils/documentHistory';
import type { GraphNodePatch } from '../../utils/nodeKinds';
import type { PrimitiveRenderMode, PrimitiveViewportState } from '../PrimitiveViewportState';

export type GalleryEligibleLayer =
  | PrimitiveLayer
  | ModelLayer
  | ImageLayer
  | TextLayer
  | Extract<Layer, { kind: 'noise' | 'array' }>;

export interface InsertConnectionConfig {
  sourceId?: string;
  targetId?: string;
  targetPort?: GraphEdge['toPort'];
  replaceEdgeId?: string;
}

/** Graph viewport (pan and zoom), kept by the editor as UI state outside the document. */
export interface NodeCanvasViewport {
  x: number;
  y: number;
  zoom: number;
}

export interface NodeCanvasProps {
  doc: CanvasDocument;
  imageCache: Map<string, HTMLImageElement>;
  /** Viewport to restore on entry. Without it, the first entry fits the graph. */
  initialViewport?: NodeCanvasViewport | null;
  /** Reports the viewport after the user pans or zooms and when Nodes closes. */
  onViewportChange?: (viewport: NodeCanvasViewport) => void;
  initialPrimitiveViewStates?: Record<string, PrimitiveViewportState>;
  onPrimitiveViewStatesChange?: (viewStates: Record<string, PrimitiveViewportState>, mode?: DocumentUpdateMode) => void;
  selectedLayerId: string | null;
  onSelectLayer: (id: string | null) => void;
  /** Node to select and center on entry, set by Edit in Nodes. */
  entryFocusNodeId?: string | null;
  onGraphEdit: (graph: CanvasGraph, edit: GraphEditKind) => void;
  onUpdateLayer: (id: string, patch: Partial<Layer>) => void;
  onUpdateGraphNode: (id: string, patch: GraphNodePatch) => void;
  onUpdateExportConfig: (patch: Partial<CanvasDocument['export']>) => void;
  onUpdateAspectRatio: (aspect: AspectRatio) => void;
  exportBusy: boolean;
  onExport: () => void;
  onAddLayerAt: (action: AddAction, position: { x: number; y: number }, insertion?: InsertConnectionConfig) => void;
  onImageFileDrop?: (file: File, position: { x: number; y: number }) => void;
  onFilesDrop?: (files: File[], position: { x: number; y: number }) => void;
  onFileDragPreviewChange?: (dataTransfer: DataTransfer | null) => void;
  onReplaceModelLayerFile?: (id: string, file: File) => void;
  onReplaceEnvironmentNodeFile?: (id: string, file: File) => void;
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

export interface ConnectedNodePorts {
  sources: ReadonlySet<string>;
  targets: ReadonlySet<string>;
}

export type LayerNodeData = {
  layer: Layer;
  previewTargetId: string;
  selected: boolean;
  outputPath: boolean;
  editing: boolean;
  connected: ConnectedNodePorts;
  primitiveViewState?: PrimitiveViewportState;
  primitiveRenderMode?: PrimitiveRenderMode;
};

export type ExportNodeData = {
  exportConfig: CanvasDocument['export'];
  aspect: AspectRatio;
  previewTargetId: string;
  selected: boolean;
  outputPath: boolean;
  editing: boolean;
  connected: ConnectedNodePorts;
};

export type FallbackNodeData = {
  id: string;
  label: string;
  name: string;
  selected: boolean;
  outputPath: boolean;
  editing: boolean;
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
  updateGraphNode: (id: string, patch: GraphNodePatch) => void;
  setShaderNodeGenerationStatus: (id: string, status: ShaderNodeGenerationStatus | null) => void;
  updateExportConfig: (patch: Partial<CanvasDocument['export']>) => void;
  updateAspectRatio: (aspect: AspectRatio) => void;
  exportNode: () => void;
  deleteNode: (id: string) => void;
  openGallery: (id: string) => void;
  updatePrimitiveView: (id: string, viewState: PrimitiveViewportState, mode?: DocumentUpdateMode) => void;
  setPrimitiveViewportActive: (id: string, active: boolean) => void;
}

export type ShaderNodeGenerationStatus =
  | 'creatingOpenAi'
  | 'creatingRefine'
  | 'creatingFallback'
  | 'validating'
  | 'repairing'
  | 'blocked'
  | 'failed';

export type ContextMenuState =
  | { type: 'pane-add'; x: number; y: number; flowPos: { x: number; y: number } }
  | { type: 'pane-insert'; x: number; y: number; flowPos: { x: number; y: number }; insertion: InsertConnectionConfig }
  | {
      type: 'edge';
      x: number;
      y: number;
      edgeId: string;
      flowPos: { x: number; y: number };
      insertion: InsertConnectionConfig;
    }
  | { type: 'node'; x: number; y: number; nodeId: string; isExport: boolean }
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
  statusOverlay?: ReactNode;
}

export type ThumbnailRenderTask = () => Promise<void>;

export interface PortRowProps {
  inputs: Array<{ label: string; portId: string; nodeId: string }>;
  outputs: Array<{ label: string; portId: string; nodeId: string }>;
  connected: ConnectedNodePorts;
}

export type EffectSectionId = 'node' | EffectControlSectionId;

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

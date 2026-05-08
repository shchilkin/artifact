import {
  createContext,
  forwardRef,
  memo,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type ElementType,
} from 'react';
import { createPortal } from 'react-dom';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Position,
  applyNodeChanges,
  applyEdgeChanges,
  type Node as RFNode,
  type Edge as RFEdge,
  type NodeChange,
  type EdgeChange,
  type Connection,
  type FinalConnectionState,
  type NodeProps,
  type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import type {
  CanvasDocument, Layer, GraphMergeNode, CanvasGraph, GraphEdge,
  EffectLayer, EmojiLayer, FillLayer, ImageLayer, TextLayer,
  LayerKind, EffectPreset, AspectRatio,
} from '../types/config';
import { ASPECT_SIZES, EFFECT_PRESETS, EFFECT_PRESET_MENU_ORDER } from '../types/config';
import { renderDocument, renderGraphTarget } from '../utils/renderer';
import { EffectInfoPopup } from './EffectInfoPopup';
import {
  EXPORT_NODE_ID,
  wouldCreateCycle,
  connectedPortIds,
  inferLinearGraph,
  organizeGraph,
  splitEdgeWithNode,
  toRFEdges,
  updateGraphPositions,
  addGraphEdge,
  removeGraphEdge,
} from '../utils/nodeGraph';

// ─── Constants ────────────────────────────────────────────────────────────────

const NODE_W = 160;
const NODE_H = 194;
const THUMB_SIZE = 136;
const NODE_EDITOR_W = 292;
const EDGE_INTERCEPT_THRESHOLD = 56;

// Risograph-inspired palette — high chroma, limited swatches, treated as inks.
const KIND_COLOR: Record<string, string> = {
  fill:   'oklch(72% 0.18 52)',
  image:  'oklch(72% 0.14 232)',
  text:   'oklch(86% 0.17 92)',
  emoji:  'oklch(70% 0.22 5)',
  effect: 'oklch(64% 0.22 305)',
  merge:  'oklch(74% 0.17 152)',
  export: 'oklch(86% 0.05 92)',
};

const KIND_SYMBOL: Record<string, string> = {
  fill:   '◼',
  image:  '◧',
  text:   'T',
  emoji:  '✦',
  effect: '⚡',
  merge:  '⊕',
  export: '↗',
};

// ─── Add-node menu items ──────────────────────────────────────────────────────

export type AddAction =
  | { kind: 'layer'; layerKind: Exclude<LayerKind, 'effect'> }
  | { kind: 'effect'; preset: EffectPreset }
  | { kind: 'merge' };

export interface InsertConnectionConfig {
  sourceId: string;
  targetId?: string;
  targetPort?: GraphEdge['toPort'];
  replaceEdgeId?: string;
}

const ADD_ITEMS: Array<{ label: string; symbol: string; group: string; action: AddAction }> = [
  { label: 'Fill',    symbol: '◼', group: 'content', action: { kind: 'layer', layerKind: 'fill' } },
  { label: 'Image',   symbol: '◧', group: 'content', action: { kind: 'layer', layerKind: 'image' } },
  { label: 'Text',    symbol: 'T', group: 'content', action: { kind: 'layer', layerKind: 'text' } },
  { label: 'Emoji',   symbol: '✦', group: 'content', action: { kind: 'layer', layerKind: 'emoji' } },
  ...EFFECT_PRESET_MENU_ORDER.map((preset) => ({
    label: EFFECT_PRESETS[preset].name,
    symbol: EFFECT_PRESETS[preset].icon,
    group: 'effect',
    action: { kind: 'effect', preset } as AddAction,
  })),
  { label: 'Merge',   symbol: '⊕', group: 'util',   action: { kind: 'merge' } },
];

// ─── Shared helpers ───────────────────────────────────────────────────────────

function stopNodeEvent(e: React.SyntheticEvent) {
  e.stopPropagation();
}

function callAll<E extends React.SyntheticEvent>(
  ...handlers: Array<((event: E) => void) | undefined>
) {
  return (event: E) => {
    handlers.forEach((handler) => handler?.(event));
  };
}

type NoPanProps<T extends ElementType = 'div'> = {
  as?: T;
} & Omit<ComponentPropsWithoutRef<T>, 'as'>;

const NoPan = forwardRef(function NoPan<T extends ElementType = 'div'>({
  as,
  className,
  onPointerDown,
  onMouseDown,
  onClick,
  onDoubleClick,
  ...props
}: NoPanProps<T>, ref: React.ForwardedRef<Element>) {
  const Component = as ?? 'div';
  return (
    <Component
      ref={ref}
      className={className ? `nodrag ${className}` : 'nodrag'}
      onPointerDown={callAll(stopNodeEvent, onPointerDown as ((event: React.SyntheticEvent) => void) | undefined)}
      onMouseDown={callAll(stopNodeEvent, onMouseDown as ((event: React.SyntheticEvent) => void) | undefined)}
      onClick={callAll(stopNodeEvent, onClick as ((event: React.SyntheticEvent) => void) | undefined)}
      onDoubleClick={callAll(stopNodeEvent, onDoubleClick as ((event: React.SyntheticEvent) => void) | undefined)}
      {...props}
    />
  );
}) as <T extends ElementType = 'div'>(props: NoPanProps<T> & { ref?: React.ForwardedRef<Element> }) => React.ReactElement | null;

interface NodeCanvasPreviewContextValue {
  doc: CanvasDocument;
  graph: CanvasGraph;
  imageCache: Map<string, HTMLImageElement>;
}

const NodeCanvasPreviewContext = createContext<NodeCanvasPreviewContextValue | null>(null);

interface NodeCanvasActionsContextValue {
  selectNode: (id: string, event?: React.MouseEvent) => void;
  toggleNodeEditor: (id: string) => void;
  updateLayer: (id: string, patch: Partial<Layer>) => void;
  updateMergeNode: (id: string, patch: Partial<GraphMergeNode>) => void;
  updateExportConfig: (patch: Partial<CanvasDocument['export']>) => void;
  updateAspectRatio: (aspect: AspectRatio) => void;
  exportNode: () => void;
  deleteNode: (id: string) => void;
}

const NodeCanvasActionsContext = createContext<NodeCanvasActionsContextValue | null>(null);

function useNodeCanvasPreview() {
  const value = useContext(NodeCanvasPreviewContext);
  if (!value) throw new Error('NodeCanvasPreviewContext missing');
  return value;
}

function useNodeCanvasActions() {
  const value = useContext(NodeCanvasActionsContext);
  if (!value) throw new Error('NodeCanvasActionsContext missing');
  return value;
}

function isAdditiveSelectionEvent(event?: React.MouseEvent) {
  return Boolean(event?.metaKey || event?.ctrlKey || event?.shiftKey);
}

const BLEND_OPTIONS = ['normal', 'multiply', 'screen', 'overlay', 'luminosity'] as const;

// ─── Context menu state ───────────────────────────────────────────────────────

type ContextMenuState =
  | { type: 'pane-add'; x: number; y: number; flowPos: { x: number; y: number } }
  | { type: 'pane-insert'; x: number; y: number; flowPos: { x: number; y: number }; insertion: InsertConnectionConfig }
  | { type: 'node'; x: number; y: number; nodeId: string; isMerge: boolean; isExport: boolean }
  | null;

interface NodeCanvasUiState {
  selectedNodeIds: string[];
  selectedEdgeId: string | null;
  expandedNodeId: string | null;
}

type NodeCanvasUiAction =
  | { type: 'PANE_CLICKED' }
  | { type: 'NODE_SELECTED'; id: string | null; additive: boolean }
  | { type: 'NODE_EDITOR_TOGGLED'; id: string }
  | { type: 'EDGE_SELECTED'; id: string }
  | { type: 'SELECTION_CHANGED'; nodeIds: string[]; edgeIds: string[] }
  | { type: 'EDGE_IDS_REMOVED'; ids: string[] }
  | { type: 'NODE_IDS_REMOVED'; ids: string[] }
  | { type: 'SYNC_EXTERNAL_NODE'; id: string }
  | { type: 'FILTER_INVALID_REFERENCES'; validNodeIds: string[]; validEdgeIds: string[] };

function sameIds(a: string[], b: string[]) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function reduceNodeCanvasUi(state: NodeCanvasUiState, action: NodeCanvasUiAction): NodeCanvasUiState {
  switch (action.type) {
    case 'PANE_CLICKED':
      return state.selectedNodeIds.length === 0 && state.selectedEdgeId === null && state.expandedNodeId === null
        ? state
        : { selectedNodeIds: [], selectedEdgeId: null, expandedNodeId: null };
    case 'NODE_SELECTED': {
      const nextNodeIds = !action.id
        ? []
        : action.additive
          ? (state.selectedNodeIds.includes(action.id)
            ? state.selectedNodeIds.filter((selectedId) => selectedId !== action.id)
            : [...state.selectedNodeIds, action.id])
          : [action.id];
      const nextState = {
        selectedNodeIds: nextNodeIds,
        selectedEdgeId: null,
        expandedNodeId: action.additive
          ? (state.expandedNodeId && nextNodeIds.includes(state.expandedNodeId) ? state.expandedNodeId : null)
          : (state.expandedNodeId === action.id ? state.expandedNodeId : null),
      };
      return sameIds(state.selectedNodeIds, nextState.selectedNodeIds)
        && state.selectedEdgeId === nextState.selectedEdgeId
        && state.expandedNodeId === nextState.expandedNodeId
        ? state
        : nextState;
    }
    case 'NODE_EDITOR_TOGGLED': {
      const nextState = {
        selectedNodeIds: [action.id],
        selectedEdgeId: null,
        expandedNodeId: state.expandedNodeId === action.id ? null : action.id,
      };
      return sameIds(state.selectedNodeIds, nextState.selectedNodeIds)
        && state.selectedEdgeId === nextState.selectedEdgeId
        && state.expandedNodeId === nextState.expandedNodeId
        ? state
        : nextState;
    }
    case 'EDGE_SELECTED':
      return state.selectedNodeIds.length === 0 && state.selectedEdgeId === action.id && state.expandedNodeId === null
        ? state
        : { selectedNodeIds: [], selectedEdgeId: action.id, expandedNodeId: null };
    case 'SELECTION_CHANGED': {
      const nextState = {
        selectedNodeIds: action.nodeIds,
        selectedEdgeId: action.nodeIds.length === 0 && action.edgeIds.length === 1 ? action.edgeIds[0] : null,
        expandedNodeId: action.nodeIds.length === 1 && action.nodeIds[0] === state.expandedNodeId ? state.expandedNodeId : null,
      };
      return sameIds(state.selectedNodeIds, nextState.selectedNodeIds)
        && state.selectedEdgeId === nextState.selectedEdgeId
        && state.expandedNodeId === nextState.expandedNodeId
        ? state
        : nextState;
    }
    case 'EDGE_IDS_REMOVED':
      return action.ids.includes(state.selectedEdgeId ?? '')
        ? { ...state, selectedEdgeId: null }
        : state;
    case 'NODE_IDS_REMOVED': {
      const nextNodeIds = state.selectedNodeIds.filter((id) => !action.ids.includes(id));
      return {
        selectedNodeIds: nextNodeIds,
        selectedEdgeId: state.selectedEdgeId,
        expandedNodeId: state.expandedNodeId && action.ids.includes(state.expandedNodeId) ? null : state.expandedNodeId,
      };
    }
    case 'SYNC_EXTERNAL_NODE':
      return sameIds(state.selectedNodeIds, [action.id]) && state.selectedEdgeId === null && state.expandedNodeId === (state.expandedNodeId === action.id ? state.expandedNodeId : null)
        ? state
        : {
        selectedNodeIds: [action.id],
        selectedEdgeId: null,
        expandedNodeId: state.expandedNodeId === action.id ? state.expandedNodeId : null,
      };
    case 'FILTER_INVALID_REFERENCES': {
      const validNodeIds = new Set(action.validNodeIds);
      const validEdgeIds = new Set(action.validEdgeIds);
      const nextNodeIds = state.selectedNodeIds.filter((id) => validNodeIds.has(id));
      const nextState = {
        selectedNodeIds: nextNodeIds,
        selectedEdgeId: state.selectedEdgeId && validEdgeIds.has(state.selectedEdgeId) ? state.selectedEdgeId : null,
        expandedNodeId: state.expandedNodeId && validNodeIds.has(state.expandedNodeId) ? state.expandedNodeId : null,
      };
      return sameIds(state.selectedNodeIds, nextState.selectedNodeIds)
        && state.selectedEdgeId === nextState.selectedEdgeId
        && state.expandedNodeId === nextState.expandedNodeId
        ? state
        : nextState;
    }
  }
}

// ─── Thumbnail ────────────────────────────────────────────────────────────────

interface ThumbProps {
  previewTargetId: string;
}

const NodeThumbnail = memo(function NodeThumbnail({ previewTargetId }: ThumbProps) {
  const { doc, graph, imageCache } = useNodeCanvasPreview();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isExportPreview = previewTargetId === EXPORT_NODE_ID;
  const previewSize = useMemo(() => {
    if (!isExportPreview) {
      return { width: THUMB_SIZE, height: THUMB_SIZE };
    }
    const [aspectWidth, aspectHeight] = ASPECT_SIZES[doc.global.aspect ?? '1:1'];
    const scale = THUMB_SIZE / aspectWidth;
    return {
      width: Math.max(1, Math.round(aspectWidth * scale)),
      height: Math.max(1, Math.round(aspectHeight * scale)),
    };
  }, [doc.global.aspect, isExportPreview]);
  const previewKey = useMemo(
    () => JSON.stringify({ previewTargetId, global: doc.global, layers: doc.layers, graph, previewSize }),
    [previewTargetId, doc.global, doc.layers, graph, previewSize],
  );
  const [renderedPreviewKey, setRenderedPreviewKey] = useState<string | null>(null);
  const ready = renderedPreviewKey === previewKey;

  useEffect(() => {
    let cancelled = false;
    const previewDoc: CanvasDocument = { ...doc, graph };
    const renderPromise = isExportPreview
      ? renderDocument(previewDoc, previewSize.width, previewSize.height, imageCache)
      : renderGraphTarget(previewDoc, graph, previewTargetId, previewSize.width, previewSize.height, imageCache);
    renderPromise
      .then((result) => {
        if (cancelled || !canvasRef.current) return;
        const ctx = canvasRef.current.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, previewSize.width, previewSize.height);
        ctx.drawImage(result, 0, 0, previewSize.width, previewSize.height);
        setRenderedPreviewKey(previewKey);
      })
      .catch(() => { /* silent */ });
    return () => { cancelled = true; };
  }, [doc, graph, imageCache, isExportPreview, previewKey, previewSize.height, previewSize.width, previewTargetId]);

  return (
    <div className={`node-thumbnail${isExportPreview ? ' node-thumbnail-export' : ''}`}>
      <div
        className="node-thumbnail-frame"
        style={{ width: previewSize.width, height: previewSize.height }}
      >
        <canvas
          ref={canvasRef}
          width={previewSize.width}
          height={previewSize.height}
          className="node-thumbnail-canvas"
          style={{ opacity: ready ? 1 : 0 }}
        />
        {!ready && (
          <div className="node-thumbnail-skeleton" />
        )}
      </div>
    </div>
  );
});

// ─── Port handle ──────────────────────────────────────────────────────────────

const HANDLE_STYLE = {
  background: 'oklch(74% 0.17 152)',
  border: '1.5px solid oklch(10% 0.008 285)',
  width: 10, height: 10,
};

// ─── Node shell ───────────────────────────────────────────────────────────────

interface NodeShellProps {
  kind: string;
  label: string;
  name: string;
  selected?: boolean;
  expanded?: boolean;
  expandable?: boolean;
  onToggleExpanded?: () => void;
  children: React.ReactNode;
  onDelete?: () => void;
}

function NodeShell({
  kind,
  label,
  name,
  selected,
  expanded,
  expandable,
  onToggleExpanded,
  children,
  onDelete,
}: NodeShellProps) {
  const accent = KIND_COLOR[kind] ?? 'oklch(55% 0.05 285)';
  return (
    <div
      className={`node-shell${selected ? ' node-shell-selected' : ''}`}
      style={{ '--node-accent': accent, width: NODE_W } as CSSProperties}
    >
      <div className="node-shell-accent" />
      <div className="node-shell-header">
        <div className="node-drag-handle node-shell-drag">
          <span className="node-shell-symbol">
            {KIND_SYMBOL[kind] ?? '○'}
          </span>
          <span className="node-shell-label">{label}</span>
          <span className="node-shell-name">{name}</span>
        </div>
        {expandable && onToggleExpanded && (
          <NoPan
            as="button"
            type="button"
            className={`node-shell-action node-shell-toggle${expanded ? ' node-shell-toggle-active' : ''}`}
            aria-label={expanded ? 'Collapse settings' : 'Expand settings'}
            aria-expanded={expanded}
            onClick={onToggleExpanded}
          >
            {expanded ? '−' : '+'}
          </NoPan>
        )}
        {onDelete && (
          <NoPan
            as="button"
            type="button"
            className="nodrag node-shell-action"
            aria-label="Delete node"
            onClick={onDelete}
          >×</NoPan>
        )}
      </div>
      <div className="node-shell-body">{children}</div>
    </div>
  );
}

function NodeEditorPanel({
  kind,
  title,
  subtitle,
  onClose,
  children,
}: {
  kind: string;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const accent = KIND_COLOR[kind] ?? 'oklch(55% 0.05 285)';

  return (
    <NoPan
      className="node-editor-panel"
      style={{ '--node-accent': accent, width: NODE_EDITOR_W } as CSSProperties}
    >
      <div className="node-editor-accent" />
      <div className="node-editor-header">
        <div className="node-editor-heading">
          <span className="node-editor-title">
            {title}
          </span>
          {subtitle && (
            <span className="node-editor-subtitle">
              {subtitle}
            </span>
          )}
        </div>
        <NoPan
          as="button"
          type="button"
          className="node-shell-action node-editor-close"
          aria-label="Close settings"
          onClick={onClose}
        >
          ×
        </NoPan>
      </div>
      <div className="node-editor-body">
        {children}
      </div>
    </NoPan>
  );
}

// ─── Effect section helpers ───────────────────────────────────────────────────

type EffectSectionId = 'node' | 'rays' | 'glitch' | 'texture' | 'tint' | 'warp' | 'color' | 'riso';

const RAYS_PRESETS: EffectPreset[] = ['rays', 'bloom', 'filmBurn'];
const GLITCH_PRESETS: EffectPreset[] = ['glitch', 'ca', 'interlace', 'dataMosh'];
const TEXTURE_PRESETS: EffectPreset[] = ['grain', 'scanlines'];
const TINT_PRESETS: EffectPreset[] = ['tint'];
const WARP_PRESETS: EffectPreset[] = ['noiseWarp', 'morph', 'vortex', 'barrel', 'tear', 'mirror', 'warp'];
const COLOR_PRESETS: EffectPreset[] = ['hueShift', 'rgbSplit', 'vignette', 'pixelate', 'posterize', 'color'];
const RISO_PRESETS: EffectPreset[] = ['duotone', 'halftone', 'risoShift', 'riso'];

function initialEffectSection(layer: EffectLayer): EffectSectionId {
  if (layer.preset && RAYS_PRESETS.includes(layer.preset)) return 'rays';
  if (layer.preset && GLITCH_PRESETS.includes(layer.preset)) return 'glitch';
  if (layer.preset && TEXTURE_PRESETS.includes(layer.preset)) return 'texture';
  if (layer.preset && TINT_PRESETS.includes(layer.preset)) return 'tint';
  if (layer.preset && WARP_PRESETS.includes(layer.preset)) return 'warp';
  if (layer.preset && COLOR_PRESETS.includes(layer.preset)) return 'color';
  if (layer.preset && RISO_PRESETS.includes(layer.preset)) return 'riso';
  return 'node';
}

function effectSectionSummary(layer: EffectLayer, section: EffectSectionId): string {
  const preset = layer.preset;
  switch (section) {
    case 'node':
      return layer.preset ?? 'custom';
    case 'rays':
      if (preset === 'bloom') return `${layer.bloom}% bloom`;
      if (preset === 'filmBurn') return `${layer.filmBurn}% burn`;
      return `${layer.rays} rays`;
    case 'glitch':
      if (preset === 'ca') return `${layer.ca} chroma`;
      if (preset === 'interlace') return `${layer.interlace}% interlace`;
      if (preset === 'dataMosh') return `${layer.dataMosh}% mosh`;
      return `${layer.glitch} / ${layer.ca}`;
    case 'texture':
      if (preset === 'scanlines') return `${layer.scanlines} lines`;
      return `${layer.grain} grain`;
    case 'tint':
      return `${layer.tintOp}%`;
    case 'warp':
      if (preset === 'noiseWarp') return `${layer.noiseWarp}%`;
      if (preset === 'morph') return `${layer.morphAmt}% morph`;
      if (preset === 'vortex') return `${layer.vortex}% vortex`;
      if (preset === 'barrel') return `${layer.barrel}% barrel`;
      if (preset === 'tear') return `${layer.tearAmt} tear`;
      if (preset === 'mirror') return `${layer.mirror}x mirror`;
      return `${layer.noiseWarp}%`;
    case 'color':
      if (preset === 'rgbSplit') return `${layer.rgbSplit} split`;
      if (preset === 'vignette') return `${layer.vignette}% vignette`;
      if (preset === 'pixelate') return `${layer.pixelate}px`;
      if (preset === 'posterize') return `${layer.posterize} bands`;
      return `${layer.hueShift}deg`;
    case 'riso':
      if (preset === 'halftone') return `${layer.halftone} tone`;
      if (preset === 'risoShift') return `${layer.risoShift}px`;
      return `${layer.duotone}%`;
  }
}

// ─── Effect inspector ─────────────────────────────────────────────────────────

function EffectInspector({
  layer,
  onChange,
  detached = false,
}: {
  layer: EffectLayer;
  onChange: (patch: Partial<EffectLayer>) => void;
  detached?: boolean;
}) {
  const [openSection, setOpenSection] = useState<EffectSectionId | null>(() => initialEffectSection(layer));
  const [infoState, setInfoState] = useState<{ key: string; rect: DOMRect } | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const handleInfoEnter = useCallback((key: string, rect: DOMRect) => {
    clearTimeout(closeTimerRef.current);
    setInfoState({ key, rect });
  }, []);
  const handleInfoLeave = useCallback(() => {
    closeTimerRef.current = setTimeout(() => setInfoState(null), 150);
  }, []);
  const showAllSections = !layer.preset;
  const showSection = (presets: readonly EffectPreset[]) => showAllSections || (layer.preset ? presets.includes(layer.preset) : false);
  const showControl = (presets: readonly EffectPreset[]) => showAllSections || (layer.preset ? presets.includes(layer.preset) : false);

  return (
    <div className={detached ? 'node-inspector-stack' : 'node-inspector-stack node-inspector-detached'}>
      <div className="node-badge-row">
        <span className="node-badge">
          {layer.preset ? EFFECT_PRESETS[layer.preset]?.name ?? layer.preset : 'custom'}
        </span>
        {showAllSections && (
          <span className="node-badge node-badge-accent">
            combined FX
          </span>
        )}
      </div>

      <InspectorSection
        title="Node"
        summary={effectSectionSummary(layer, 'node')}
        open={openSection === 'node'}
        onToggle={() => setOpenSection((current) => current === 'node' ? null : 'node')}
      >
        <InspectorTextInput value={layer.name} onChange={(value) => onChange({ name: value })} />
        <InspectorToggle label="Mask To Alpha" checked={layer.maskAlpha} onChange={(value) => onChange({ maskAlpha: value })} />
        <InspectorSelect label="Blend" value={layer.blendMode ?? 'normal'} options={BLEND_OPTIONS} onChange={(value) => onChange({ blendMode: value })} />
      </InspectorSection>

      {showSection(RAYS_PRESETS) && (
        <InspectorSection
          title="Light Rays"
          summary={effectSectionSummary(layer, 'rays')}
          open={openSection === 'rays'}
          onToggle={() => setOpenSection((current) => current === 'rays' ? null : 'rays')}
        >
          {showControl(['rays']) && (
            <>
              <InspectorColorInput label="Ray Color" value={layer.rayColor} onChange={(value) => onChange({ rayColor: value })} />
              <InspectorSlider label="Intensity" value={layer.rayInt} min={0} max={100} effectKey="rayInt" onInfoEnter={handleInfoEnter} onInfoLeave={handleInfoLeave} onChange={(value) => onChange({ rayInt: value })} />
              <InspectorSlider label="Count" value={layer.rays} min={0} max={32} effectKey="rays" onInfoEnter={handleInfoEnter} onInfoLeave={handleInfoLeave} onChange={(value) => onChange({ rays: value })} />
            </>
          )}
          {showControl(['bloom']) && <InspectorSlider label="Bloom" value={layer.bloom} min={0} max={100} effectKey="bloom" onInfoEnter={handleInfoEnter} onInfoLeave={handleInfoLeave} onChange={(value) => onChange({ bloom: value })} />}
          {showControl(['filmBurn']) && <InspectorSlider label="Film Burn" value={layer.filmBurn} min={0} max={100} effectKey="filmBurn" onInfoEnter={handleInfoEnter} onInfoLeave={handleInfoLeave} onChange={(value) => onChange({ filmBurn: value })} />}
        </InspectorSection>
      )}

      {showSection(GLITCH_PRESETS) && (
        <InspectorSection
          title="Glitch"
          summary={effectSectionSummary(layer, 'glitch')}
          open={openSection === 'glitch'}
          onToggle={() => setOpenSection((current) => current === 'glitch' ? null : 'glitch')}
        >
          {showControl(['glitch']) && <InspectorSlider label="VHS Streaks" value={layer.glitch} min={0} max={24} effectKey="glitch" onInfoEnter={handleInfoEnter} onInfoLeave={handleInfoLeave} onChange={(value) => onChange({ glitch: value })} />}
          {showControl(['ca']) && <InspectorSlider label="Chromatic" value={layer.ca} min={0} max={15} effectKey="ca" onInfoEnter={handleInfoEnter} onInfoLeave={handleInfoLeave} onChange={(value) => onChange({ ca: value })} />}
          {showControl(['interlace']) && <InspectorSlider label="Interlace" value={layer.interlace} min={0} max={100} effectKey="interlace" onInfoEnter={handleInfoEnter} onInfoLeave={handleInfoLeave} onChange={(value) => onChange({ interlace: value })} />}
          {showControl(['dataMosh']) && <InspectorSlider label="Data Mosh" value={layer.dataMosh} min={0} max={100} effectKey="dataMosh" onInfoEnter={handleInfoEnter} onInfoLeave={handleInfoLeave} onChange={(value) => onChange({ dataMosh: value })} />}
        </InspectorSection>
      )}

      {showSection(TEXTURE_PRESETS) && (
        <InspectorSection
          title="Texture"
          summary={effectSectionSummary(layer, 'texture')}
          open={openSection === 'texture'}
          onToggle={() => setOpenSection((current) => current === 'texture' ? null : 'texture')}
        >
          {showControl(['grain']) && <InspectorSlider label="Grain" value={layer.grain} min={0} max={70} effectKey="grain" onInfoEnter={handleInfoEnter} onInfoLeave={handleInfoLeave} onChange={(value) => onChange({ grain: value })} />}
          {showControl(['scanlines']) && <InspectorSlider label="Scanlines" value={layer.scanlines} min={0} max={50} effectKey="scanlines" onInfoEnter={handleInfoEnter} onInfoLeave={handleInfoLeave} onChange={(value) => onChange({ scanlines: value })} />}
        </InspectorSection>
      )}

      {showSection(TINT_PRESETS) && (
        <InspectorSection
          title="Tint"
          summary={effectSectionSummary(layer, 'tint')}
          open={openSection === 'tint'}
          onToggle={() => setOpenSection((current) => current === 'tint' ? null : 'tint')}
        >
          <InspectorColorInput label="Tint Color" value={layer.tint} onChange={(value) => onChange({ tint: value })} />
          <InspectorSlider label="Opacity" value={layer.tintOp} min={0} max={80} effectKey="tintOp" onInfoEnter={handleInfoEnter} onInfoLeave={handleInfoLeave} onChange={(value) => onChange({ tintOp: value })} />
        </InspectorSection>
      )}

      {showSection(WARP_PRESETS) && (
        <InspectorSection
          title="Warp"
          summary={effectSectionSummary(layer, 'warp')}
          open={openSection === 'warp'}
          onToggle={() => setOpenSection((current) => current === 'warp' ? null : 'warp')}
        >
          {showControl(['noiseWarp', 'warp']) && <InspectorSlider label="Noise Warp" value={layer.noiseWarp} min={0} max={100} effectKey="noiseWarp" onInfoEnter={handleInfoEnter} onInfoLeave={handleInfoLeave} onChange={(value) => onChange({ noiseWarp: value })} />}
          {showControl(['morph', 'warp']) && (
            <>
              <InspectorSlider label="Liquid Morph" value={layer.morphAmt} min={0} max={100} effectKey="morphAmt" onInfoEnter={handleInfoEnter} onInfoLeave={handleInfoLeave} onChange={(value) => onChange({ morphAmt: value })} />
              <InspectorSlider label="Morph Freq" value={layer.morphFreq} min={1} max={20} effectKey="morphFreq" onInfoEnter={handleInfoEnter} onInfoLeave={handleInfoLeave} onChange={(value) => onChange({ morphFreq: value })} />
            </>
          )}
          {showControl(['vortex', 'warp']) && <InspectorSlider label="Vortex" value={layer.vortex} min={0} max={100} effectKey="vortex" onInfoEnter={handleInfoEnter} onInfoLeave={handleInfoLeave} onChange={(value) => onChange({ vortex: value })} />}
          {showControl(['barrel', 'warp']) && <InspectorSlider label="Barrel" value={layer.barrel} min={0} max={100} effectKey="barrel" onInfoEnter={handleInfoEnter} onInfoLeave={handleInfoLeave} onChange={(value) => onChange({ barrel: value })} />}
          {showControl(['tear', 'warp']) && (
            <>
              <InspectorSlider label="Chunk Tear" value={layer.tearAmt} min={0} max={20} effectKey="tearAmt" onInfoEnter={handleInfoEnter} onInfoLeave={handleInfoLeave} onChange={(value) => onChange({ tearAmt: value })} />
              <InspectorSlider label="Tear Size" value={layer.tearSize} min={1} max={20} effectKey="tearSize" onInfoEnter={handleInfoEnter} onInfoLeave={handleInfoLeave} onChange={(value) => onChange({ tearSize: value })} />
            </>
          )}
          {showControl(['mirror', 'warp']) && <InspectorSlider label="Mirror" value={layer.mirror} min={0} max={3} effectKey="mirror" onInfoEnter={handleInfoEnter} onInfoLeave={handleInfoLeave} onChange={(value) => onChange({ mirror: value })} />}
        </InspectorSection>
      )}

      {showSection(COLOR_PRESETS) && (
        <InspectorSection
          title="Color FX"
          summary={effectSectionSummary(layer, 'color')}
          open={openSection === 'color'}
          onToggle={() => setOpenSection((current) => current === 'color' ? null : 'color')}
        >
          {showControl(['hueShift', 'color']) && <InspectorSlider label="Hue Shift" value={layer.hueShift} min={0} max={360} effectKey="hueShift" onInfoEnter={handleInfoEnter} onInfoLeave={handleInfoLeave} onChange={(value) => onChange({ hueShift: value })} />}
          {showControl(['rgbSplit']) && <InspectorSlider label="RGB Split" value={layer.rgbSplit} min={0} max={30} effectKey="rgbSplit" onInfoEnter={handleInfoEnter} onInfoLeave={handleInfoLeave} onChange={(value) => onChange({ rgbSplit: value })} />}
          {showControl(['vignette']) && <InspectorSlider label="Vignette" value={layer.vignette} min={0} max={100} effectKey="vignette" onInfoEnter={handleInfoEnter} onInfoLeave={handleInfoLeave} onChange={(value) => onChange({ vignette: value })} />}
          {showControl(['pixelate']) && <InspectorSlider label="Pixelate" value={layer.pixelate} min={0} max={20} effectKey="pixelate" onInfoEnter={handleInfoEnter} onInfoLeave={handleInfoLeave} onChange={(value) => onChange({ pixelate: value })} />}
          {showControl(['posterize', 'color']) && <InspectorSlider label="Posterize" value={layer.posterize} min={0} max={16} effectKey="posterize" onInfoEnter={handleInfoEnter} onInfoLeave={handleInfoLeave} onChange={(value) => onChange({ posterize: value })} />}
        </InspectorSection>
      )}

      {showSection(RISO_PRESETS) && (
        <InspectorSection
          title="Riso"
          summary={effectSectionSummary(layer, 'riso')}
          open={openSection === 'riso'}
          onToggle={() => setOpenSection((current) => current === 'riso' ? null : 'riso')}
        >
          {showControl(['duotone', 'riso']) && (
            <>
              <InspectorSlider label="Duotone" value={layer.duotone} min={0} max={100} effectKey="duotone" onInfoEnter={handleInfoEnter} onInfoLeave={handleInfoLeave} onChange={(value) => onChange({ duotone: value })} />
              <InspectorColorInput label="Shadow Color" value={layer.duoA} onChange={(value) => onChange({ duoA: value })} />
              <InspectorColorInput label="Light Color" value={layer.duoB} onChange={(value) => onChange({ duoB: value })} />
            </>
          )}
          {showControl(['halftone', 'riso']) && <InspectorSlider label="Halftone" value={layer.halftone} min={0} max={30} effectKey="halftone" onInfoEnter={handleInfoEnter} onInfoLeave={handleInfoLeave} onChange={(value) => onChange({ halftone: value })} />}
          {showControl(['risoShift', 'riso']) && (
            <>
              <InspectorSlider label="Misreg Shift" value={layer.risoShift} min={0} max={40} effectKey="risoShift" onInfoEnter={handleInfoEnter} onInfoLeave={handleInfoLeave} onChange={(value) => onChange({ risoShift: value })} />
              <InspectorSlider label="Misreg Angle" value={layer.risoAngle} min={0} max={360} effectKey="risoAngle" onInfoEnter={handleInfoEnter} onInfoLeave={handleInfoLeave} onChange={(value) => onChange({ risoAngle: value })} />
            </>
          )}
        </InspectorSection>
      )}
      {infoState && typeof document !== 'undefined' && createPortal(
        <EffectInfoPopup
          effectKey={infoState.key}
          anchorRect={infoState.rect}
          sidebarRight={infoState.rect.right}
          onMouseEnter={() => clearTimeout(closeTimerRef.current)}
          onMouseLeave={handleInfoLeave}
        />,
        document.body,
      )}
    </div>
  );
}

function ScaleLockRow({
  scaleX,
  scaleY,
  locked,
  onLockChange,
  onChange,
}: {
  scaleX: number;
  scaleY: number;
  locked: boolean;
  onLockChange: (locked: boolean) => void;
  onChange: (patch: { scaleX?: number; scaleY?: number }) => void;
}) {
  return (
    <div className="node-scale-row">
      <div className="node-scale-controls">
        {locked ? (
          <InspectorSlider
            label="Scale"
            value={Math.round(scaleX * 100)}
            min={5}
            max={500}
            onChange={(v) => onChange({ scaleX: v / 100, scaleY: v / 100 })}
          />
        ) : (
          <>
            <InspectorSlider label="Scale X" value={Math.round(scaleX * 100)} min={5} max={500} onChange={(v) => onChange({ scaleX: v / 100 })} />
            <InspectorSlider label="Scale Y" value={Math.round(scaleY * 100)} min={5} max={500} onChange={(v) => onChange({ scaleY: v / 100 })} />
          </>
        )}
      </div>
      <NoPan
        as="button"
        type="button"
        className={`node-scale-lock${locked ? ' node-scale-lock-active' : ''}`}
        onClick={() => onLockChange(!locked)}
        title={locked ? 'Unlock X/Y scale' : 'Lock X/Y scale'}
        aria-label={locked ? 'Unlock X/Y scale' : 'Lock X/Y scale'}
      >
        {locked ? '⛓' : '⛓‍💥'}
      </NoPan>
    </div>
  );
}

function LayerInspector({
  layer,
  onChange,
  detached = false,
}: {
  layer: Layer;
  onChange: (patch: Partial<Layer>) => void;
  detached?: boolean;
}) {
  const [scaleLocked, setScaleLocked] = useState(true);
  const sectionClassName = detached ? 'node-inspector-stack' : 'node-inspector-stack node-inspector-detached';

  if (layer.kind === 'text') {
    return (
      <div className={sectionClassName}>
        <InspectorTextInput value={layer.name} onChange={(value) => onChange({ name: value })} />
        <InspectorTextArea value={layer.content} onChange={(value) => onChange({ content: value } as Partial<TextLayer>)} />
        <InspectorSlider label="Size" value={layer.size} min={12} max={160} onChange={(value) => onChange({ size: value } as Partial<TextLayer>)} />
        <InspectorColorInput label="Color" value={layer.color} onChange={(value) => onChange({ color: value } as Partial<TextLayer>)} />
        <InspectorSlider label="X Position" value={Math.round(layer.x * 100)} min={-200} max={200} onChange={(value) => onChange({ x: value / 100 } as Partial<TextLayer>)} />
        <InspectorSlider label="Y Position" value={Math.round(layer.y * 100)} min={-200} max={200} onChange={(value) => onChange({ y: value / 100 } as Partial<TextLayer>)} />
        <InspectorSlider label="Rotation" value={Math.round(layer.rotation)} min={-180} max={180} onChange={(value) => onChange({ rotation: value } as Partial<TextLayer>)} />
        <ScaleLockRow
          scaleX={layer.scaleX}
          scaleY={layer.scaleY}
          locked={scaleLocked}
          onLockChange={setScaleLocked}
          onChange={(patch) => onChange(patch as Partial<TextLayer>)}
        />
        <InspectorSelect label="Align" value={layer.align} options={['left', 'center', 'right']} onChange={(value) => onChange({ align: value as TextLayer['align'] } as Partial<TextLayer>)} />
        <InspectorSlider label="Opacity" value={layer.opacity} min={0} max={100} onChange={(value) => onChange({ opacity: value })} />
        <InspectorSelect label="Blend" value={layer.blendMode} options={BLEND_OPTIONS} onChange={(value) => onChange({ blendMode: value })} />
      </div>
    );
  }
  if (layer.kind === 'image') {
    return (
      <div className={sectionClassName}>
        <InspectorTextInput value={layer.name} onChange={(value) => onChange({ name: value })} />
        <InspectorSelect label="Fit" value={layer.fit} options={['cover', 'contain', 'tile', 'free']} onChange={(value) => onChange({ fit: value } as Partial<ImageLayer>)} />
        <InspectorSlider label="X Position" value={Math.round(layer.x * 100)} min={-200} max={200} onChange={(value) => onChange({ x: value / 100 } as Partial<ImageLayer>)} />
        <InspectorSlider label="Y Position" value={Math.round(layer.y * 100)} min={-200} max={200} onChange={(value) => onChange({ y: value / 100 } as Partial<ImageLayer>)} />
        <ScaleLockRow
          scaleX={layer.scaleX}
          scaleY={layer.scaleY}
          locked={scaleLocked}
          onLockChange={setScaleLocked}
          onChange={(patch) => onChange(patch as Partial<ImageLayer>)}
        />
        <InspectorSlider label="Rotation" value={Math.round(layer.rotation)} min={-180} max={180} onChange={(value) => onChange({ rotation: value } as Partial<ImageLayer>)} />
        <InspectorSlider label="Opacity" value={layer.opacity} min={0} max={100} onChange={(value) => onChange({ opacity: value })} />
        <InspectorSelect label="Blend" value={layer.blendMode} options={BLEND_OPTIONS} onChange={(value) => onChange({ blendMode: value })} />
      </div>
    );
  }
  if (layer.kind === 'fill') {
    return (
      <div className={sectionClassName}>
        <InspectorTextInput value={layer.name} onChange={(value) => onChange({ name: value })} />
        <InspectorColorInput label="Color" value={layer.color} onChange={(value) => onChange({ color: value } as Partial<FillLayer>)} />
        <InspectorSlider label="Opacity" value={layer.opacity} min={0} max={100} onChange={(value) => onChange({ opacity: value })} />
        <InspectorSelect label="Blend" value={layer.blendMode} options={BLEND_OPTIONS} onChange={(value) => onChange({ blendMode: value })} />
      </div>
    );
  }
  if (layer.kind === 'emoji') {
    return (
      <div className={sectionClassName}>
        <InspectorTextInput value={layer.name} onChange={(value) => onChange({ name: value })} />
        <InspectorSlider label="Density" value={layer.density} min={1} max={100} onChange={(value) => onChange({ density: value } as Partial<EmojiLayer>)} />
        <InspectorSlider label="Blur" value={layer.blur} min={0} max={100} onChange={(value) => onChange({ blur: value } as Partial<EmojiLayer>)} />
        <InspectorSlider label="Opacity" value={layer.opacity} min={0} max={100} onChange={(value) => onChange({ opacity: value })} />
      </div>
    );
  }
  return <EffectInspector layer={layer} onChange={(patch) => onChange(patch as Partial<Layer>)} detached={detached} />;
}

function MergeInspector({
  mergeNode,
  onChange,
  detached = false,
}: {
  mergeNode: GraphMergeNode;
  onChange: (patch: Partial<GraphMergeNode>) => void;
  detached?: boolean;
}) {
  return (
    <div className={detached ? 'node-inspector-stack' : 'node-inspector-stack node-inspector-detached'}>
      <InspectorTextInput value={mergeNode.name} onChange={(value) => onChange({ name: value })} />
      <InspectorSelect label="Blend" value={mergeNode.blendMode} options={BLEND_OPTIONS} onChange={(value) => onChange({ blendMode: value })} />
      <InspectorSlider label="Opacity" value={mergeNode.opacity} min={0} max={100} onChange={(value) => onChange({ opacity: value })} />
    </div>
  );
}

function ExportInspector({
  exportConfig,
  aspect,
  busy,
  onChange,
  onAspectChange,
  onExport,
}: {
  exportConfig: CanvasDocument['export'];
  aspect: AspectRatio;
  busy: boolean;
  onChange: (patch: Partial<CanvasDocument['export']>) => void;
  onAspectChange: (aspect: AspectRatio) => void;
  onExport: () => void;
}) {
  const [width, height] = ASPECT_SIZES[aspect ?? '1:1'];

  return (
    <div className="node-inspector-stack">
      <InspectorSelect label="Target" value={exportConfig.target} options={['cover', 'envmap']} onChange={(value) => onChange({ target: value as CanvasDocument['export']['target'] })} />
      <InspectorSelect
        label="Aspect"
        value={aspect}
        options={['1:1', '4:5', '9:16', '16:9']}
        onChange={(value) => onAspectChange(value as AspectRatio)}
      />
      {exportConfig.target === 'cover' && (
        <>
          <InspectorSelect label="Format" value={exportConfig.format} options={['png', 'jpeg']} onChange={(value) => onChange({ format: value as CanvasDocument['export']['format'] })} />
          <InspectorSelect label="Scale" value={String(exportConfig.scale)} options={['1', '2', '3']} onChange={(value) => onChange({ scale: Number(value) as CanvasDocument['export']['scale'] })} />
          <InspectorLabel>{`${width * exportConfig.scale} × ${height * exportConfig.scale}`}</InspectorLabel>
        </>
      )}
      {exportConfig.target === 'envmap' && (
        <InspectorLabel>4096 × 2048 png</InspectorLabel>
      )}
      <NoPan
        as="button"
        type="button"
        className="node-shell-action node-export-button"
        onClick={onExport}
        disabled={busy}
      >
        {busy ? 'exporting…' : '↗ export now'}
      </NoPan>
    </div>
  );
}

// ─── Port row (data-driven connected state) ───────────────────────────────────

interface PortRowProps {
  inputs: Array<{ label: string; portId: string; nodeId: string }>;
  outputs: Array<{ label: string; portId: string; nodeId: string }>;
  connected: { sources: Set<string>; targets: Set<string> };
}

function PortRow({ inputs, outputs, connected }: PortRowProps) {
  const dot = (nodeId: string, portId: string, isTarget: boolean) => {
    const key = `${nodeId}::${portId}`;
    const isConnected = isTarget ? connected.targets.has(key) : connected.sources.has(key);
    return (
      <div style={{
        width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
        background: isConnected ? 'oklch(60% 0.09 192)' : 'transparent',
        border: `1px solid ${isConnected ? 'oklch(60% 0.09 192)' : 'oklch(38% 0.018 285)'}`,
        transition: 'background 120ms, border-color 120ms',
      }} />
    );
  };

  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
      paddingTop: 4, minHeight: 20,
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {inputs.map(({ label, portId, nodeId }) => (
          <div key={portId} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            {dot(nodeId, portId, true)}
            <span style={{ color: 'oklch(42% 0.013 285)', fontSize: 9, fontFamily: 'var(--mono)' }}>
              {label}
            </span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
        {outputs.map(({ label, portId, nodeId }) => (
          <div key={portId} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ color: 'oklch(42% 0.013 285)', fontSize: 9, fontFamily: 'var(--mono)' }}>
              {label}
            </span>
            {dot(nodeId, portId, false)}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Layer node ───────────────────────────────────────────────────────────────

type LayerNodeData = {
  layer: Layer;
  previewTargetId: string;
  selected: boolean;
  editing: boolean;
  connected: { sources: Set<string>; targets: Set<string> };
};

const LayerNodeComponent = memo(function LayerNodeComponent({ data }: NodeProps<LayerNodeData>) {
  const { selectNode, toggleNodeEditor, updateLayer } = useNodeCanvasActions();
  const { layer, previewTargetId, selected, editing, connected } = data;
  const isEffect = layer.kind === 'effect';
  const inputPort = isEffect ? 'in' : 'bg';

  return (
    <div
      onClick={(event) => selectNode(layer.id, event)}
      onDoubleClick={(event) => {
        stopNodeEvent(event);
        toggleNodeEditor(layer.id);
      }}
      style={{ position: 'relative', zIndex: editing ? 4 : 1 }}
    >
      <Handle type="target" position={Position.Left} id={inputPort} style={HANDLE_STYLE} />
      <NodeShell
        kind={layer.kind}
        label={layer.kind}
        name={layer.name}
        selected={selected}
        expanded={editing}
        expandable
        onToggleExpanded={() => toggleNodeEditor(layer.id)}
      >
        <NodeThumbnail previewTargetId={previewTargetId} />
        <PortRow
          inputs={[{ label: isEffect ? 'in' : 'bg?', portId: inputPort, nodeId: layer.id }]}
          outputs={[{ label: 'out', portId: 'out', nodeId: layer.id }]}
          connected={connected}
        />
      </NodeShell>
      {editing && (
        <NodeEditorPanel
          kind={layer.kind}
          title={layer.name}
          subtitle={layer.kind === 'effect' ? `effect, ${layer.preset ? (EFFECT_PRESETS[layer.preset]?.name ?? layer.preset).toLowerCase() : 'custom'}` : `${layer.kind} settings`}
          onClose={() => toggleNodeEditor(layer.id)}
        >
          <LayerInspector layer={layer} onChange={(patch) => updateLayer(layer.id, patch)} detached />
        </NodeEditorPanel>
      )}
      <Handle type="source" position={Position.Right} id="out" style={HANDLE_STYLE} />
    </div>
  );
});

// ─── Merge node ───────────────────────────────────────────────────────────────

type MergeNodeData = {
  mergeNode: GraphMergeNode;
  previewTargetId: string;
  selected: boolean;
  editing: boolean;
  connected: { sources: Set<string>; targets: Set<string> };
};

const MergeNodeComponent = memo(function MergeNodeComponent({ data }: NodeProps<MergeNodeData>) {
  const { selectNode, deleteNode, toggleNodeEditor, updateMergeNode } = useNodeCanvasActions();
  const { mergeNode, previewTargetId, selected, editing, connected } = data;

  return (
    <div
      onClick={(event) => selectNode(mergeNode.id, event)}
      onDoubleClick={(event) => {
        stopNodeEvent(event);
        toggleNodeEditor(mergeNode.id);
      }}
      style={{ position: 'relative', zIndex: editing ? 4 : 1 }}
    >
      <Handle type="target" id="a" position={Position.Left}
        style={{ ...HANDLE_STYLE, top: '36%' }} />
      <Handle type="target" id="b" position={Position.Left}
        style={{ ...HANDLE_STYLE, top: '64%' }} />
      <NodeShell
        kind="merge"
        label="merge"
        name={mergeNode.name}
        selected={selected}
        expanded={editing}
        expandable
        onToggleExpanded={() => toggleNodeEditor(mergeNode.id)}
        onDelete={() => deleteNode(mergeNode.id)}
      >
        <NodeThumbnail previewTargetId={previewTargetId} />
        <PortRow
          inputs={[
            { label: 'a', portId: 'a', nodeId: mergeNode.id },
            { label: 'b', portId: 'b', nodeId: mergeNode.id },
          ]}
          outputs={[{ label: 'out', portId: 'out', nodeId: mergeNode.id }]}
          connected={connected}
        />
      </NodeShell>
      {editing && (
        <NodeEditorPanel
          kind="merge"
          title={mergeNode.name}
          subtitle="merge settings"
          onClose={() => toggleNodeEditor(mergeNode.id)}
        >
          <MergeInspector mergeNode={mergeNode} onChange={(patch) => updateMergeNode(mergeNode.id, patch)} detached />
        </NodeEditorPanel>
      )}
      <Handle type="source" id="out" position={Position.Right} style={HANDLE_STYLE} />
    </div>
  );
});

// ─── Export node ──────────────────────────────────────────────────────────────

type ExportNodeData = {
  exportConfig: CanvasDocument['export'];
  aspect: AspectRatio;
  previewTargetId: string;
  selected: boolean;
  editing: boolean;
  connected: { sources: Set<string>; targets: Set<string> };
  busy: boolean;
};

const ExportNodeComponent = memo(function ExportNodeComponent({ data }: NodeProps<ExportNodeData>) {
  const { selectNode, toggleNodeEditor, updateExportConfig, updateAspectRatio, exportNode } = useNodeCanvasActions();
  const { exportConfig, aspect, previewTargetId, selected, editing, connected, busy } = data;

  return (
    <div
      onClick={(event) => selectNode(EXPORT_NODE_ID, event)}
      onDoubleClick={(event) => {
        stopNodeEvent(event);
        toggleNodeEditor(EXPORT_NODE_ID);
      }}
      style={{ position: 'relative', zIndex: editing ? 4 : 1 }}
    >
      <Handle type="target" id="in" position={Position.Left} style={HANDLE_STYLE} />
      <NodeShell
        kind="export"
        label="export"
        name="Output"
        selected={selected}
        expanded={editing}
        expandable
        onToggleExpanded={() => toggleNodeEditor(EXPORT_NODE_ID)}
      >
        <NodeThumbnail previewTargetId={previewTargetId} />
        <PortRow
          inputs={[{ label: 'in', portId: 'in', nodeId: EXPORT_NODE_ID }]}
          outputs={[]}
          connected={connected}
        />
      </NodeShell>
      {editing && (
        <NodeEditorPanel
          kind="export"
          title="Output"
          subtitle="export settings"
          onClose={() => toggleNodeEditor(EXPORT_NODE_ID)}
        >
          <ExportInspector
            exportConfig={exportConfig}
            aspect={aspect}
            busy={busy}
            onChange={updateExportConfig}
            onAspectChange={updateAspectRatio}
            onExport={exportNode}
          />
        </NodeEditorPanel>
      )}
    </div>
  );
});

const nodeTypes = {
  layerNode: LayerNodeComponent,
  mergeNode: MergeNodeComponent,
  exportNode: ExportNodeComponent,
};

const RF_PRO_OPTIONS = { hideAttribution: false };

function distancePointToSegment(
  point: { x: number; y: number },
  start: { x: number; y: number },
  end: { x: number; y: number },
) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)));
  const px = start.x + t * dx;
  const py = start.y + t * dy;
  return Math.hypot(point.x - px, point.y - py);
}

function InspectorLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="node-inspector-label">
      {children}
    </span>
  );
}

function InspectorColorInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="node-inspector-row">
      <InspectorLabel>{label}</InspectorLabel>
      <input
        className="node-color-input"
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function InspectorSection({
  title,
  summary,
  open,
  onToggle,
  children,
}: {
  title: string;
  summary?: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className={`node-inspector-section${open ? ' node-inspector-section-open' : ''}`}>
      <NoPan
        as="button"
        type="button"
        className="node-section-button node-inspector-section-button"
        aria-expanded={open}
        onClick={onToggle}
      >
        <div className="node-inspector-section-copy">
          <span className="node-inspector-section-title">
            {title}
          </span>
          {summary && (
            <span className="node-inspector-section-summary">
              {summary}
            </span>
          )}
        </div>
        <span className="node-inspector-section-toggle">
          {open ? '−' : '+'}
        </span>
      </NoPan>
      {open && (
        <div className="node-inspector-section-body">
          {children}
        </div>
      )}
    </div>
  );
}

function InspectorTextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      className="node-field"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function InspectorTextArea({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <textarea
      className="node-field node-field-textarea"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={3}
    />
  );
}

function InspectorSlider({
  label,
  value,
  min,
  max,
  step = 1,
  effectKey,
  onInfoEnter,
  onInfoLeave,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  effectKey?: string;
  onInfoEnter?: (key: string, rect: DOMRect) => void;
  onInfoLeave?: () => void;
  onChange: (value: number) => void;
}) {
  const infoRef = useRef<HTMLButtonElement>(null);
  return (
    <div className="node-inspector-control">
      <div className="node-inspector-control-header">
        <span className="node-inspector-control-label">
          <InspectorLabel>{label}</InspectorLabel>
          {effectKey && onInfoEnter && (
            <NoPan
              as="button"
              ref={infoRef}
              type="button"
              className="node-shell-action node-info-button"
              onMouseEnter={() => {
                if (infoRef.current) onInfoEnter(effectKey, infoRef.current.getBoundingClientRect());
              }}
              onMouseLeave={onInfoLeave}
              aria-label={`About ${label}`}
            >
              i
            </NoPan>
          )}
        </span>
        <span className="node-inspector-value">{value}</span>
      </div>
      <input
        className="node-slider"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

function InspectorSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="node-inspector-control">
      <InspectorLabel>{label}</InspectorLabel>
      <select
        className="node-field"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </div>
  );
}

function InspectorToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <NoPan as="label" className="node-inspector-toggle">
      <InspectorLabel>{label}</InspectorLabel>
      <input
        className="node-check"
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </NoPan>
  );
}

// ─── Context menus ────────────────────────────────────────────────────────────

interface PaneMenuProps {
  x: number;
  y: number;
  onAdd: (action: AddAction) => void;
  onClose: () => void;
  menuRef: React.RefObject<HTMLDivElement | null>;
}

function PaneContextMenu({ x, y, onAdd, onClose, menuRef }: PaneMenuProps) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return ADD_ITEMS;
    return ADD_ITEMS.filter((item) => item.label.toLowerCase().includes(q) || item.group.includes(q));
  }, [query]);

  const groups = useMemo(() => {
    const seen = new Set<string>();
    const result: Array<{ header: string | null; item: typeof ADD_ITEMS[number] }> = [];
    for (const item of filtered) {
      if (!seen.has(item.group)) {
        seen.add(item.group);
        result.push({ header: item.group, item });
      } else {
        result.push({ header: null, item });
      }
    }
    return result;
  }, [filtered]);

  return (
    <NoPan
      ref={menuRef}
      className="node-menu"
      style={{ left: x, top: y, width: 220 } as CSSProperties}
    >
      <div className="node-menu-search">
        <span className="node-menu-search-icon">⌕</span>
        <input
          ref={inputRef}
          className="node-menu-search-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'Enter' && filtered.length > 0) {
              onAdd(filtered[0].action);
              onClose();
            }
          }}
          placeholder="Add node…"
        />
      </div>

      <div className="node-menu-list">
        {groups.length === 0 && (
          <div className="node-menu-empty">
            No results
          </div>
        )}
        {groups.map(({ header, item }, i) => (
          <div key={i}>
            {header && !query && (
              <div className="node-menu-group">
                {header}
              </div>
            )}
            <NoPan
              as="button"
              type="button"
              onClick={() => { onAdd(item.action); onClose(); }}
              className="node-menu-item"
            >
              <span className="node-menu-item-symbol" style={{ color: KIND_COLOR[item.action.kind === 'layer' ? item.action.layerKind : item.action.kind === 'effect' ? 'effect' : 'merge'] }}>
                {item.symbol}
              </span>
              <span className="node-menu-item-label">
                {item.label}
              </span>
            </NoPan>
          </div>
        ))}
      </div>
    </NoPan>
  );
}

interface NodeMenuProps {
  x: number;
  y: number;
  isMerge: boolean;
  isExport: boolean;
  onDuplicate: () => void;
  onDelete: () => void;
  onClose: () => void;
  menuRef: React.RefObject<HTMLDivElement | null>;
}

function NodeContextMenu({ x, y, isMerge, isExport, onDuplicate, onDelete, onClose, menuRef }: NodeMenuProps) {
  const items: Array<{ label: string; hint?: string; action: () => void; danger?: boolean; dividerBefore?: boolean }> = [];

  if (!isMerge && !isExport) {
    items.push({ label: 'Duplicate', hint: '⌘D', action: onDuplicate });
  }
  if (!isExport) {
    items.push({ label: 'Delete', hint: '⌫', action: onDelete, danger: true, dividerBefore: !isMerge && items.length > 0 });
  }

  if (items.length === 0) return null;

  return (
    <NoPan
      ref={menuRef}
      className="node-menu"
      style={{ left: x, top: y, width: 200, padding: '4px 0' } as CSSProperties}
    >
      {items.map((item, i) => (
        <div key={i}>
          {item.dividerBefore && (
            <div className="node-menu-divider" />
          )}
          <NoPan
            as="button"
            type="button"
            onClick={() => { item.action(); onClose(); }}
            className="node-menu-item node-menu-item-between"
          >
            <span className={`node-menu-item-label${item.danger ? ' node-menu-item-danger' : ''}`}>
              {item.label}
            </span>
            {item.hint && (
              <span className="node-menu-item-hint">
                {item.hint}
              </span>
            )}
          </NoPan>
        </div>
      ))}
    </NoPan>
  );
}

// ─── buildRFNodes ─────────────────────────────────────────────────────────────

function buildRFNodes(
  doc: CanvasDocument,
  graph: CanvasGraph,
  selectedNodeIds: Set<string>,
  editorNodeId: string | null,
  connected: { sources: Set<string>; targets: Set<string> },
  exportBusy: boolean,
): RFNode[] {
  const nodes: RFNode[] = [];

  doc.layers.forEach((layer, i) => {
    const pos = graph.positions[layer.id] ?? { x: i * (NODE_W + 56), y: 80 };
    nodes.push({
      id: layer.id,
      type: 'layerNode',
      position: pos,
      data: {
        layer,
        previewTargetId: layer.id,
        selected: selectedNodeIds.has(layer.id),
        editing: editorNodeId === layer.id,
        connected,
      } satisfies LayerNodeData,
    });
  });

  graph.mergeNodes.forEach((mn) => {
    const pos = graph.positions[mn.id] ?? { x: 400, y: 300 };
    nodes.push({
      id: mn.id,
      type: 'mergeNode',
      position: pos,
      data: {
        mergeNode: mn,
        previewTargetId: mn.id,
        selected: selectedNodeIds.has(mn.id),
        editing: editorNodeId === mn.id,
        connected,
      } satisfies MergeNodeData,
    });
  });

  const exportPos = graph.positions[EXPORT_NODE_ID] ?? {
    x: doc.layers.length * (NODE_W + 56), y: 80,
  };
  nodes.push({
    id: EXPORT_NODE_ID,
    type: 'exportNode',
    position: exportPos,
    data: {
      exportConfig: doc.export,
      aspect: doc.global.aspect,
      previewTargetId: EXPORT_NODE_ID,
      selected: selectedNodeIds.has(EXPORT_NODE_ID),
      editing: editorNodeId === EXPORT_NODE_ID,
      connected,
      busy: exportBusy,
    } satisfies ExportNodeData,
  });

  return nodes;
}

// ─── NodeCanvas ───────────────────────────────────────────────────────────────

export interface NodeCanvasProps {
  doc: CanvasDocument;
  imageCache: Map<string, HTMLImageElement>;
  selectedLayerId: string | null;
  onSelectLayer: (id: string | null) => void;
  onGraphChange: (graph: CanvasGraph) => void;
  onUpdateLayer: (id: string, patch: Partial<Layer>) => void;
  onUpdateMergeNode: (id: string, patch: Partial<GraphMergeNode>) => void;
  onUpdateExportConfig: (patch: Partial<CanvasDocument['export']>) => void;
  onUpdateAspectRatio: (aspect: AspectRatio) => void;
  exportBusy: boolean;
  onExport: () => void;
  onAddLayerAt: (action: AddAction, position: { x: number; y: number }, insertion?: InsertConnectionConfig) => void;
  onDeleteNodes: (ids: string[]) => void;
  onDuplicateLayer: (id: string) => void;
}

export function NodeCanvas({
  doc,
  imageCache,
  selectedLayerId,
  onSelectLayer,
  onGraphChange,
  onUpdateLayer,
  onUpdateMergeNode,
  onUpdateExportConfig,
  onUpdateAspectRatio,
  exportBusy,
  onExport,
  onAddLayerAt,
  onDeleteNodes,
  onDuplicateLayer,
}: NodeCanvasProps) {
  const graph = useMemo(
    () => doc.graph ?? inferLinearGraph(doc.layers),
    [doc.graph, doc.layers],
  );

  const graphRef = useRef(graph);
  useLayoutEffect(() => { graphRef.current = graph; }, [graph]);

  const connected = useMemo(() => connectedPortIds(graph), [graph]);

  const rfInstanceRef = useRef<ReactFlowInstance | null>(null);
  const fittedRef = useRef(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const [uiState, dispatchUi] = useReducer(reduceNodeCanvasUi, {
    selectedNodeIds: selectedLayerId ? [selectedLayerId] : [],
    selectedEdgeId: null,
    expandedNodeId: null,
  });
  const selectedNodeIdSet = useMemo(() => new Set(uiState.selectedNodeIds), [uiState.selectedNodeIds]);
  const handleSelectNode = useCallback((id: string, event?: React.MouseEvent) => {
    dispatchUi({ type: 'NODE_SELECTED', id, additive: isAdditiveSelectionEvent(event) });
  }, []);
  const handleToggleEditor = useCallback((id: string) => {
    dispatchUi({ type: 'NODE_EDITOR_TOGGLED', id });
  }, []);
  const activeEditorNodeId = useMemo(() => {
    if (!uiState.expandedNodeId) return null;
    const exists = uiState.expandedNodeId === EXPORT_NODE_ID
      || doc.layers.some((layer) => layer.id === uiState.expandedNodeId)
      || graph.mergeNodes.some((node) => node.id === uiState.expandedNodeId);
    return exists ? uiState.expandedNodeId : null;
  }, [doc.layers, graph.mergeNodes, uiState.expandedNodeId]);
  const selectedNodeId = uiState.selectedNodeIds.length === 1 ? uiState.selectedNodeIds[0] : null;

  const selectedNodeIdRef = useRef(selectedNodeId);
  const selectedEdgeIdRef = useRef(uiState.selectedEdgeId);
  useLayoutEffect(() => {
    selectedNodeIdRef.current = selectedNodeId;
    selectedEdgeIdRef.current = uiState.selectedEdgeId;
  }, [selectedNodeId, uiState.selectedEdgeId]);

  useEffect(() => {
    onSelectLayer(selectedNodeId);
  }, [onSelectLayer, selectedNodeId]);

  // Sync only when parent's selectedLayerId prop actually changes — re-running on
  // selectedNodeId would race with the onSelectLayer effect above and ping-pong.
  useEffect(() => {
    if (!selectedLayerId) return;
    if (selectedNodeIdRef.current === selectedLayerId && !selectedEdgeIdRef.current) return;
    dispatchUi({ type: 'SYNC_EXTERNAL_NODE', id: selectedLayerId });
  }, [selectedLayerId]);

  useEffect(() => {
    const validNodeIds = [...doc.layers.map((layer) => layer.id), ...graph.mergeNodes.map((node) => node.id), EXPORT_NODE_ID];
    const validEdgeIds = graph.edges.map((edge) => edge.id);
    dispatchUi({ type: 'FILTER_INVALID_REFERENCES', validNodeIds, validEdgeIds });
  }, [doc.layers, graph.edges, graph.mergeNodes]);

  const previewContextValue = useMemo<NodeCanvasPreviewContextValue>(() => ({
    doc,
    graph,
    imageCache,
  }), [doc, graph, imageCache]);

  const actionsContextValue = useMemo<NodeCanvasActionsContextValue>(() => ({
    selectNode: handleSelectNode,
    toggleNodeEditor: handleToggleEditor,
    updateLayer: onUpdateLayer,
    updateMergeNode: onUpdateMergeNode,
    updateExportConfig: onUpdateExportConfig,
    updateAspectRatio: onUpdateAspectRatio,
    exportNode: onExport,
    deleteNode: (id: string) => onDeleteNodes([id]),
  }), [handleSelectNode, handleToggleEditor, onDeleteNodes, onExport, onUpdateAspectRatio, onUpdateExportConfig, onUpdateLayer, onUpdateMergeNode]);

  // ── Single source of truth: derive display nodes/edges directly from doc ──
  // No local copy — any change to doc.layers or doc.graph is immediately reflected.
  const baseNodes = useMemo(
    () => buildRFNodes(
        doc,
        graph,
        selectedNodeIdSet,
        activeEditorNodeId,
        connected,
        exportBusy,
      ),
    [doc, graph, selectedNodeIdSet, activeEditorNodeId, connected, exportBusy],
  );
  const baseEdges = useMemo(
    () => toRFEdges(graph).map((edge) => ({
      ...edge,
      selected: uiState.selectedEdgeId === edge.id,
      style: {
        ...edge.style,
        stroke: uiState.selectedEdgeId === edge.id ? 'oklch(78% 0.02 285)' : edge.style?.stroke,
        strokeWidth: uiState.selectedEdgeId === edge.id ? 2.5 : edge.style?.strokeWidth,
        opacity: uiState.selectedEdgeId === null || uiState.selectedEdgeId === edge.id ? 0.75 : 0.45,
      },
    })),
    [graph, uiState.selectedEdgeId],
  );

  // Local state only for smooth drag position tracking between drag-start and drag-stop.
  // On drag-stop the position is committed to doc.graph and baseNodes takes over again.
  const [dragNodes, setDragNodes] = useState<RFNode[]>(baseNodes);
  const [dragEdges, setDragEdges] = useState<RFEdge[]>(baseEdges);
  const isDraggingRef = useRef(false);
  const dragNodesRef = useRef<RFNode[]>(dragNodes);
  useLayoutEffect(() => { dragNodesRef.current = dragNodes; }, [dragNodes]);

  // Whenever the canonical doc-derived nodes change (layer added/removed/renamed,
  // selection changed, etc.) and we are NOT mid-drag, push them into RF state.
  // useEffect (async) prevents the synchronous setState inside React's layout commit
  // phase that causes ReactFlow's internal zustand setNodes to cascade into an
  // infinite update loop when dragging then clicking.
  useEffect(() => {
    if (!isDraggingRef.current) {
      setDragNodes(baseNodes);
      setDragEdges(baseEdges);
    }
  }, [baseNodes, baseEdges]);

  // During drag: apply ReactFlow position/dimension/select changes locally so the
  // node follows the cursor. On drag-stop we commit the final position to doc.graph.
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    const relevant = changes.filter((c) => c.type !== 'remove' && c.type !== 'select');
    if (relevant.length) setDragNodes((prev) => applyNodeChanges(relevant, prev));
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setDragEdges((prev) => applyEdgeChanges(changes, prev));
  }, []);

  // Fit view once when nodes first appear.
  useEffect(() => {
    if (!fittedRef.current && dragNodes.length > 0 && rfInstanceRef.current) {
      fittedRef.current = true;
      setTimeout(() => rfInstanceRef.current?.fitView({ padding: 0.2, duration: 0 }), 0);
    }
  }, [dragNodes.length]);

  // Dismiss context menu on Escape or click outside
  useEffect(() => {
    if (!contextMenu) return;
    const dismiss = () => setContextMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') dismiss(); };
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target;
      if (target instanceof Node && contextMenuRef.current?.contains(target)) return;
      dismiss();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [contextMenu]);

  const isValidConnection = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return false;
      if (connection.source === connection.target) return false;
      return !wouldCreateCycle(graphRef.current, connection.source, connection.target);
    },
    [],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      const edge: GraphEdge = {
        id: `e-${connection.source}-${connection.target}-${Date.now()}`,
        fromId: connection.source,
        fromPort: 'out',
        toId: connection.target,
        toPort: (connection.targetHandle ?? 'in') as GraphEdge['toPort'],
      };
      onGraphChange(addGraphEdge(graphRef.current, edge));
    },
    [onGraphChange],
  );

  const onEdgesDelete = useCallback(
    (deleted: RFEdge[]) => {
      let g = graphRef.current;
      for (const e of deleted) g = removeGraphEdge(g, e.id);
      dispatchUi({ type: 'EDGE_IDS_REMOVED', ids: deleted.map((edge) => edge.id) });
      onGraphChange(g);
    },
    [onGraphChange],
  );

  const commitNodePositions = useCallback((nodes: RFNode[]) => {
    const moved = nodes.map((node) => ({ id: node.id, position: node.position }));
    if (moved.length === 0) return;
    onGraphChange(updateGraphPositions(graphRef.current, moved));
  }, [onGraphChange]);

  const getInterceptInputPort = useCallback((nodeId: string): GraphEdge['toPort'] | null => {
    if (nodeId === EXPORT_NODE_ID) return null;
    if (graphRef.current.mergeNodes.some((mergeNode) => mergeNode.id === nodeId)) return 'a';
    const layer = doc.layers.find((item) => item.id === nodeId);
    if (!layer) return null;
    return layer.kind === 'effect' ? 'in' : 'bg';
  }, [doc.layers]);

  const findInterceptEdge = useCallback((node: RFNode) => {
    const nodeLookup = new Map(dragNodesRef.current.map((item) => [item.id, item]));
    const getCenter = (nodeId: string) => {
      const rfNode = nodeLookup.get(nodeId);
      const position = rfNode?.position ?? graphRef.current.positions[nodeId];
      if (!position) return null;
      const width = rfNode?.measured?.width ?? NODE_W;
      const height = rfNode?.measured?.height ?? NODE_H;
      return {
        x: position.x + width / 2,
        y: position.y + height / 2,
      };
    };

    const point = {
      x: node.position.x + (node.measured?.width ?? NODE_W) / 2,
      y: node.position.y + (node.measured?.height ?? NODE_H) / 2,
    };

    let best: { edge: GraphEdge; distance: number } | null = null;
    for (const edge of graphRef.current.edges) {
      if (edge.fromId === node.id || edge.toId === node.id) continue;
      const start = getCenter(edge.fromId);
      const end = getCenter(edge.toId);
      if (!start || !end) continue;
      const distance = distancePointToSegment(point, start, end);
      if (distance > EDGE_INTERCEPT_THRESHOLD) continue;
      if (!best || distance < best.distance) best = { edge, distance };
    }
    return best?.edge ?? null;
  }, []);

  const onNodeDragStart = useCallback(() => {
    isDraggingRef.current = true;
  }, []);

  const onNodeDragStop = useCallback(
    (_: unknown, node: RFNode) => {
      isDraggingRef.current = false;
      const movedGraph = updateGraphPositions(graphRef.current, [{ id: node.id, position: node.position }]);
      const interceptEdge = findInterceptEdge(node);
      const inputPort = getInterceptInputPort(node.id);

      if (
        interceptEdge
        && inputPort
        && !wouldCreateCycle(removeGraphEdge(movedGraph, interceptEdge.id), interceptEdge.fromId, node.id)
        && !wouldCreateCycle(removeGraphEdge(movedGraph, interceptEdge.id), node.id, interceptEdge.toId)
      ) {
        onGraphChange(splitEdgeWithNode(movedGraph, interceptEdge.id, node.id, inputPort));
        return;
      }

      commitNodePositions([node]);
    },
    [commitNodePositions, findInterceptEdge, getInterceptInputPort, onGraphChange],
  );

  const onSelectionDragStop = useCallback((_: React.MouseEvent, nodes: RFNode[]) => {
    isDraggingRef.current = false;
    commitNodePositions(nodes);
  }, [commitNodePositions]);

  const onPaneClick = useCallback(() => {
    dispatchUi({ type: 'PANE_CLICKED' });
    setContextMenu(null);
  }, []);
  const onRFInit = useCallback((instance: ReactFlowInstance) => { rfInstanceRef.current = instance; }, []);
  const onEdgeClick = useCallback((e: React.MouseEvent, edge: RFEdge) => {
    e.preventDefault();
    e.stopPropagation();
    dispatchUi({ type: 'EDGE_SELECTED', id: edge.id });
    setContextMenu(null);
  }, []);
  const onSelectionChange = useCallback(({ nodes, edges }: { nodes: RFNode[]; edges: RFEdge[] }) => {
    dispatchUi({
      type: 'SELECTION_CHANGED',
      nodeIds: nodes.map((node) => node.id),
      edgeIds: edges.map((edge) => edge.id),
    });
  }, []);
  const handleOrganizeNodes = useCallback(() => {
    onGraphChange(organizeGraph(graphRef.current, doc.layers));
    requestAnimationFrame(() => {
      rfInstanceRef.current?.fitView({ padding: 0.2, duration: 220 });
    });
  }, [doc.layers, onGraphChange]);

  const onPaneContextMenu = useCallback((e: MouseEvent | React.MouseEvent) => {
    e.preventDefault();
    const flowPos = rfInstanceRef.current?.screenToFlowPosition({ x: e.clientX, y: e.clientY })
      ?? { x: 0, y: 0 };
    setContextMenu({ type: 'pane-add', x: e.clientX, y: e.clientY, flowPos });
  }, [setContextMenu]);

  const onNodeContextMenu = useCallback((e: MouseEvent | React.MouseEvent, node: RFNode) => {
    e.preventDefault();
    e.stopPropagation();
    const isMerge = graph.mergeNodes.some((n) => n.id === node.id);
    const isExport = node.id === EXPORT_NODE_ID;
    setContextMenu({ type: 'node', x: e.clientX, y: e.clientY, nodeId: node.id, isMerge, isExport });
  }, [graph.mergeNodes, setContextMenu]);

  const onEdgeContextMenu = useCallback((e: React.MouseEvent, edge: RFEdge) => {
    e.preventDefault();
    e.stopPropagation();
    const flowPos = rfInstanceRef.current?.screenToFlowPosition({ x: e.clientX, y: e.clientY })
      ?? { x: 0, y: 0 };
    setContextMenu({
      type: 'pane-insert',
      x: e.clientX,
      y: e.clientY,
      flowPos,
      insertion: {
        sourceId: edge.source,
        targetId: edge.target,
        targetPort: (edge.targetHandle ?? 'in') as GraphEdge['toPort'],
        replaceEdgeId: edge.id,
      },
    });
  }, []);

  const onConnectEnd = useCallback((event: MouseEvent | TouchEvent, connectionState: FinalConnectionState) => {
    if (!connectionState.fromNode || connectionState.toNode) return;
    const pointer = 'changedTouches' in event ? event.changedTouches[0] : event;
    if (!pointer) return;
    const flowPos = rfInstanceRef.current?.screenToFlowPosition({ x: pointer.clientX, y: pointer.clientY })
      ?? { x: 0, y: 0 };
    setContextMenu({
      type: 'pane-insert',
      x: pointer.clientX,
      y: pointer.clientY,
      flowPos,
      insertion: {
        sourceId: connectionState.fromNode.id,
      },
    });
  }, []);

  const handleAddFromMenu = useCallback((action: AddAction, flowPos: { x: number; y: number }, insertion?: InsertConnectionConfig) => {
    requestAnimationFrame(() => {
      onAddLayerAt(action, flowPos, insertion);
    });
  }, [onAddLayerAt]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const target = e.target;
      if (
        target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement
        || target instanceof HTMLSelectElement
        || (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }
      if (uiState.selectedEdgeId) {
        e.preventDefault();
        onGraphChange(removeGraphEdge(graphRef.current, uiState.selectedEdgeId));
        dispatchUi({ type: 'EDGE_IDS_REMOVED', ids: [uiState.selectedEdgeId] });
        return;
      }
      const deletableNodeIds = uiState.selectedNodeIds.filter((id) => id !== EXPORT_NODE_ID);
      if (deletableNodeIds.length === 0) return;
      e.preventDefault();
      onDeleteNodes(deletableNodeIds);
      dispatchUi({ type: 'NODE_IDS_REMOVED', ids: deletableNodeIds });
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [uiState.selectedEdgeId, uiState.selectedNodeIds, onDeleteNodes, onGraphChange]);

  // Intercept ReactFlow's built-in node removal so Delete key calls the proper
  // doc-layer callbacks instead of only mutating rfNodes state.
  const handleNodesChange = useCallback((changes: Parameters<typeof onNodesChange>[0]) => {
    const nonRemove = changes.filter((c) => {
      if (c.type !== 'remove') return true;
      const isExport = c.id === EXPORT_NODE_ID;
      if (!isExport) {
        onDeleteNodes([c.id]);
        dispatchUi({ type: 'NODE_IDS_REMOVED', ids: [c.id] });
      }
      return false;
    });
    if (nonRemove.length) onNodesChange(nonRemove);
  }, [onNodesChange, onDeleteNodes]);

  return (
    <NodeCanvasPreviewContext.Provider value={previewContextValue}>
      <NodeCanvasActionsContext.Provider value={actionsContextValue}>
        <div
          style={{ width: '100%', height: '100%', background: 'oklch(10% 0.009 285)', position: 'relative' }}
        >
      <style>{`
        @keyframes node-shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .react-flow__node {
          padding: 0;
          border: none;
          border-radius: 0;
          background: transparent;
          box-shadow: none;
          outline: none;
        }
        .react-flow__node.selected,
        .react-flow__node:focus,
        .react-flow__node:focus-visible,
        .react-flow__node.selectable.selected,
        .react-flow__node.selectable:focus,
        .react-flow__node.selectable:focus-visible {
          outline: none !important;
          box-shadow: none !important;
        }
        .react-flow__handle { border-radius: 50%; }
        .react-flow__controls {
          background: oklch(14% 0.01 285);
          border: 1px solid oklch(28% 0.015 285);
          border-radius: 3px;
          box-shadow: 2px 2px 0 oklch(7% 0.006 285);
        }
        .react-flow__controls-button {
          background: transparent;
          border-bottom: 1px solid oklch(22% 0.012 285);
          color: oklch(55% 0.015 285);
          fill: oklch(55% 0.015 285);
          width: 24px;
          height: 24px;
          padding: 5px;
        }
        .react-flow__controls-button:hover {
          background: oklch(20% 0.012 285);
          color: oklch(75% 0.02 285);
          fill: oklch(75% 0.02 285);
        }
        .react-flow__controls-button:last-child { border-bottom: none; }
        .react-flow__background { background: oklch(10% 0.009 285); }
        .nodrag { pointer-events: auto; }
        .node-drag-handle:active { cursor: grabbing; }
        .node-thumbnail {
          background: oklch(7% 0.008 285);
          border: 1px solid oklch(20% 0.012 285);
          border-radius: 2px;
          overflow: hidden;
          position: relative;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 136px;
          height: 136px;
        }
        .node-thumbnail-export {
          height: auto;
          overflow: visible;
          border: none;
          background: transparent;
        }
        .node-thumbnail-frame {
          position: relative;
          overflow: hidden;
          border-radius: 2px;
          border: 1px solid oklch(20% 0.012 285);
        }
        .node-thumbnail-canvas {
          display: block;
          width: 100%;
          height: 100%;
          transition: opacity 200ms ease-out;
        }
        .node-thumbnail-skeleton {
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, oklch(14% 0.01 285) 25%, oklch(19% 0.012 285) 50%, oklch(14% 0.01 285) 75%);
          background-size: 200% 100%;
          animation: node-shimmer 1.4s ease-in-out infinite;
        }
        .node-shell {
          background: oklch(14% 0.01 285);
          border: 1px solid oklch(28% 0.014 285);
          border-radius: 3px;
          overflow: hidden;
          box-shadow: 2px 2px 0 oklch(7% 0.006 285);
          cursor: default;
          user-select: none;
          transition: box-shadow 140ms cubic-bezier(0.22, 1, 0.36, 1), border-color 140ms cubic-bezier(0.22, 1, 0.36, 1);
        }
        .node-shell-selected {
          border-color: var(--node-accent);
          box-shadow: 3px 3px 0 var(--node-accent);
        }
        .node-shell-accent,
        .node-editor-accent {
          background: var(--node-accent);
          flex-shrink: 0;
        }
        .node-shell-accent { height: 4px; }
        .node-editor-accent { height: 3px; }
        .node-shell-header {
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 6px 9px;
          background: oklch(11% 0.012 285);
          border-bottom: 1px solid oklch(22% 0.012 285);
          min-height: 30px;
        }
        .node-shell-drag {
          display: flex;
          align-items: center;
          gap: 7px;
          flex: 1;
          min-width: 0;
          cursor: grab;
        }
        .node-shell-symbol {
          color: var(--node-accent);
          font-size: 13px;
          font-weight: 600;
          line-height: 1;
          flex-shrink: 0;
          width: 13px;
          text-align: center;
        }
        .node-shell-label,
        .node-shell-name,
        .node-editor-title,
        .node-editor-subtitle,
        .node-inspector-label,
        .node-inspector-value,
        .node-badge,
        .node-menu-item-label,
        .node-menu-item-hint,
        .node-menu-group,
        .node-menu-empty,
        .node-menu-search-input {
          font-family: var(--mono);
        }
        .node-shell-label {
          color: oklch(48% 0.014 285);
          font-size: 9px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          flex-shrink: 0;
        }
        .node-shell-name {
          color: oklch(82% 0.022 68);
          font-size: 11px;
          font-weight: 500;
          letter-spacing: 0.005em;
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .node-shell-body { padding: 9px 9px 7px; }
        .node-shell-toggle,
        .node-editor-close {
          width: 22px;
          height: 22px;
          display: grid;
          place-items: center;
          padding: 0;
          border: 1px solid oklch(24% 0.014 285);
          border-radius: 999px;
          background: transparent;
          color: oklch(55% 0.015 285);
          cursor: pointer;
          flex-shrink: 0;
        }
        .node-shell-toggle {
          width: 20px;
          height: 20px;
          color: oklch(52% 0.015 285);
          font-size: 10px;
          line-height: 1;
        }
        .node-shell-toggle-active {
          background: oklch(22% 0.03 285);
          color: var(--node-accent);
        }
        .node-shell-action {
          transition: border-color 120ms cubic-bezier(0.25, 1, 0.5, 1), background 120ms cubic-bezier(0.25, 1, 0.5, 1), color 120ms cubic-bezier(0.25, 1, 0.5, 1);
        }
        .node-shell-action:hover {
          border-color: oklch(36% 0.024 285);
          background: oklch(18% 0.018 285);
          color: oklch(76% 0.02 285);
        }
        .node-editor-panel {
          position: absolute;
          right: calc(100% + 14px);
          top: -2px;
          background: oklch(13% 0.011 285);
          border: 1px solid var(--node-accent);
          border-radius: 4px;
          box-shadow: 4px 4px 0 oklch(7% 0.006 285);
          overflow: hidden;
          z-index: 30;
        }
        .node-editor-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 10px 12px;
          border-bottom: 1px solid oklch(22% 0.012 285);
          background: oklch(11.5% 0.012 285);
        }
        .node-editor-heading,
        .node-inspector-section-copy,
        .node-inspector-stack,
        .node-inspector-control,
        .node-scale-controls {
          display: flex;
          flex-direction: column;
        }
        .node-editor-heading,
        .node-inspector-section-copy {
          gap: 2px;
          min-width: 0;
        }
        .node-editor-title,
        .node-inspector-section-title {
          color: oklch(74% 0.02 68);
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .node-editor-title {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .node-editor-subtitle,
        .node-inspector-section-summary {
          color: oklch(46% 0.014 285);
          font-size: 9px;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .node-editor-body { padding: 10px 12px 12px; }
        .node-inspector-stack { gap: 8px; }
        .node-inspector-detached {
          margin-top: 8px;
          padding-top: 8px;
          border-top: 1px solid oklch(22% 0.012 285);
        }
        .node-badge-row {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }
        .node-badge {
          padding: 3px 7px;
          border-radius: 999px;
          border: 1px solid oklch(26% 0.015 285);
          color: oklch(74% 0.02 68);
          background: oklch(11% 0.01 285);
          font-size: 9px;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }
        .node-badge-accent {
          border-color: oklch(22% 0.02 298);
          color: oklch(66% 0.08 298);
          background: oklch(14% 0.015 298);
        }
        .node-inspector-label {
          color: oklch(44% 0.013 285);
          font-size: 9px;
          letter-spacing: 0.05em;
          text-transform: uppercase;
        }
        .node-inspector-row,
        .node-inspector-toggle,
        .node-scale-row,
        .node-inspector-control-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }
        .node-inspector-row { gap: 10px; }
        .node-inspector-toggle { cursor: pointer; }
        .node-scale-row { align-items: flex-start; }
        .node-scale-controls { flex: 1; gap: 8px; }
        .node-inspector-control { gap: 4px; }
        .node-inspector-control-label {
          display: flex;
          align-items: center;
          gap: 6px;
          min-width: 0;
        }
        .node-inspector-value {
          color: oklch(64% 0.015 285);
          font-size: 10px;
        }
        .node-inspector-section {
          border: 1px solid oklch(24% 0.014 285);
          border-radius: 6px;
          overflow: hidden;
          background: oklch(11% 0.01 285);
        }
        .node-inspector-section-open { background: oklch(12.5% 0.012 285); }
        .node-section-button {
          transition: background 180ms cubic-bezier(0.25, 1, 0.5, 1), color 180ms cubic-bezier(0.25, 1, 0.5, 1);
        }
        .node-section-button:hover { background: oklch(15% 0.014 285); }
        .node-inspector-section-button {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 9px 10px;
          background: transparent;
          border: none;
          cursor: pointer;
          text-align: left;
        }
        .node-inspector-section-toggle {
          color: oklch(45% 0.014 285);
          font-size: 10px;
          flex-shrink: 0;
        }
        .node-inspector-section-open .node-inspector-section-toggle {
          color: oklch(70% 0.03 298);
        }
        .node-inspector-section-body {
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding: 0 10px 10px;
        }
        .node-shell-action:focus-visible,
        .node-section-button:focus-visible,
        .node-field:focus-visible,
        .node-color-input:focus-visible,
        .node-check:focus-visible {
          outline: 2px solid oklch(72% 0.07 298);
          outline-offset: 2px;
        }
        .node-field,
        .node-slider,
        .node-color-input,
        .node-check {
          background: oklch(11% 0.01 285);
          transition: border-color 120ms cubic-bezier(0.25, 1, 0.5, 1), box-shadow 120ms cubic-bezier(0.25, 1, 0.5, 1), background 120ms cubic-bezier(0.25, 1, 0.5, 1);
        }
        .node-field {
          width: 100%;
          border: 1px solid oklch(24% 0.014 285);
          border-radius: 4px;
          color: oklch(76% 0.018 68);
          font-family: var(--mono);
          font-size: 11px;
          padding: 7px 8px;
          outline: none;
        }
        .node-field-textarea {
          resize: vertical;
          min-height: 64px;
        }
        .node-field:hover,
        .node-color-input:hover {
          border-color: oklch(32% 0.02 285);
        }
        .node-slider {
          accent-color: oklch(68% 0.13 18);
          width: 100%;
          border: none;
          padding: 0;
          background: transparent;
        }
        .node-color-input {
          width: 30px;
          height: 22px;
          border-radius: 4px;
          border: 1px solid oklch(24% 0.014 285);
          cursor: pointer;
          padding: 2px;
        }
        .node-check {
          width: 16px;
          height: 16px;
          accent-color: oklch(68% 0.13 18);
          flex-shrink: 0;
        }
        .node-scale-lock {
          flex-shrink: 0;
          margin-top: 18px;
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 4px;
          border: 1px solid oklch(24% 0.014 285);
          background: oklch(11% 0.01 285);
          color: oklch(52% 0.014 285);
          cursor: pointer;
        }
        .node-scale-lock-active {
          border-color: oklch(70% 0.03 298);
          color: oklch(70% 0.03 298);
        }
        .node-info-button {
          width: 16px;
          height: 16px;
          display: grid;
          place-items: center;
          padding: 0;
          border-radius: 999px;
          border: 1px solid oklch(24% 0.014 285);
          background: transparent;
          color: oklch(46% 0.014 285);
          font-size: 9px;
          line-height: 1;
          cursor: help;
        }
        .node-export-button {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          min-height: 34px;
          border-radius: 3px;
          border: 1px solid oklch(86% 0.05 92);
          background: oklch(86% 0.05 92);
          color: oklch(14% 0.01 285);
          font-family: var(--mono);
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          cursor: pointer;
          box-shadow: 2px 2px 0 oklch(7% 0.006 285);
          transition: transform 120ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 120ms cubic-bezier(0.22, 1, 0.36, 1);
        }
        .node-export-button:hover:not(:disabled) {
          background: oklch(90% 0.06 92);
        }
        .node-export-button:active:not(:disabled) {
          transform: translate(2px, 2px);
          box-shadow: 0 0 0 oklch(7% 0.006 285);
        }
        .node-export-button:disabled { opacity: 0.55; cursor: default; }
        .node-canvas-toolbar {
          position: absolute;
          top: 12px;
          right: 12px;
          z-index: 6;
          display: flex;
          gap: 8px;
          pointer-events: none;
        }
        .node-canvas-toolbar button {
          pointer-events: all;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          height: 28px;
          padding: 0 11px;
          border-radius: 3px;
          border: 1px solid oklch(28% 0.015 285);
          background: oklch(14% 0.01 285);
          color: oklch(78% 0.02 68);
          font-family: var(--mono);
          font-size: 10px;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          cursor: pointer;
          box-shadow: 2px 2px 0 oklch(7% 0.006 285);
          transition: border-color 120ms cubic-bezier(0.22, 1, 0.36, 1), background 120ms cubic-bezier(0.22, 1, 0.36, 1), color 120ms cubic-bezier(0.22, 1, 0.36, 1), transform 120ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 120ms cubic-bezier(0.22, 1, 0.36, 1);
        }
        .node-canvas-toolbar button:hover {
          border-color: oklch(64% 0.22 305);
          background: oklch(18% 0.018 285);
          color: oklch(86% 0.024 68);
        }
        .node-canvas-toolbar button:active {
          transform: translate(2px, 2px);
          box-shadow: 0 0 0 oklch(7% 0.006 285);
        }
        .node-menu {
          position: fixed;
          z-index: 10000;
          background: oklch(15% 0.012 285);
          border: 1px solid oklch(30% 0.016 285);
          border-radius: 3px;
          box-shadow: 4px 4px 0 oklch(7% 0.006 285);
          overflow: hidden;
        }
        .node-menu-search {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          border-bottom: 1px solid oklch(24% 0.014 285);
        }
        .node-menu-search-icon {
          color: oklch(44% 0.015 285);
          font-size: 11px;
        }
        .node-menu-search-input {
          width: 100%;
          background: none;
          border: none;
          outline: none;
          color: oklch(75% 0.018 68);
          font-size: 11px;
        }
        .node-menu-list {
          max-height: 320px;
          overflow-y: auto;
          padding: 4px 0;
        }
        .node-menu-empty {
          padding: 8px 12px;
          color: oklch(42% 0.013 285);
          font-size: 10px;
        }
        .node-menu-group {
          padding: 6px 12px 2px;
          color: oklch(38% 0.012 285);
          font-size: 9px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
        .node-menu-divider {
          height: 1px;
          background: oklch(24% 0.014 285);
          margin: 4px 0;
        }
        .node-menu-item {
          display: flex;
          align-items: center;
          gap: 10px;
          width: 100%;
          padding: 7px 12px;
          background: none;
          border: none;
          cursor: pointer;
          text-align: left;
        }
        .node-menu-item-between {
          justify-content: space-between;
          padding: 8px 14px;
        }
        .node-menu-item:hover { background: oklch(22% 0.014 285); }
        .node-menu-item-symbol {
          font-size: 10px;
          width: 14px;
          text-align: center;
          flex-shrink: 0;
        }
        .node-menu-item-label {
          color: oklch(72% 0.016 68);
          font-size: 11px;
        }
        .node-menu-item-danger { color: oklch(62% 0.15 25); }
        .node-menu-item-hint {
          font-size: 10px;
          color: oklch(40% 0.012 285);
        }
      `}</style>

      <div className="node-canvas-toolbar">
        <button type="button" onClick={handleOrganizeNodes} aria-label="Organize nodes">
          <span aria-hidden="true">⌘</span>
          Organize
        </button>
      </div>

      <ReactFlow
        nodes={dragNodes}
        edges={dragEdges}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectEnd={onConnectEnd}
        onEdgesDelete={onEdgesDelete}
        onNodeDragStart={onNodeDragStart}
        onNodeDragStop={onNodeDragStop}
        onSelectionDragStop={onSelectionDragStop}
        onSelectionChange={onSelectionChange}
        onPaneClick={onPaneClick}
        onPaneContextMenu={onPaneContextMenu}
        onNodeContextMenu={onNodeContextMenu}
        onEdgeContextMenu={onEdgeContextMenu}
        onEdgeClick={onEdgeClick}
        isValidConnection={isValidConnection}
        onInit={onRFInit}
        nodeTypes={nodeTypes}
        colorMode="dark"
        elementsSelectable
        selectionKeyCode="Shift"
        selectionOnDrag
        selectionMode="partial"
        multiSelectionKeyCode={['Meta', 'Control']}
        minZoom={0.3}
        maxZoom={2}
        deleteKeyCode="Delete"
        proOptions={RF_PRO_OPTIONS}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} color="oklch(28% 0.014 285)" />
        <Controls showInteractive={false} />
      </ReactFlow>

      {(contextMenu?.type === 'pane-add' || contextMenu?.type === 'pane-insert') && typeof document !== 'undefined' && createPortal(
        <PaneContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onAdd={(action) => handleAddFromMenu(
            action,
            contextMenu.flowPos,
            contextMenu.type === 'pane-insert' ? contextMenu.insertion : undefined,
          )}
          onClose={() => setContextMenu(null)}
          menuRef={contextMenuRef}
        />,
        document.body,
      )}

      {contextMenu?.type === 'node' && typeof document !== 'undefined' && createPortal(
        <NodeContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          isMerge={contextMenu.isMerge}
          isExport={contextMenu.isExport}
          onDuplicate={() => onDuplicateLayer(contextMenu.nodeId)}
          onDelete={() => onDeleteNodes([contextMenu.nodeId])}
          onClose={() => setContextMenu(null)}
          menuRef={contextMenuRef}
        />,
        document.body,
      )}
    </div>
      </NodeCanvasActionsContext.Provider>
    </NodeCanvasPreviewContext.Provider>
  );
}

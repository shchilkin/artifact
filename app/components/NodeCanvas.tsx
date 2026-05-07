import {
  useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState,
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
  LayerKind, EffectPreset,
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

const KIND_COLOR: Record<string, string> = {
  fill:   'oklch(60% 0.07 65)',
  image:  'oklch(57% 0.06 215)',
  text:   'oklch(65% 0.05 55)',
  emoji:  'oklch(64% 0.09 148)',
  effect: 'oklch(60% 0.13 298)',
  merge:  'oklch(60% 0.09 192)',
  export: 'oklch(78% 0.02 285)',
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

const BLEND_OPTIONS = ['normal', 'multiply', 'screen', 'overlay', 'luminosity'] as const;

// ─── Context menu state ───────────────────────────────────────────────────────

type ContextMenuState =
  | { type: 'pane-add'; x: number; y: number; flowPos: { x: number; y: number } }
  | { type: 'pane-insert'; x: number; y: number; flowPos: { x: number; y: number }; insertion: InsertConnectionConfig }
  | { type: 'node'; x: number; y: number; nodeId: string; isMerge: boolean; isExport: boolean }
  | null;

// ─── Thumbnail ────────────────────────────────────────────────────────────────

interface ThumbProps {
  doc: CanvasDocument;
  graph: CanvasGraph;
  previewTargetId: string;
  imageCache: Map<string, HTMLImageElement>;
}

function NodeThumbnail({ doc, graph, previewTargetId, imageCache }: ThumbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewKey = useMemo(
    () => JSON.stringify({ previewTargetId, global: doc.global, layers: doc.layers, graph }),
    [previewTargetId, doc.global, doc.layers, graph],
  );
  const [renderedPreviewKey, setRenderedPreviewKey] = useState<string | null>(null);
  const ready = renderedPreviewKey === previewKey;

  useEffect(() => {
    let cancelled = false;
    const previewDoc: CanvasDocument = { ...doc, graph };
    const renderPromise = previewTargetId === EXPORT_NODE_ID
      ? renderDocument(previewDoc, THUMB_SIZE, THUMB_SIZE, imageCache)
      : renderGraphTarget(previewDoc, graph, previewTargetId, THUMB_SIZE, THUMB_SIZE, imageCache);
    renderPromise
      .then((result) => {
        if (cancelled || !canvasRef.current) return;
        const ctx = canvasRef.current.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, THUMB_SIZE, THUMB_SIZE);
        ctx.drawImage(result, 0, 0, THUMB_SIZE, THUMB_SIZE);
        setRenderedPreviewKey(previewKey);
      })
      .catch(() => { /* silent */ });
    return () => { cancelled = true; };
  }, [doc, graph, previewKey, previewTargetId, imageCache]);

  return (
    <div style={{
      width: THUMB_SIZE, height: THUMB_SIZE,
      background: 'oklch(8% 0.01 285)',
      borderRadius: 3, overflow: 'hidden', position: 'relative', flexShrink: 0,
    }}>
      <canvas
        ref={canvasRef}
        width={THUMB_SIZE}
        height={THUMB_SIZE}
        style={{
          display: 'block', width: '100%', height: '100%',
          opacity: ready ? 1 : 0,
          transition: 'opacity 200ms ease-out',
        }}
      />
      {!ready && (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(90deg, oklch(14% 0.01 285) 25%, oklch(19% 0.012 285) 50%, oklch(14% 0.01 285) 75%)',
          backgroundSize: '200% 100%',
          animation: 'node-shimmer 1.4s ease-in-out infinite',
        }} />
      )}
    </div>
  );
}

// ─── Port handle ──────────────────────────────────────────────────────────────

const HANDLE_STYLE = {
  background: 'oklch(60% 0.09 192)',
  border: '1px solid oklch(45% 0.02 285)',
  width: 8, height: 8,
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
    <div style={{
      width: NODE_W,
      background: 'oklch(14% 0.01 285)',
      border: `1px solid ${selected ? accent : 'oklch(26% 0.015 285)'}`,
      borderRadius: 6, overflow: 'hidden',
      boxShadow: selected
        ? `0 0 0 1px ${accent}30, 0 4px 16px oklch(0% 0 0 / 0.5)`
        : '0 4px 16px oklch(0% 0 0 / 0.4)',
      cursor: 'default', userSelect: 'none',
    }}>
      <div style={{ height: 3, background: accent, flexShrink: 0 }} />
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '5px 8px',
        background: 'oklch(12% 0.012 285)',
        borderBottom: '1px solid oklch(22% 0.012 285)',
        minHeight: 28,
      }}>
        <div className="node-drag-handle" style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0, cursor: 'grab' }}>
          <span style={{ color: accent, fontSize: 10, lineHeight: 1, flexShrink: 0 }}>
            {KIND_SYMBOL[kind] ?? '○'}
          </span>
          <span style={{
            color: 'oklch(44% 0.013 285)', fontSize: 9,
            fontFamily: 'var(--mono)', textTransform: 'uppercase',
            letterSpacing: '0.06em', flexShrink: 0,
          }}>{label}</span>
          <span style={{
            color: 'oklch(70% 0.018 68)', fontSize: 10, fontFamily: 'var(--mono)',
            flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{name}</span>
        </div>
        {expandable && onToggleExpanded && (
          <button
            type="button"
            className="nodrag node-shell-action"
            aria-label={expanded ? 'Collapse settings' : 'Expand settings'}
            aria-expanded={expanded}
            onPointerDown={stopNodeEvent}
            onMouseDown={stopNodeEvent}
            onClick={(e) => { stopNodeEvent(e); onToggleExpanded(); }}
            style={{
              background: expanded ? 'oklch(22% 0.03 285)' : 'transparent',
              border: '1px solid oklch(24% 0.014 285)',
              borderRadius: 999,
              cursor: 'pointer',
              color: expanded ? accent : 'oklch(52% 0.015 285)',
              width: 20,
              height: 20,
              display: 'grid',
              placeItems: 'center',
              padding: 0,
              fontSize: 10,
              lineHeight: 1,
              flexShrink: 0,
            }}
          >
            {expanded ? '−' : '+'}
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            className="nodrag node-shell-action"
            aria-label="Delete node"
            onPointerDown={stopNodeEvent}
            onMouseDown={stopNodeEvent}
            onClick={(e) => { stopNodeEvent(e); onDelete(); }}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'oklch(38% 0.01 285)', padding: '0 2px', fontSize: 11, lineHeight: 1, flexShrink: 0,
            }}
          >×</button>
        )}
      </div>
      <div style={{ padding: '8px 8px 6px 8px' }}>{children}</div>
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
    <div
      className="nodrag"
      onPointerDown={stopNodeEvent}
      onMouseDown={stopNodeEvent}
      onClick={stopNodeEvent}
      onDoubleClick={stopNodeEvent}
      style={{
        position: 'absolute',
        right: `calc(100% + 14px)`,
        top: -2,
        width: NODE_EDITOR_W,
        background: 'oklch(13% 0.011 285)',
        border: `1px solid ${accent}`,
        borderRadius: 10,
        boxShadow: '0 16px 40px oklch(0% 0 0 / 0.55)',
        overflow: 'hidden',
        zIndex: 30,
      }}
    >
      <div style={{ height: 2, background: accent }} />
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '10px 12px',
        borderBottom: '1px solid oklch(22% 0.012 285)',
        background: 'oklch(11.5% 0.012 285)',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <span style={{
            color: 'oklch(74% 0.02 68)',
            fontSize: 10,
            fontFamily: 'var(--mono)',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
          >
            {title}
          </span>
          {subtitle && (
            <span style={{
              color: 'oklch(46% 0.014 285)',
              fontSize: 9,
              fontFamily: 'var(--mono)',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
            >
              {subtitle}
            </span>
          )}
        </div>
        <button
          type="button"
          className="nodrag node-shell-action"
          aria-label="Close settings"
          onPointerDown={stopNodeEvent}
          onMouseDown={stopNodeEvent}
          onClick={(e) => { stopNodeEvent(e); onClose(); }}
          style={{
            background: 'transparent',
            border: '1px solid oklch(24% 0.014 285)',
            borderRadius: 999,
            color: 'oklch(55% 0.015 285)',
            width: 22,
            height: 22,
            display: 'grid',
            placeItems: 'center',
            padding: 0,
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          ×
        </button>
      </div>
      <div style={{ padding: '10px 12px 12px' }}>
        {children}
      </div>
    </div>
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
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      ...(detached ? {} : {
        marginTop: 8,
        paddingTop: 8,
        borderTop: '1px solid oklch(22% 0.012 285)',
      }),
    }}
    >
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <span style={{
          padding: '3px 7px',
          borderRadius: 999,
          border: '1px solid oklch(26% 0.015 285)',
          color: 'oklch(74% 0.02 68)',
          background: 'oklch(11% 0.01 285)',
          fontFamily: 'var(--mono)',
          fontSize: 9,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
        }}
        >
          {layer.preset ? EFFECT_PRESETS[layer.preset]?.name ?? layer.preset : 'custom'}
        </span>
        {showAllSections && (
          <span style={{
            padding: '3px 7px',
            borderRadius: 999,
            border: '1px solid oklch(22% 0.02 298)',
            color: 'oklch(66% 0.08 298)',
            background: 'oklch(14% 0.015 298)',
            fontFamily: 'var(--mono)',
            fontSize: 9,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
          >
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
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
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
      <button
        type="button"
        className="nodrag"
        onPointerDown={stopNodeEvent}
        onMouseDown={stopNodeEvent}
        onClick={(e) => { stopNodeEvent(e); onLockChange(!locked); }}
        title={locked ? 'Unlock X/Y scale' : 'Lock X/Y scale'}
        aria-label={locked ? 'Unlock X/Y scale' : 'Lock X/Y scale'}
        style={{
          flexShrink: 0,
          marginTop: 18,
          width: 28,
          height: 28,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 4,
          border: `1px solid ${locked ? 'oklch(70% 0.03 298)' : 'oklch(24% 0.014 285)'}`,
          background: 'oklch(11% 0.01 285)',
          color: locked ? 'oklch(70% 0.03 298)' : 'oklch(52% 0.014 285)',
          cursor: 'pointer',
        }}
      >
        {locked ? '⛓' : '⛓‍💥'}
      </button>
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
  const sectionStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    ...(detached ? {} : {
      marginTop: 8,
      paddingTop: 8,
      borderTop: '1px solid oklch(22% 0.012 285)',
    }),
  };

  if (layer.kind === 'text') {
    return (
      <div style={sectionStyle}>
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
      <div style={sectionStyle}>
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
      <div style={sectionStyle}>
        <InspectorTextInput value={layer.name} onChange={(value) => onChange({ name: value })} />
        <InspectorColorInput label="Color" value={layer.color} onChange={(value) => onChange({ color: value } as Partial<FillLayer>)} />
        <InspectorSlider label="Opacity" value={layer.opacity} min={0} max={100} onChange={(value) => onChange({ opacity: value })} />
        <InspectorSelect label="Blend" value={layer.blendMode} options={BLEND_OPTIONS} onChange={(value) => onChange({ blendMode: value })} />
      </div>
    );
  }
  if (layer.kind === 'emoji') {
    return (
      <div style={sectionStyle}>
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
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      ...(detached ? {} : {
        marginTop: 8,
        paddingTop: 8,
        borderTop: '1px solid oklch(22% 0.012 285)',
      }),
    }}
    >
      <InspectorTextInput value={mergeNode.name} onChange={(value) => onChange({ name: value })} />
      <InspectorSelect label="Blend" value={mergeNode.blendMode} options={BLEND_OPTIONS} onChange={(value) => onChange({ blendMode: value })} />
      <InspectorSlider label="Opacity" value={mergeNode.opacity} min={0} max={100} onChange={(value) => onChange({ opacity: value })} />
    </div>
  );
}

function ExportInspector({
  doc,
  busy,
  onChange,
  onExport,
}: {
  doc: CanvasDocument;
  busy: boolean;
  onChange: (patch: Partial<CanvasDocument['export']>) => void;
  onExport: () => void;
}) {
  const exportConfig = doc.export;
  const [width, height] = ASPECT_SIZES[doc.global.aspect ?? '1:1'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <InspectorSelect label="Target" value={exportConfig.target} options={['cover', 'envmap']} onChange={(value) => onChange({ target: value as CanvasDocument['export']['target'] })} />
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
      <button
        type="button"
        className="nodrag node-shell-action"
        onPointerDown={stopNodeEvent}
        onMouseDown={stopNodeEvent}
        onClick={(e) => { stopNodeEvent(e); onExport(); }}
        disabled={busy}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          minHeight: 32,
          borderRadius: 6,
          border: '1px solid oklch(30% 0.018 285)',
          background: 'oklch(18% 0.014 285)',
          color: 'oklch(76% 0.02 68)',
          fontFamily: 'var(--mono)',
          fontSize: 11,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          cursor: 'pointer',
          opacity: busy ? 0.6 : 1,
        }}
      >
        {busy ? 'exporting…' : '↗ export now'}
      </button>
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
  doc: CanvasDocument;
  graph: CanvasGraph;
  previewTargetId: string;
  imageCache: Map<string, HTMLImageElement>;
  selected: boolean;
  editing: boolean;
  connected: { sources: Set<string>; targets: Set<string> };
  onSelect: (event: React.MouseEvent) => void;
  onToggleEditor: () => void;
  onChange: (patch: Partial<Layer>) => void;
};

function LayerNodeComponent({ data }: NodeProps) {
  const d = data as unknown as LayerNodeData;
  const { layer, graph, previewTargetId, doc, imageCache, selected, editing, connected, onSelect, onToggleEditor, onChange } = d;
  const isEffect = layer.kind === 'effect';
  const inputPort = isEffect ? 'in' : 'bg';

  return (
    <div
      onClick={onSelect}
      onDoubleClick={(e) => { stopNodeEvent(e); onToggleEditor(); }}
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
        onToggleExpanded={onToggleEditor}
      >
        <NodeThumbnail doc={doc} graph={graph} previewTargetId={previewTargetId} imageCache={imageCache} />
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
          onClose={onToggleEditor}
        >
          <LayerInspector layer={layer} onChange={onChange} detached />
        </NodeEditorPanel>
      )}
      <Handle type="source" position={Position.Right} id="out" style={HANDLE_STYLE} />
    </div>
  );
}

// ─── Merge node ───────────────────────────────────────────────────────────────

type MergeNodeData = {
  mergeNode: GraphMergeNode;
  doc: CanvasDocument;
  graph: CanvasGraph;
  previewTargetId: string;
  imageCache: Map<string, HTMLImageElement>;
  selected: boolean;
  editing: boolean;
  connected: { sources: Set<string>; targets: Set<string> };
  onSelect: (event: React.MouseEvent) => void;
  onDelete: () => void;
  onToggleEditor: () => void;
  onChange: (patch: Partial<GraphMergeNode>) => void;
};

function MergeNodeComponent({ data }: NodeProps) {
  const d = data as unknown as MergeNodeData;
  const { mergeNode, graph, previewTargetId, doc, imageCache, selected, editing, connected, onSelect, onDelete, onToggleEditor, onChange } = d;

  return (
    <div
      onClick={onSelect}
      onDoubleClick={(e) => { stopNodeEvent(e); onToggleEditor(); }}
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
        onToggleExpanded={onToggleEditor}
        onDelete={onDelete}
      >
        <NodeThumbnail doc={doc} graph={graph} previewTargetId={previewTargetId} imageCache={imageCache} />
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
          onClose={onToggleEditor}
        >
          <MergeInspector mergeNode={mergeNode} onChange={onChange} detached />
        </NodeEditorPanel>
      )}
      <Handle type="source" id="out" position={Position.Right} style={HANDLE_STYLE} />
    </div>
  );
}

// ─── Export node ──────────────────────────────────────────────────────────────

type ExportNodeData = {
  doc: CanvasDocument;
  graph: CanvasGraph;
  previewTargetId: string;
  imageCache: Map<string, HTMLImageElement>;
  selected: boolean;
  editing: boolean;
  connected: { sources: Set<string>; targets: Set<string> };
  busy: boolean;
  onSelect: (event: React.MouseEvent) => void;
  onToggleEditor: () => void;
  onChange: (patch: Partial<CanvasDocument['export']>) => void;
  onExport: () => void;
};

function ExportNodeComponent({ data }: NodeProps) {
  const d = data as unknown as ExportNodeData;
  const { doc, graph, previewTargetId, imageCache, selected, editing, connected, busy, onSelect, onToggleEditor, onChange, onExport } = d;

  return (
    <div
      onClick={onSelect}
      onDoubleClick={(e) => { stopNodeEvent(e); onToggleEditor(); }}
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
        onToggleExpanded={onToggleEditor}
      >
        <NodeThumbnail doc={doc} graph={graph} previewTargetId={previewTargetId} imageCache={imageCache} />
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
          onClose={onToggleEditor}
        >
          <ExportInspector doc={doc} busy={busy} onChange={onChange} onExport={onExport} />
        </NodeEditorPanel>
      )}
    </div>
  );
}

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
    <span style={{
      color: 'oklch(44% 0.013 285)',
      fontSize: 9,
      fontFamily: 'var(--mono)',
      letterSpacing: '0.05em',
      textTransform: 'uppercase',
    }}
    >
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
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
      <InspectorLabel>{label}</InspectorLabel>
      <input
        className="nodrag node-color-input"
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onPointerDown={stopNodeEvent}
        onMouseDown={stopNodeEvent}
        onClick={stopNodeEvent}
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
    <div
      style={{
        border: '1px solid oklch(24% 0.014 285)',
        borderRadius: 6,
        overflow: 'hidden',
        background: open ? 'oklch(12.5% 0.012 285)' : 'oklch(11% 0.01 285)',
      }}
    >
      <button
        type="button"
        className="nodrag node-section-button"
        aria-expanded={open}
        onPointerDown={stopNodeEvent}
        onMouseDown={stopNodeEvent}
        onClick={(e) => { stopNodeEvent(e); onToggle(); }}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '9px 10px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <span style={{
            color: 'oklch(73% 0.02 68)',
            fontSize: 10,
            fontFamily: 'var(--mono)',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
          >
            {title}
          </span>
          {summary && (
            <span style={{
              color: 'oklch(48% 0.014 285)',
              fontSize: 9,
              fontFamily: 'var(--mono)',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
            >
              {summary}
            </span>
          )}
        </div>
        <span style={{ color: open ? 'oklch(70% 0.03 298)' : 'oklch(45% 0.014 285)', fontSize: 10, flexShrink: 0 }}>
          {open ? '−' : '+'}
        </span>
      </button>
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '0 10px 10px' }}>
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
      className="nodrag node-field"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onPointerDown={stopNodeEvent}
      onMouseDown={stopNodeEvent}
      onClick={stopNodeEvent}
      style={{
        width: '100%',
        background: 'oklch(11% 0.01 285)',
        border: '1px solid oklch(24% 0.014 285)',
        borderRadius: 4,
        color: 'oklch(76% 0.018 68)',
        fontFamily: 'var(--mono)',
        fontSize: 11,
        padding: '7px 8px',
        outline: 'none',
      }}
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
      className="nodrag node-field"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onPointerDown={stopNodeEvent}
      onMouseDown={stopNodeEvent}
      onClick={stopNodeEvent}
      rows={3}
      style={{
        width: '100%',
        resize: 'vertical',
        background: 'oklch(11% 0.01 285)',
        border: '1px solid oklch(24% 0.014 285)',
        borderRadius: 4,
        color: 'oklch(76% 0.018 68)',
        fontFamily: 'var(--mono)',
        fontSize: 11,
        padding: '7px 8px',
        outline: 'none',
      }}
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <InspectorLabel>{label}</InspectorLabel>
          {effectKey && onInfoEnter && (
            <button
              ref={infoRef}
              type="button"
              className="nodrag node-shell-action"
              onPointerDown={stopNodeEvent}
              onMouseDown={stopNodeEvent}
              onMouseEnter={() => {
                if (infoRef.current) onInfoEnter(effectKey, infoRef.current.getBoundingClientRect());
              }}
              onMouseLeave={onInfoLeave}
              style={{
                width: 16,
                height: 16,
                display: 'grid',
                placeItems: 'center',
                padding: 0,
                borderRadius: 999,
                border: '1px solid oklch(24% 0.014 285)',
                background: 'transparent',
                color: 'oklch(46% 0.014 285)',
                fontSize: 9,
                lineHeight: 1,
                cursor: 'help',
              }}
              aria-label={`About ${label}`}
            >
              i
            </button>
          )}
        </span>
        <span style={{ color: 'oklch(64% 0.015 285)', fontSize: 10, fontFamily: 'var(--mono)' }}>{value}</span>
      </div>
      <input
        className="nodrag node-slider"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerDown={stopNodeEvent}
        onMouseDown={stopNodeEvent}
        onClick={stopNodeEvent}
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <InspectorLabel>{label}</InspectorLabel>
      <select
        className="nodrag node-field"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onPointerDown={stopNodeEvent}
        onMouseDown={stopNodeEvent}
        onClick={stopNodeEvent}
        style={{
          width: '100%',
          background: 'oklch(11% 0.01 285)',
          border: '1px solid oklch(24% 0.014 285)',
          borderRadius: 4,
          color: 'oklch(76% 0.018 68)',
          fontFamily: 'var(--mono)',
          fontSize: 11,
          padding: '7px 8px',
          outline: 'none',
        }}
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
    <label
      className="nodrag"
      onPointerDown={stopNodeEvent}
      onMouseDown={stopNodeEvent}
      onClick={stopNodeEvent}
      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, cursor: 'pointer' }}
    >
      <InspectorLabel>{label}</InspectorLabel>
      <input
        className="nodrag node-check"
        type="checkbox"
        checked={checked}
        onPointerDown={stopNodeEvent}
        onMouseDown={stopNodeEvent}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
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
    <div
      ref={menuRef}
      style={{
        position: 'fixed', left: x, top: y, zIndex: 1000,
        background: 'oklch(16% 0.012 285)',
        border: '1px solid oklch(28% 0.016 285)',
        borderRadius: 8,
        boxShadow: '0 8px 32px oklch(0% 0 0 / 0.6)',
        width: 220, overflow: 'hidden',
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Search */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 12px',
        borderBottom: '1px solid oklch(24% 0.014 285)',
      }}>
        <span style={{ color: 'oklch(44% 0.015 285)', fontSize: 11 }}>⌕</span>
        <input
          ref={inputRef}
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
          style={{
            background: 'none', border: 'none', outline: 'none',
            color: 'oklch(75% 0.018 68)', fontFamily: 'var(--mono)', fontSize: 11,
            width: '100%',
          }}
        />
      </div>

      {/* Items */}
      <div style={{ maxHeight: 320, overflowY: 'auto', padding: '4px 0' }}>
        {groups.length === 0 && (
          <div style={{ padding: '8px 12px', color: 'oklch(42% 0.013 285)', fontSize: 10, fontFamily: 'var(--mono)' }}>
            No results
          </div>
        )}
        {groups.map(({ header, item }, i) => (
          <div key={i}>
            {header && !query && (
              <div style={{
                padding: '6px 12px 2px',
                color: 'oklch(38% 0.012 285)', fontSize: 9,
                fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.08em',
              }}>
                {header}
              </div>
            )}
            <button
              type="button"
              onClick={() => { onAdd(item.action); onClose(); }}
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                width: '100%', padding: '7px 12px',
                background: 'none', border: 'none', cursor: 'pointer',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'oklch(22% 0.014 285)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
            >
              <span style={{ color: KIND_COLOR[item.action.kind === 'layer' ? item.action.layerKind : item.action.kind === 'effect' ? 'effect' : 'merge'], fontSize: 10, width: 14, textAlign: 'center', flexShrink: 0 }}>
                {item.symbol}
              </span>
              <span style={{ color: 'oklch(72% 0.016 68)', fontSize: 11, fontFamily: 'var(--mono)' }}>
                {item.label}
              </span>
            </button>
          </div>
        ))}
      </div>
    </div>
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
    <div
      ref={menuRef}
      style={{
        position: 'fixed', left: x, top: y, zIndex: 1000,
        background: 'oklch(16% 0.012 285)',
        border: '1px solid oklch(28% 0.016 285)',
        borderRadius: 8,
        boxShadow: '0 8px 32px oklch(0% 0 0 / 0.6)',
        width: 200, overflow: 'hidden',
        padding: '4px 0',
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {items.map((item, i) => (
        <div key={i}>
          {item.dividerBefore && (
            <div style={{ height: 1, background: 'oklch(24% 0.014 285)', margin: '4px 0' }} />
          )}
          <button
            type="button"
            onClick={() => { item.action(); onClose(); }}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              width: '100%', padding: '8px 14px',
              background: 'none', border: 'none', cursor: 'pointer',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'oklch(22% 0.014 285)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
          >
            <span style={{
              fontFamily: 'var(--mono)', fontSize: 12,
              color: item.danger ? 'oklch(62% 0.15 25)' : 'oklch(72% 0.016 68)',
            }}>
              {item.label}
            </span>
            {item.hint && (
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'oklch(40% 0.012 285)' }}>
                {item.hint}
              </span>
            )}
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── buildRFNodes ─────────────────────────────────────────────────────────────

function buildRFNodes(
  doc: CanvasDocument,
  graph: CanvasGraph,
  imageCache: Map<string, HTMLImageElement>,
  selectedNodeIds: Set<string>,
  editorNodeId: string | null,
  connected: { sources: Set<string>; targets: Set<string> },
  onSelectNode: (id: string | null, options?: { additive?: boolean }) => void,
  onToggleEditor: (id: string) => void,
  onUpdateExportConfig: (patch: Partial<CanvasDocument['export']>) => void,
  exportBusy: boolean,
  onExport: () => void,
  onDeleteMerge: (id: string) => void,
  onUpdateLayer: (id: string, patch: Partial<Layer>) => void,
  onUpdateMerge: (id: string, patch: Partial<GraphMergeNode>) => void,
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
        doc,
        graph,
        previewTargetId: layer.id,
        imageCache,
        selected: selectedNodeIds.has(layer.id),
        editing: editorNodeId === layer.id,
        connected,
        onSelect: (event: React.MouseEvent) => onSelectNode(layer.id, { additive: event.metaKey || event.ctrlKey || event.shiftKey }),
        onToggleEditor: () => onToggleEditor(layer.id),
        onChange: (patch: Partial<Layer>) => onUpdateLayer(layer.id, patch),
      } as unknown as Record<string, unknown>,
      dragHandle: '.node-drag-handle',
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
        doc,
        graph,
        previewTargetId: mn.id,
        imageCache,
        selected: selectedNodeIds.has(mn.id),
        editing: editorNodeId === mn.id,
        connected,
        onSelect: (event: React.MouseEvent) => onSelectNode(mn.id, { additive: event.metaKey || event.ctrlKey || event.shiftKey }),
        onDelete: () => onDeleteMerge(mn.id),
        onToggleEditor: () => onToggleEditor(mn.id),
        onChange: (patch: Partial<GraphMergeNode>) => onUpdateMerge(mn.id, patch),
      } as unknown as Record<string, unknown>,
      dragHandle: '.node-drag-handle',
    });
  });

  const exportPos = graph.positions[EXPORT_NODE_ID] ?? {
    x: doc.layers.length * (NODE_W + 56), y: 80,
  };
  nodes.push({
    id: EXPORT_NODE_ID,
    type: 'exportNode',
    position: exportPos,
    selected: selectedNodeIds.has(EXPORT_NODE_ID),
    data: {
        doc,
        graph,
        previewTargetId: EXPORT_NODE_ID,
        imageCache,
        selected: selectedNodeIds.has(EXPORT_NODE_ID),
        editing: editorNodeId === EXPORT_NODE_ID,
        connected,
        busy: exportBusy,
        onSelect: (event: React.MouseEvent) => onSelectNode(EXPORT_NODE_ID, { additive: event.metaKey || event.ctrlKey || event.shiftKey }),
        onToggleEditor: () => onToggleEditor(EXPORT_NODE_ID),
        onChange: onUpdateExportConfig,
        onExport,
      } as unknown as Record<string, unknown>,
      dragHandle: '.node-drag-handle',
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
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>(() => selectedLayerId ? [selectedLayerId] : []);
  const [expandedNodeId, setExpandedNodeId] = useState<string | null>(null);
  const handleSelectNode = useCallback((id: string | null, options?: { additive?: boolean }) => {
    const additive = options?.additive ?? false;
    const nextNodeIds = !id
      ? []
      : additive
        ? (selectedNodeIds.includes(id) ? selectedNodeIds.filter((selectedId) => selectedId !== id) : [...selectedNodeIds, id])
        : [id];
    setSelectedEdgeId(null);
    setSelectedNodeIds(nextNodeIds);
    setExpandedNodeId((current) => {
      if (additive) return current && nextNodeIds.includes(current) ? current : null;
      return current === id ? current : null;
    });
    onSelectLayer(nextNodeIds.length === 1 ? nextNodeIds[0] : null);
  }, [onSelectLayer, selectedNodeIds]);
  const handleToggleEditor = useCallback((id: string) => {
    setSelectedEdgeId(null);
    setSelectedNodeIds([id]);
    setExpandedNodeId((current) => (current === id ? null : id));
    onSelectLayer(id);
  }, [onSelectLayer]);
  const handleDeleteMerge = useCallback((id: string) => {
    onDeleteNodes([id]);
  }, [onDeleteNodes]);
  const activeEditorNodeId = useMemo(() => {
    if (!expandedNodeId) return null;
    const exists = expandedNodeId === EXPORT_NODE_ID
      || doc.layers.some((layer) => layer.id === expandedNodeId)
      || graph.mergeNodes.some((node) => node.id === expandedNodeId);
    return exists ? expandedNodeId : null;
  }, [doc.layers, graph.mergeNodes, expandedNodeId]);

  // ── Single source of truth: derive display nodes/edges directly from doc ──
  // No local copy — any change to doc.layers or doc.graph is immediately reflected.
  const baseNodes = useMemo(
    () => buildRFNodes(
        doc,
        graph,
        imageCache,
        new Set(selectedNodeIds),
        activeEditorNodeId,
        connected,
        handleSelectNode,
        handleToggleEditor,
        onUpdateExportConfig,
        exportBusy,
        onExport,
        handleDeleteMerge,
        onUpdateLayer,
        onUpdateMergeNode,
      ),
    [doc, graph, imageCache, selectedNodeIds, activeEditorNodeId, connected, handleSelectNode, handleToggleEditor, onUpdateExportConfig, exportBusy, onExport, handleDeleteMerge, onUpdateLayer, onUpdateMergeNode],
  );
  const baseEdges = useMemo(
    () => toRFEdges(graph).map((edge) => ({
      ...edge,
      selected: selectedEdgeId === edge.id,
      style: {
        ...edge.style,
        stroke: selectedEdgeId === edge.id ? 'oklch(78% 0.02 285)' : edge.style?.stroke,
        strokeWidth: selectedEdgeId === edge.id ? 2.5 : edge.style?.strokeWidth,
        opacity: selectedEdgeId === null || selectedEdgeId === edge.id ? 0.75 : 0.45,
      },
    })),
    [graph, selectedEdgeId],
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
  useLayoutEffect(() => {
    if (!isDraggingRef.current) {
      setDragNodes(baseNodes);
      setDragEdges(baseEdges);
    }
  }, [baseNodes, baseEdges]);

  // During drag: apply ReactFlow position/dimension/select changes locally so the
  // node follows the cursor. On drag-stop we commit the final position to doc.graph.
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    const relevant = changes.filter((c) => c.type !== 'remove');
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
      setSelectedEdgeId((current) => (deleted.some((edge) => edge.id === current) ? null : current));
      onGraphChange(g);
    },
    [onGraphChange],
  );

  const commitNodePositions = useCallback((nodes: RFNode[]) => {
    const moved = nodes
      .filter((node) => node.id !== EXPORT_NODE_ID)
      .map((node) => ({ id: node.id, position: node.position }));
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
    onSelectLayer(null);
    setSelectedEdgeId(null);
    setSelectedNodeIds([]);
    setExpandedNodeId(null);
    setContextMenu(null);
  }, [onSelectLayer]);
  const onRFInit = useCallback((instance: ReactFlowInstance) => { rfInstanceRef.current = instance; }, []);
  const onEdgeClick = useCallback((e: React.MouseEvent, edge: RFEdge) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedEdgeId(edge.id);
    onSelectLayer(null);
    setSelectedNodeIds([]);
    setExpandedNodeId(null);
    setContextMenu(null);
  }, [onSelectLayer]);
  const onSelectionChange = useCallback(({ nodes, edges }: { nodes: RFNode[]; edges: RFEdge[] }) => {
    const nodeIds = nodes.map((node) => node.id);
    setSelectedNodeIds(nodeIds);
    setSelectedEdgeId(nodeIds.length === 0 && edges.length === 1 ? edges[0].id : null);
    setExpandedNodeId((current) => (nodeIds.length === 1 && nodeIds[0] === current ? current : null));
    onSelectLayer(nodeIds.length === 1 ? nodeIds[0] : null);
  }, [onSelectLayer]);
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
      if (selectedEdgeId) {
        e.preventDefault();
        onGraphChange(removeGraphEdge(graphRef.current, selectedEdgeId));
        setSelectedEdgeId(null);
        return;
      }
      const deletableNodeIds = selectedNodeIds.filter((id) => id !== EXPORT_NODE_ID);
      if (deletableNodeIds.length === 0) return;
      e.preventDefault();
      onDeleteNodes(deletableNodeIds);
      setSelectedNodeIds([]);
      setExpandedNodeId((current) => (current && deletableNodeIds.includes(current) ? null : current));
      onSelectLayer(null);
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [selectedEdgeId, selectedNodeIds, onDeleteNodes, onGraphChange, onSelectLayer]);

  // Intercept ReactFlow's built-in node removal so Delete key calls the proper
  // doc-layer callbacks instead of only mutating rfNodes state.
  const handleNodesChange = useCallback((changes: Parameters<typeof onNodesChange>[0]) => {
    const nonRemove = changes.filter((c) => {
      if (c.type !== 'remove') return true;
      const isExport = c.id === EXPORT_NODE_ID;
      if (!isExport) onDeleteNodes([c.id]);
      return false;
    });
    if (nonRemove.length) onNodesChange(nonRemove);
  }, [onNodesChange, onDeleteNodes]);

  return (
    <div
      style={{ width: '100%', height: '100%', background: 'oklch(10% 0.009 285)', position: 'relative' }}
    >
      <style>{`
        @keyframes node-shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .react-flow__node { padding: 0; border: none; border-radius: 6px; background: transparent; }
        .react-flow__node.selected { outline: none; }
        .react-flow__handle { border-radius: 50%; }
        .react-flow__controls {
          background: oklch(14% 0.01 285);
          border: 1px solid oklch(26% 0.015 285);
          border-radius: 4px; box-shadow: none;
        }
        .react-flow__controls-button {
          background: transparent;
          border-bottom: 1px solid oklch(22% 0.012 285);
          color: oklch(55% 0.015 285); fill: oklch(55% 0.015 285);
          width: 24px; height: 24px; padding: 5px;
        }
        .react-flow__controls-button:hover {
          background: oklch(20% 0.012 285);
          color: oklch(75% 0.02 285); fill: oklch(75% 0.02 285);
        }
        .react-flow__controls-button:last-child { border-bottom: none; }
        .react-flow__background { background: oklch(10% 0.009 285); }
        .node-drag-handle:active { cursor: grabbing; }
        .node-shell-action {
          transition: border-color 120ms cubic-bezier(0.25, 1, 0.5, 1), background 120ms cubic-bezier(0.25, 1, 0.5, 1), color 120ms cubic-bezier(0.25, 1, 0.5, 1);
        }
        .node-shell-action:hover {
          border-color: oklch(36% 0.024 285);
          background: oklch(18% 0.018 285);
          color: oklch(76% 0.02 285);
        }
        .node-shell-action:focus-visible,
        .node-section-button:focus-visible,
        .node-field:focus-visible,
        .node-color-input:focus-visible,
        .node-check:focus-visible {
          outline: 2px solid oklch(72% 0.07 298);
          outline-offset: 2px;
        }
        .node-section-button {
          transition: background 180ms cubic-bezier(0.25, 1, 0.5, 1), color 180ms cubic-bezier(0.25, 1, 0.5, 1);
        }
        .node-section-button:hover {
          background: oklch(15% 0.014 285);
        }
        .node-field,
        .node-slider,
        .node-color-input,
        .node-check {
          transition: border-color 120ms cubic-bezier(0.25, 1, 0.5, 1), box-shadow 120ms cubic-bezier(0.25, 1, 0.5, 1), background 120ms cubic-bezier(0.25, 1, 0.5, 1);
        }
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
          padding: 0 10px;
          border-radius: 6px;
          border: 1px solid oklch(26% 0.015 285);
          background: oklch(14% 0.01 285);
          color: oklch(74% 0.018 68);
          font-family: var(--mono);
          font-size: 10px;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          cursor: pointer;
          transition: border-color 120ms cubic-bezier(0.25, 1, 0.5, 1), background 120ms cubic-bezier(0.25, 1, 0.5, 1), color 120ms cubic-bezier(0.25, 1, 0.5, 1);
        }
        .node-canvas-toolbar button:hover {
          border-color: oklch(36% 0.024 285);
          background: oklch(18% 0.018 285);
          color: oklch(78% 0.02 68);
        }
        .node-field:hover,
        .node-color-input:hover {
          border-color: oklch(32% 0.02 285);
        }
        .node-slider {
          accent-color: oklch(68% 0.13 18);
        }
        .node-color-input {
          width: 30px;
          height: 22px;
          border-radius: 4px;
          border: 1px solid oklch(24% 0.014 285);
          background: oklch(11% 0.01 285);
          cursor: pointer;
          padding: 2px;
        }
        .node-check {
          width: 16px;
          height: 16px;
          accent-color: oklch(68% 0.13 18);
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
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="oklch(22% 0.012 285)" />
        <Controls showInteractive={false} />
      </ReactFlow>

      {(contextMenu?.type === 'pane-add' || contextMenu?.type === 'pane-insert') && (
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
        />
      )}

      {contextMenu?.type === 'node' && (
        <NodeContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          isMerge={contextMenu.isMerge}
          isExport={contextMenu.isExport}
          onDuplicate={() => onDuplicateLayer(contextMenu.nodeId)}
          onDelete={() => onDeleteNodes([contextMenu.nodeId])}
          onClose={() => setContextMenu(null)}
          menuRef={contextMenuRef}
        />
      )}
    </div>
  );
}

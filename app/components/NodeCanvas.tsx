import {
  useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState,
} from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  type Node as RFNode,
  type Edge as RFEdge,
  type Connection,
  type NodeProps,
  type ReactFlowInstance,
  Controls,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import type { CanvasDocument, Layer, GraphMergeNode, CanvasGraph, GraphEdge } from '../types/config';
import { makeGraphMergeNode } from '../types/config';
import { renderDocument } from '../utils/renderer';
import {
  EXPORT_NODE_ID,
  getUpstreamLayers,
  wouldCreateCycle,
  inferLinearGraph,
  toRFEdges,
  updateGraphPositions,
  addGraphEdge,
  removeGraphEdge,
  addMergeNode,
  removeMergeNode,
} from '../utils/nodeGraph';

// ─── Color map ───────────────────────────────────────────────────────────────

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

const THUMB_SIZE = 136;

// ─── Thumbnail ────────────────────────────────────────────────────────────────

interface ThumbProps {
  doc: CanvasDocument;
  layersSlice: Layer[];
  imageCache: Map<string, HTMLImageElement>;
}

function NodeThumbnail({ doc, layersSlice, imageCache }: ThumbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const partialDoc: CanvasDocument = { global: doc.global, layers: layersSlice };
    renderDocument(partialDoc, THUMB_SIZE, THUMB_SIZE, imageCache)
      .then((result) => {
        if (cancelled || !canvasRef.current) return;
        const ctx = canvasRef.current.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, THUMB_SIZE, THUMB_SIZE);
        ctx.drawImage(result, 0, 0, THUMB_SIZE, THUMB_SIZE);
        setReady(true);
      })
      .catch(() => { /* silent */ });

    return () => { cancelled = true; };
  }, [doc.global, layersSlice, imageCache]);

  return (
    <div
      style={{
        width: THUMB_SIZE,
        height: THUMB_SIZE,
        background: 'oklch(8% 0.01 285)',
        borderRadius: 3,
        overflow: 'hidden',
        position: 'relative',
        flexShrink: 0,
      }}
    >
      <canvas
        ref={canvasRef}
        width={THUMB_SIZE}
        height={THUMB_SIZE}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          opacity: ready ? 1 : 0,
          transition: 'opacity 200ms ease-out',
        }}
      />
      {!ready && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(90deg, oklch(14% 0.01 285) 25%, oklch(19% 0.012 285) 50%, oklch(14% 0.01 285) 75%)',
            backgroundSize: '200% 100%',
            animation: 'node-shimmer 1.4s ease-in-out infinite',
          }}
        />
      )}
    </div>
  );
}

// ─── Node shell ───────────────────────────────────────────────────────────────

interface NodeShellProps {
  kind: string;
  label: string;
  name: string;
  selected?: boolean;
  children: React.ReactNode;
  onDelete?: () => void;
}

function NodeShell({ kind, label, name, selected, children, onDelete }: NodeShellProps) {
  const accent = KIND_COLOR[kind] ?? 'oklch(55% 0.05 285)';
  return (
    <div
      style={{
        width: NODE_W,
        background: 'oklch(14% 0.01 285)',
        border: `1px solid ${selected ? accent : 'oklch(26% 0.015 285)'}`,
        borderRadius: 6,
        overflow: 'hidden',
        boxShadow: selected
          ? `0 0 0 1px ${accent}30, 0 4px 16px oklch(0% 0 0 / 0.5)`
          : '0 4px 16px oklch(0% 0 0 / 0.4)',
        cursor: 'default',
        userSelect: 'none',
      }}
    >
      {/* Type color strip */}
      <div style={{ height: 3, background: accent, flexShrink: 0 }} />

      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '5px 8px 5px 8px',
          background: 'oklch(12% 0.012 285)',
          borderBottom: '1px solid oklch(22% 0.012 285)',
          minHeight: 28,
        }}
      >
        <span style={{ color: accent, fontSize: 10, lineHeight: 1, flexShrink: 0 }}>
          {KIND_SYMBOL[kind] ?? '○'}
        </span>
        <span
          style={{
            color: 'oklch(48% 0.015 285)',
            fontSize: 9,
            fontFamily: 'var(--mono)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            flexShrink: 0,
          }}
        >
          {label}
        </span>
        <span
          style={{
            color: 'oklch(70% 0.018 68)',
            fontSize: 10,
            fontFamily: 'var(--mono)',
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {name}
        </span>
        {onDelete && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'oklch(42% 0.01 285)',
              padding: '0 2px',
              fontSize: 11,
              lineHeight: 1,
              flexShrink: 0,
            }}
          >
            ×
          </button>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: '8px 8px 6px 8px' }}>{children}</div>
    </div>
  );
}

// ─── Port row ─────────────────────────────────────────────────────────────────

function PortRow({ inputs, outputs }: { inputs: string[]; outputs: string[] }) {
  const portDot = (connected?: boolean) => ({
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: connected ? 'oklch(60% 0.09 192)' : 'oklch(30% 0.015 285)',
    border: '1px solid oklch(45% 0.02 285)',
    flexShrink: 0 as const,
  });

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: 4,
        minHeight: 20,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {inputs.map((label) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={portDot()} />
            <span style={{ color: 'oklch(45% 0.015 285)', fontSize: 9, fontFamily: 'var(--mono)' }}>
              {label}
            </span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
        {outputs.map((label) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ color: 'oklch(45% 0.015 285)', fontSize: 9, fontFamily: 'var(--mono)' }}>
              {label}
            </span>
            <div style={portDot()} />
          </div>
        ))}
      </div>
    </div>
  );
}

const NODE_W = 160;

// ─── Layer node ───────────────────────────────────────────────────────────────

type LayerNodeData = {
  layer: Layer;
  layersSlice: Layer[];
  doc: CanvasDocument;
  imageCache: Map<string, HTMLImageElement>;
  selected: boolean;
  onSelect: () => void;
};

function LayerNodeComponent({ data }: NodeProps) {
  const d = data as unknown as LayerNodeData;
  const { layer, layersSlice, doc, imageCache, selected, onSelect } = d;
  const isEffect = layer.kind === 'effect';
  const inputs = isEffect ? ['in'] : ['bg?'];

  return (
    <div onClick={onSelect} style={{ position: 'relative' }}>
      {/* Input handle */}
      <Handle
        type="target"
        position={Position.Left}
        id={isEffect ? 'in' : 'bg'}
        style={{ background: 'oklch(60% 0.09 192)', border: '1px solid oklch(45% 0.02 285)', width: 8, height: 8 }}
      />
      <NodeShell kind={layer.kind} label={layer.kind} name={layer.name} selected={selected}>
        <NodeThumbnail doc={doc} layersSlice={layersSlice} imageCache={imageCache} />
        <PortRow inputs={inputs} outputs={['out']} />
      </NodeShell>
      {/* Output handle */}
      <Handle
        type="source"
        position={Position.Right}
        id="out"
        style={{ background: 'oklch(60% 0.09 192)', border: '1px solid oklch(45% 0.02 285)', width: 8, height: 8 }}
      />
    </div>
  );
}

// ─── Merge node ───────────────────────────────────────────────────────────────

type MergeNodeData = {
  mergeNode: GraphMergeNode;
  upstreamLayers: Layer[];
  doc: CanvasDocument;
  imageCache: Map<string, HTMLImageElement>;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
};

function MergeNodeComponent({ data }: NodeProps) {
  const d = data as unknown as MergeNodeData;
  const { mergeNode, upstreamLayers, doc, imageCache, selected, onSelect, onDelete } = d;

  return (
    <div onClick={onSelect} style={{ position: 'relative' }}>
      <Handle
        type="target"
        id="a"
        position={Position.Left}
        style={{ top: '35%', background: 'oklch(60% 0.09 192)', border: '1px solid oklch(45% 0.02 285)', width: 8, height: 8 }}
      />
      <Handle
        type="target"
        id="b"
        position={Position.Left}
        style={{ top: '65%', background: 'oklch(60% 0.09 192)', border: '1px solid oklch(45% 0.02 285)', width: 8, height: 8 }}
      />
      <NodeShell kind="merge" label="merge" name={mergeNode.name} selected={selected} onDelete={onDelete}>
        <NodeThumbnail doc={doc} layersSlice={upstreamLayers} imageCache={imageCache} />
        <PortRow inputs={['a', 'b']} outputs={['out']} />
      </NodeShell>
      <Handle
        type="source"
        id="out"
        position={Position.Right}
        style={{ background: 'oklch(60% 0.09 192)', border: '1px solid oklch(45% 0.02 285)', width: 8, height: 8 }}
      />
    </div>
  );
}

// ─── Export node ──────────────────────────────────────────────────────────────

type ExportNodeData = {
  doc: CanvasDocument;
  imageCache: Map<string, HTMLImageElement>;
  onExport: () => void;
};

function ExportNodeComponent({ data }: NodeProps) {
  const d = data as unknown as ExportNodeData;
  const { doc, imageCache, onExport } = d;

  return (
    <div style={{ position: 'relative' }}>
      <Handle
        type="target"
        id="in"
        position={Position.Left}
        style={{ background: 'oklch(60% 0.09 192)', border: '1px solid oklch(45% 0.02 285)', width: 8, height: 8 }}
      />
      <NodeShell kind="export" label="export" name="Output">
        <NodeThumbnail doc={doc} layersSlice={doc.layers} imageCache={imageCache} />
        <div style={{ paddingTop: 8 }}>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onExport(); }}
            style={{
              width: '100%',
              padding: '5px 0',
              background: 'oklch(22% 0.015 285)',
              border: '1px solid oklch(35% 0.02 285)',
              borderRadius: 3,
              color: 'oklch(78% 0.02 285)',
              fontFamily: 'var(--mono)',
              fontSize: 10,
              cursor: 'pointer',
              letterSpacing: '0.04em',
              transition: 'background 120ms ease-out',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'oklch(30% 0.018 285)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'oklch(22% 0.015 285)';
            }}
          >
            ↗ export
          </button>
        </div>
      </NodeShell>
    </div>
  );
}

const nodeTypes = {
  layerNode: LayerNodeComponent,
  mergeNode: MergeNodeComponent,
  exportNode: ExportNodeComponent,
};

// ─── Conversion helpers ───────────────────────────────────────────────────────

function buildRFNodes(
  doc: CanvasDocument,
  graph: CanvasGraph,
  imageCache: Map<string, HTMLImageElement>,
  selectedLayerId: string | null,
  callbacks: {
    onSelectLayer: (id: string | null) => void;
    onExport: () => void;
    onDeleteMerge: (id: string) => void;
  },
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
        layersSlice: doc.layers.slice(0, i + 1),
        doc,
        imageCache,
        selected: selectedLayerId === layer.id,
        onSelect: () => callbacks.onSelectLayer(layer.id),
      } as unknown as Record<string, unknown>,
    });
  });

  graph.mergeNodes.forEach((mn) => {
    const pos = graph.positions[mn.id] ?? { x: 400, y: 300 };
    const upstreamLayers = getUpstreamLayers(mn.id, graph, doc.layers);
    nodes.push({
      id: mn.id,
      type: 'mergeNode',
      position: pos,
      data: {
        mergeNode: mn,
        upstreamLayers: upstreamLayers.length > 0 ? upstreamLayers : doc.layers,
        doc,
        imageCache,
        selected: selectedLayerId === mn.id,
        onSelect: () => callbacks.onSelectLayer(mn.id),
        onDelete: () => callbacks.onDeleteMerge(mn.id),
      } as unknown as Record<string, unknown>,
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
    data: {
      doc,
      imageCache,
      onExport: callbacks.onExport,
    } as unknown as Record<string, unknown>,
  });

  return nodes;
}

// ─── NodeCanvas ───────────────────────────────────────────────────────────────

interface NodeCanvasProps {
  doc: CanvasDocument;
  imageCache: Map<string, HTMLImageElement>;
  selectedLayerId: string | null;
  onSelectLayer: (id: string | null) => void;
  onGraphChange: (graph: CanvasGraph) => void;
  onExport: () => void;
}

export function NodeCanvas({
  doc,
  imageCache,
  selectedLayerId,
  onSelectLayer,
  onGraphChange,
  onExport,
}: NodeCanvasProps) {
  const graph = useMemo(
    () => doc.graph ?? inferLinearGraph(doc.layers),
    [doc.graph, doc.layers],
  );

  const graphRef = useRef(graph);
  useLayoutEffect(() => { graphRef.current = graph; }, [graph]);

  const callbacks = useMemo(
    () => ({
      onSelectLayer,
      onExport,
      onDeleteMerge: (id: string) => {
        onGraphChange(removeMergeNode(graphRef.current, id));
      },
    }),
    [onSelectLayer, onExport, onGraphChange],
  );

  const rfInstanceRef = useRef<ReactFlowInstance | null>(null);
  const fittedRef = useRef(false);

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<RFNode>([]);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState<RFEdge>([]);

  // Sync nodes when doc or graph changes externally
  useEffect(() => {
    setRfNodes(buildRFNodes(doc, graph, imageCache, selectedLayerId, callbacks));
    setRfEdges(toRFEdges(graph));
    // Fit view on first sync only
    if (!fittedRef.current && rfInstanceRef.current) {
      fittedRef.current = true;
      setTimeout(() => rfInstanceRef.current?.fitView({ padding: 0.2, duration: 0 }), 0);
    }
  }, [doc, graph, imageCache, selectedLayerId, callbacks, setRfNodes, setRfEdges]);

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
      // Only update the graph — the sync useEffect will re-derive RF edges
      onGraphChange(addGraphEdge(graphRef.current, edge));
    },
    [onGraphChange],
  );

  const onEdgesDelete = useCallback(
    (deleted: RFEdge[]) => {
      let g = graphRef.current;
      for (const e of deleted) g = removeGraphEdge(g, e.id);
      onGraphChange(g);
    },
    [onGraphChange],
  );

  const onNodeDragStop = useCallback(
    (_: unknown, node: RFNode) => {
      onGraphChange(updateGraphPositions(graphRef.current, [{ id: node.id, position: node.position }]));
    },
    [onGraphChange],
  );

  const handleAddMerge = useCallback(() => {
    const node = makeGraphMergeNode();
    const center = {
      x: (doc.layers.length / 2) * (NODE_W + 56),
      y: 300,
    };
    onGraphChange(addMergeNode(graphRef.current, node, center));
  }, [doc.layers.length, onGraphChange]);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: 'oklch(10% 0.009 285)',
        position: 'relative',
      }}
    >
      <style>{`
        @keyframes node-shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .react-flow__node { padding: 0; border: none; border-radius: 6px; background: transparent; }
        .react-flow__node.selected { outline: none; }
        .react-flow__handle { border-radius: 50%; }
        .react-flow__edge-path { transition: opacity 120ms; }
        .react-flow__controls {
          background: oklch(14% 0.01 285);
          border: 1px solid oklch(26% 0.015 285);
          border-radius: 4px;
          box-shadow: none;
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
      `}</style>

      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onEdgesDelete={onEdgesDelete}
        onNodeDragStop={onNodeDragStop}
        onPaneClick={() => onSelectLayer(null)}
        isValidConnection={isValidConnection}
        onInit={(instance) => { rfInstanceRef.current = instance; }}
        nodeTypes={nodeTypes}
        colorMode="dark"
        minZoom={0.3}
        maxZoom={2}
        deleteKeyCode="Delete"
        proOptions={{ hideAttribution: false }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="oklch(22% 0.012 285)"
        />
        <Controls showInteractive={false} />
      </ReactFlow>

      {/* Toolbar */}
      <div
        style={{
          position: 'absolute',
          top: 12,
          left: 12,
          display: 'flex',
          gap: 6,
          zIndex: 10,
        }}
      >
        <button
          type="button"
          onClick={handleAddMerge}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            padding: '4px 10px',
            background: 'oklch(14% 0.01 285)',
            border: '1px solid oklch(26% 0.015 285)',
            borderRadius: 4,
            color: 'oklch(60% 0.09 192)',
            fontFamily: 'var(--mono)',
            fontSize: 10,
            cursor: 'pointer',
            letterSpacing: '0.04em',
          }}
        >
          <span>⊕</span>
          <span>add merge</span>
        </button>
      </div>
    </div>
  );
}

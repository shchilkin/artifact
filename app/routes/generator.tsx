import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { Sidebar } from '../components/Sidebar';
import { CanvasPreview } from '../components/CanvasPreview';
import { PresetsPanel } from '../components/PresetsPanel';
import { BottomBar } from '../components/BottomBar';
import { SiteNav } from '../components/SiteNav';
import { usePresets } from '../hooks/usePresets';
import {
  ASPECT_SIZES,
  cloneDocument,
  DEFAULT_EXPORT,
  getPreviewDims,
  DEFAULT_DOCUMENT,
  makeEffectPresetLayer,
  makeEmojiLayer,
  makeFillLayer,
  makeGraphMergeNode,
  makeImageLayer,
  makeTextLayer,
  type AspectRatio,
  type CanvasDocument,
  type CanvasGraph,
  type EffectPreset,
  type GraphMergeNode,
  type ImageLayer,
  type Layer,
  type LayerKind,
} from '../types/config';
import type { AddAction, InsertConnectionConfig } from '../components/NodeCanvas';
import {
  addGraphEdge,
  addLayerToGraph,
  addMergeNode,
  inferLinearGraph,
  nextDropPosition,
  removeLayerFromGraph,
  removeMergeNode,
  splitEdgeWithNode,
} from '../utils/nodeGraph';

const NodeCanvas = lazy(() => import('../components/NodeCanvas').then((m) => ({ default: m.NodeCanvas })));
import { exportCanvas } from '../utils/exportCanvas';
import { exportEnvMap } from '../utils/exportEnvMap';
import { randomDocument } from '../utils/randomConfig';

const DOC_KEY = 'doc';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
const HISTORY_MAX = 50;

function isValidAspect(v: unknown): v is AspectRatio {
  return typeof v === 'string' && v in ASPECT_SIZES;
}

function ensureGraph(doc: CanvasDocument): CanvasGraph {
  return doc.graph ?? inferLinearGraph(doc.layers);
}

function normalizeDocument(raw: unknown): CanvasDocument {
  const doc = raw as CanvasDocument;
  const aspect = isValidAspect(doc.global?.aspect) ? doc.global.aspect : '1:1';
  const exportConfig = {
    ...DEFAULT_EXPORT,
    ...(typeof doc.export === 'object' && doc.export ? doc.export : {}),
  } as CanvasDocument['export'];
  return { ...doc, global: { ...doc.global, aspect }, export: exportConfig };
}

function getInitialDocument(): CanvasDocument {
  const params = new URLSearchParams(window.location.search);
  const docParam = params.get('doc');
  if (docParam) {
    try {
      return normalizeDocument(JSON.parse(docParam));
    } catch {
      // ignore
    }
  }

  try {
    const raw = localStorage.getItem(DOC_KEY);
    if (raw) return normalizeDocument(JSON.parse(raw));
  } catch {
    // ignore
  }

  return cloneDocument(DEFAULT_DOCUMENT);
}

async function readImageFile(file: File): Promise<string | null> {
  if (!file.type.startsWith('image/')) return null;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(typeof event.target?.result === 'string' ? event.target.result : null);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

type HistoryEntry = { doc: CanvasDocument };

function CanvasErrorFallback({ aspect }: { aspect: AspectRatio }) {
  const [pw, ph] = getPreviewDims(aspect);
  return (
    <div className="canvas-wrapper flex-1 flex items-center justify-center min-h-0 w-full">
      <div
        className="canvas-area relative h-full max-h-[min(100%,540px)] max-w-full flex flex-col items-center justify-center gap-2"
        style={{
          aspectRatio: `${pw} / ${ph}`,
          background: 'var(--sidebar-bg)',
          border: '1px solid var(--border)',
          color: 'var(--text-dim)',
          fontFamily: 'var(--mono)',
          fontSize: '11px',
        }}
      >
        <span>Canvas error — could not render layers.</span>
        <span style={{ opacity: 0.5 }}>{pw} × {ph}</span>
      </div>
    </div>
  );
}

type ViewMode = 'layers' | 'nodes';

function ViewModeToggle({ value, onChange }: { value: ViewMode; onChange: (mode: ViewMode) => void }) {
  const btnStyle = (active: boolean, side: 'left' | 'right'): React.CSSProperties => ({
    padding: '4px 12px',
    fontFamily: 'var(--mono)',
    fontSize: 10,
    letterSpacing: '0.05em',
    cursor: 'pointer',
    background: active ? 'var(--border)' : 'transparent',
    color: active ? 'var(--text)' : 'var(--text-dim)',
    border: '1px solid var(--border)',
    borderRight: side === 'left' ? 'none' : undefined,
    borderRadius: side === 'left' ? '3px 0 0 3px' : '0 3px 3px 0',
    transition: 'background 120ms ease-out, color 120ms ease-out',
  });
  return (
    <div className="hidden lg:flex items-center gap-0 flex-shrink-0 self-start m-3 mb-0">
      <button type="button" onClick={() => onChange('layers')} style={btnStyle(value === 'layers', 'left')}>layers</button>
      <button type="button" onClick={() => onChange('nodes')} style={btnStyle(value === 'nodes', 'right')}>nodes</button>
    </div>
  );
}

export default function Generator() {
  const [doc, _setDoc] = useState<CanvasDocument>(getInitialDocument());
  const [imageCache, setImageCache] = useState<Map<string, HTMLImageElement>>(new Map());
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [showPresets, setShowPresets] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingEnvMap, setIsExportingEnvMap] = useState(false);
  const [canvasDragOver, setCanvasDragOver] = useState(false);
  const [dropError, setDropError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('layers');

  const safeSelectedLayerId = selectedLayerId && doc.layers.some((layer) => layer.id === selectedLayerId)
    ? selectedLayerId
    : null;

  const docRef = useRef(doc);
  const selectedLayerIdRef = useRef(selectedLayerId);
  useLayoutEffect(() => {
    docRef.current = doc;
    selectedLayerIdRef.current = safeSelectedLayerId;
  }, [doc, safeSelectedLayerId]);

  const [past, setPast] = useState<HistoryEntry[]>([]);
  const [future, setFuture] = useState<HistoryEntry[]>([]);
  const histDebounceRef = useRef<ReturnType<typeof setTimeout>>();
  const preChangeRef = useRef<HistoryEntry | null>(null);
  const exportErrorTimerRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(exportErrorTimerRef.current), []);

  const setDoc = useCallback((newDoc: CanvasDocument) => {
    _setDoc(newDoc);
    if (!preChangeRef.current) preChangeRef.current = { doc: cloneDocument(docRef.current) };
    clearTimeout(histDebounceRef.current);
    histDebounceRef.current = setTimeout(() => {
      if (preChangeRef.current) {
        setPast((prev) => [...prev.slice(-(HISTORY_MAX - 1)), preChangeRef.current!]);
        setFuture([]);
        preChangeRef.current = null;
      }
    }, 400);
  }, []);

  const updateDocument = useCallback((mutate: (current: CanvasDocument) => CanvasDocument) => {
    setDoc(mutate(docRef.current));
  }, [setDoc]);

  const setSeed = useCallback((seed: number) => {
    clearTimeout(histDebounceRef.current);
    preChangeRef.current = null;
    setPast((prev) => [...prev.slice(-(HISTORY_MAX - 1)), { doc: cloneDocument(docRef.current) }]);
    setFuture([]);
    _setDoc({ ...docRef.current, global: { ...docRef.current.global, seed } });
  }, []);

  const undo = useCallback(() => {
    if (past.length === 0) return;
    clearTimeout(histDebounceRef.current);
    preChangeRef.current = null;
    const prev = past[past.length - 1];
    setPast((items) => items.slice(0, -1));
    setFuture((items) => [{ doc: cloneDocument(docRef.current) }, ...items.slice(0, HISTORY_MAX - 1)]);
    _setDoc(prev.doc);
  }, [past]);

  const redo = useCallback(() => {
    if (future.length === 0) return;
    clearTimeout(histDebounceRef.current);
    preChangeRef.current = null;
    const next = future[0];
    setFuture((items) => items.slice(1));
    setPast((items) => [...items.slice(-(HISTORY_MAX - 1)), { doc: cloneDocument(docRef.current) }]);
    _setDoc(next.doc);
  }, [future]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.key !== 'z') return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [redo, undo]);

  useEffect(() => {
    try {
      localStorage.setItem(DOC_KEY, JSON.stringify(doc));
    } catch {
      // quota exceeded or private browsing — gracefully ignore
    }
  }, [doc]);

  // Ensure doc.graph is always initialized when entering nodes mode so
  // NodeCanvas always has a concrete graph to read from (single source of truth).
  useEffect(() => {
    if (viewMode === 'nodes' && !docRef.current.graph) {
      const current = docRef.current;
      setDoc({ ...current, graph: inferLinearGraph(current.layers) });
    }
  }, [viewMode, setDoc]);

  useEffect(() => {
    const imageLayers = doc.layers.filter((layer): layer is ImageLayer => layer.kind === 'image' && Boolean(layer.src));
    let cancelled = false;
    imageLayers.forEach((layer) => {
      if (imageCache.has(layer.src)) return;
      const img = new Image();
      img.onload = () => {
        if (cancelled) return;
        setImageCache((prev) => {
          if (prev.has(layer.src)) return prev;
          const next = new Map(prev);
          next.set(layer.src, img);
          return next;
        });
      };
      img.onerror = () => { /* silently skip unloadable images */ };
      img.src = layer.src;
    });
    return () => {
      cancelled = true;
    };
  }, [doc.layers, imageCache]);

  const addLayer = useCallback((kind: Exclude<LayerKind, 'effect'>) => {
    const layer = kind === 'text'
      ? makeTextLayer()
      : kind === 'image'
        ? makeImageLayer('')
        : kind === 'fill'
          ? makeFillLayer()
          : makeEmojiLayer();
    updateDocument((current) => {
      if (!current.graph) return { ...current, layers: [...current.layers, layer] };
      return {
        ...current,
        layers: [...current.layers, layer],
        graph: addLayerToGraph(current.graph, layer.id, nextDropPosition(current.graph)),
      };
    });
    setSelectedLayerId(layer.id);
  }, [updateDocument]);

  const addEffectPreset = useCallback((preset: EffectPreset) => {
    const layer = makeEffectPresetLayer(preset);
    updateDocument((current) => {
      if (!current.graph) return { ...current, layers: [...current.layers, layer] };
      return {
        ...current,
        layers: [...current.layers, layer],
        graph: addLayerToGraph(current.graph, layer.id, nextDropPosition(current.graph)),
      };
    });
    setSelectedLayerId(layer.id);
  }, [updateDocument]);

  const removeLayer = useCallback((id: string) => {
    updateDocument((current) => ({
      ...current,
      layers: current.layers.filter((layer) => layer.id !== id),
      graph: current.graph ? removeLayerFromGraph(current.graph, id) : undefined,
    }));
    if (selectedLayerIdRef.current === id) setSelectedLayerId(null);
  }, [updateDocument]);

  const deleteNodeSelection = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    updateDocument((current) => {
      const nextLayers = current.layers.filter((layer) => !idSet.has(layer.id));
      let nextGraph = current.graph;
      if (nextGraph) {
        for (const mergeNode of nextGraph.mergeNodes) {
          if (idSet.has(mergeNode.id)) nextGraph = removeMergeNode(nextGraph, mergeNode.id);
        }
        for (const id of ids) {
          if (current.layers.some((layer) => layer.id === id)) nextGraph = removeLayerFromGraph(nextGraph, id);
        }
      }
      return { ...current, layers: nextLayers, graph: nextGraph };
    });
    if (selectedLayerIdRef.current && idSet.has(selectedLayerIdRef.current)) setSelectedLayerId(null);
  }, [updateDocument]);

  const updateLayer = useCallback((id: string, patch: Partial<Layer>) => {
    updateDocument((current) => ({
      ...current,
      layers: current.layers.map((layer) => layer.id === id ? { ...layer, ...patch } : layer),
    }));
  }, [updateDocument]);

  const updateMergeNode = useCallback((id: string, patch: Partial<GraphMergeNode>) => {
    updateDocument((current) => {
      if (!current.graph) return current;
      return {
        ...current,
        graph: {
          ...current.graph,
          mergeNodes: current.graph.mergeNodes.map((node) => node.id === id ? { ...node, ...patch } : node),
        },
      };
    });
  }, [updateDocument]);

  const reorderLayers = useCallback((layers: Layer[]) => {
    updateDocument((current) => ({ ...current, layers }));
  }, [updateDocument]);

  const duplicateLayer = useCallback((id: string) => {
    const current = docRef.current;
    const layer = current.layers.find((item) => item.id === id);
    if (!layer) return;
    const dup: Layer = layer.kind === 'emoji'
      ? { ...layer, emojis: [...layer.emojis], id: `layer-${Date.now()}`, name: `${layer.name} copy` }
      : { ...layer, id: `layer-${Date.now()}`, name: `${layer.name} copy` };
    updateDocument((innerCurrent) => {
      const idx = innerCurrent.layers.findIndex((item) => item.id === id);
      const newLayers = [...innerCurrent.layers];
      newLayers.splice(idx + 1, 0, dup);
      if (!innerCurrent.graph) return { ...innerCurrent, layers: newLayers };
      return {
        ...innerCurrent,
        layers: newLayers,
        graph: addLayerToGraph(innerCurrent.graph, dup.id, nextDropPosition(innerCurrent.graph)),
      };
    });
    setSelectedLayerId(dup.id);
  }, [updateDocument]);

  const handleAddLayerAt = useCallback((action: AddAction, position: { x: number; y: number }, insertion?: InsertConnectionConfig) => {
    if (action.kind === 'merge') {
      const node = makeGraphMergeNode();
      updateDocument((current) => {
        let graph = addMergeNode(ensureGraph(current), node, position);
        if (insertion?.replaceEdgeId) {
          graph = splitEdgeWithNode(graph, insertion.replaceEdgeId, node.id, 'a');
        } else if (insertion?.sourceId) {
          graph = addGraphEdge(graph, {
            id: `e-${insertion.sourceId}-${node.id}-${Date.now()}`,
            fromId: insertion.sourceId,
            fromPort: 'out',
            toId: node.id,
            toPort: 'a',
          });
        }
        if (!insertion?.replaceEdgeId && insertion?.targetId) {
          graph = addGraphEdge(graph, {
            id: `e-${node.id}-${insertion.targetId}-${Date.now() + 1}`,
            fromId: node.id,
            fromPort: 'out',
            toId: insertion.targetId,
            toPort: insertion.targetPort ?? 'in',
          });
        }
        return { ...current, graph };
      });
      return;
    }
    const layer = action.kind === 'effect'
      ? makeEffectPresetLayer(action.preset)
      : action.layerKind === 'text'
        ? makeTextLayer()
        : action.layerKind === 'image'
          ? makeImageLayer('')
          : action.layerKind === 'fill'
            ? makeFillLayer()
            : makeEmojiLayer();
    updateDocument((current) => {
      let graph = addLayerToGraph(ensureGraph(current), layer.id, position);
      if (insertion?.replaceEdgeId) {
        graph = splitEdgeWithNode(graph, insertion.replaceEdgeId, layer.id, action.kind === 'effect' ? 'in' : 'bg');
      } else if (insertion?.sourceId) {
        graph = addGraphEdge(graph, {
          id: `e-${insertion.sourceId}-${layer.id}-${Date.now()}`,
          fromId: insertion.sourceId,
          fromPort: 'out',
          toId: layer.id,
          toPort: action.kind === 'effect' ? 'in' : 'bg',
        });
      }
      if (!insertion?.replaceEdgeId && insertion?.targetId) {
        graph = addGraphEdge(graph, {
          id: `e-${layer.id}-${insertion.targetId}-${Date.now() + 1}`,
          fromId: layer.id,
          fromPort: 'out',
          toId: insertion.targetId,
          toPort: insertion.targetPort ?? 'in',
        });
      }
      return {
        ...current,
        layers: [...current.layers, layer],
        graph,
      };
    });
    setSelectedLayerId(layer.id);
  }, [updateDocument]);

  const handleRandomize = useCallback(() => {
    clearTimeout(histDebounceRef.current);
    preChangeRef.current = null;
    setPast((prev) => [...prev.slice(-(HISTORY_MAX - 1)), { doc: cloneDocument(docRef.current) }]);
    setFuture([]);
    const nextDoc = randomDocument();
    _setDoc(nextDoc);
    setSelectedLayerId(null);
  }, []);

  const handleExport = useCallback(async (scale: 1 | 2 | 3, format: 'png' | 'jpeg') => {
    setIsExporting(true);
    setExportError(null);
    try {
      await exportCanvas(docRef.current, imageCache, scale, format);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Export failed';
      setExportError(msg);
      clearTimeout(exportErrorTimerRef.current);
      exportErrorTimerRef.current = setTimeout(() => setExportError(null), 5000);
    } finally {
      setIsExporting(false);
    }
  }, [imageCache]);

  const handleEnvMapExport = useCallback(async () => {
    setIsExportingEnvMap(true);
    setExportError(null);
    try {
      await exportEnvMap(docRef.current, imageCache);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Env map export failed';
      setExportError(msg);
      clearTimeout(exportErrorTimerRef.current);
      exportErrorTimerRef.current = setTimeout(() => setExportError(null), 5000);
    } finally {
      setIsExportingEnvMap(false);
    }
  }, [imageCache]);

  const handleNodeExport = useCallback(() => {
    const exportConfig = docRef.current.export ?? DEFAULT_EXPORT;
    if (exportConfig.target === 'envmap') {
      void handleEnvMapExport();
      return;
    }
    void handleExport(exportConfig.scale, exportConfig.format);
  }, [handleEnvMapExport, handleExport]);

  const handleGraphChange = useCallback((graph: CanvasGraph) => {
    updateDocument((current) => ({ ...current, graph }));
  }, [updateDocument]);

  const handleExportConfigChange = useCallback((patch: Partial<CanvasDocument['export']>) => {
    updateDocument((current) => ({
      ...current,
      export: { ...current.export, ...patch },
    }));
  }, [updateDocument]);

  const { presets, savePreset, deletePreset, loadPreset } = usePresets();

  const handleLoadPreset = useCallback((preset: Parameters<typeof loadPreset>[0]) => {
    clearTimeout(histDebounceRef.current);
    preChangeRef.current = null;
    setPast((prev) => [...prev.slice(-(HISTORY_MAX - 1)), { doc: cloneDocument(docRef.current) }]);
    setFuture([]);
    const { doc: nextDoc } = loadPreset(preset);
    _setDoc(normalizeDocument(nextDoc));
    setSelectedLayerId(null);
    setShowPresets(false);
  }, [loadPreset]);

  useEffect(() => {
    if (!showPresets) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setShowPresets(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [showPresets]);

  const handleCopyLink = useCallback(() => {
    const params = new URLSearchParams();
    params.set('doc', JSON.stringify(docRef.current));
    const url = `${window.location.origin}/app?${params.toString()}`;
    navigator.clipboard.writeText(url).catch(() => {
      prompt('Copy this link:', url);
    });
  }, []);

  const handleDroppedFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) return;
    if (file.size > MAX_IMAGE_BYTES) {
      setDropError(`Image too large — max ${MAX_IMAGE_BYTES / 1024 / 1024}MB`);
      setTimeout(() => setDropError(null), 4000);
      return;
    }
    try {
      const src = await readImageFile(file);
      if (!src) return;
      const layer = makeImageLayer(src);
      updateDocument((current) => ({ ...current, layers: [...current.layers, layer] }));
      setSelectedLayerId(layer.id);
    } catch {
      setDropError('Could not read image');
      setTimeout(() => setDropError(null), 4000);
    }
  }, [updateDocument]);

  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (!item.type.startsWith('image/')) continue;
        const file = item.getAsFile();
        if (file) {
          void handleDroppedFile(file);
          break;
        }
      }
    }
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [handleDroppedFile]);

  const bottomBarProps = {
    seed: doc.global.seed,
    onSeedChange: setSeed,
    onRandomize: handleRandomize,
    onUndo: undo,
    onRedo: redo,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    undoCount: past.length,
    onPresetsToggle: () => setShowPresets((prev) => !prev),
    onCopyLink: handleCopyLink,
  };

  return (
    <div className="generator-layout flex flex-col w-full h-full">
      <SiteNav solid />
      <div className="app">
        <main
          className="main"
          onDragEnter={(e) => {
            if (Array.from(e.dataTransfer.types).includes('Files')) setCanvasDragOver(true);
          }}
          onDragOver={(e) => e.preventDefault()}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setCanvasDragOver(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setCanvasDragOver(false);
            const file = e.dataTransfer.files[0];
            if (file) void handleDroppedFile(file);
          }}
        >
          <ViewModeToggle value={viewMode} onChange={setViewMode} />

          {viewMode === 'layers' ? (
            <ErrorBoundary fallback={<CanvasErrorFallback aspect={doc.global.aspect ?? '1:1'} />}>
              <CanvasPreview
                doc={doc}
                imageCache={imageCache}
                selectedLayerId={safeSelectedLayerId}
                dragOver={canvasDragOver}
                onLayerUpdate={updateLayer}
                onSelectLayer={setSelectedLayerId}
              />
            </ErrorBoundary>
          ) : (
            <div className="hidden lg:flex flex-1 min-h-0 w-full">
              <Suspense fallback={<div style={{ flex: 1, background: 'oklch(10% 0.009 285)' }} />}>
                <NodeCanvas
                  doc={doc}
                  imageCache={imageCache}
                  selectedLayerId={selectedLayerId}
                  onSelectLayer={setSelectedLayerId}
                  onGraphChange={handleGraphChange}
                  onUpdateLayer={updateLayer}
                  onUpdateMergeNode={updateMergeNode}
                  onUpdateExportConfig={handleExportConfigChange}
                  exportBusy={isExporting || isExportingEnvMap}
                  onExport={handleNodeExport}
                  onAddLayerAt={handleAddLayerAt}
                  onDeleteNodes={deleteNodeSelection}
                  onDuplicateLayer={duplicateLayer}
                />
              </Suspense>
            </div>
          )}

          {(dropError || exportError) && (
            <p className="font-mono text-[10px] text-red-400 text-center py-1.5 border-t border-red-400/30 flex-shrink-0">
              {dropError ?? exportError}
            </p>
          )}
          <BottomBar {...bottomBarProps} />
        </main>

        {viewMode === 'layers' && (
          <Sidebar
            doc={doc}
            onDocChange={setDoc}
            selectedLayerId={safeSelectedLayerId}
            onSelectLayer={setSelectedLayerId}
            onAddLayer={addLayer}
            onAddEffectPreset={addEffectPreset}
            onRemoveLayer={removeLayer}
            onReorderLayers={reorderLayers}
            onDuplicateLayer={duplicateLayer}
            mobileActionBar={<BottomBar {...bottomBarProps} />}
          />
        )}

        <AnimatePresence>
          {showPresets && (
            <PresetsPanel
              presets={presets}
              onSave={(name) => savePreset(name, docRef.current, imageCache)}
              onLoad={handleLoadPreset}
              onDelete={deletePreset}
              onClose={() => setShowPresets(false)}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

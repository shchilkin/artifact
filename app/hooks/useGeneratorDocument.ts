import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { AddAction, InsertConnectionConfig } from '../components/NodeCanvas';
import {
  type AspectRatio,
  type CanvasDocument,
  type CanvasGraph,
  type EffectPreset,
  type GraphColorNode,
  type GraphMergeNode,
  type Layer,
  type LayerKind,
  makeGraphColorNode,
  makeGraphMergeNode,
} from '../types/config';
import {
  addLayerToDocument,
  bootstrapDocumentGraph,
  createEffectPresetLayer,
  createImageLayerFromSource,
  createLayerOfKind,
  deleteNodesFromDocument,
  duplicateLayerInDocument,
  ensureDocumentGraph,
  removeLayerFromDocument,
  reorderDocumentLayers,
  setDocumentAspect,
  setDocumentGraph,
  setDocumentSeed,
  updateColorNodeInDocument,
  updateDocumentExportConfig,
  updateLayerInDocument,
  updateMergeNodeInDocument,
} from '../utils/documentCommands';
import {
  createPendingHistoryEntry,
  type DocumentUpdateMode,
  flushPendingHistory,
  type HistoryEntry,
  pushSnapshotHistory,
  redoHistory,
  undoHistory,
} from '../utils/documentHistory';
import {
  createDocumentShareUrl,
  getInitialDocument,
  normalizeDocument,
  removeDocParamFromUrl,
  saveDocumentToStorage,
} from '../utils/documentPersistence';
import { addColorNode, addGraphEdge, addLayerToGraph, addMergeNode, splitEdgeWithNode } from '../utils/nodeGraph';
import { randomDocument } from '../utils/randomConfig';

export function useGeneratorDocument(nodeModeEnabled: boolean) {
  const [doc, _setDoc] = useState<CanvasDocument>(getInitialDocument());
  const [fromDocParam] = useState(
    () => typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('doc'),
  );
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [past, setPast] = useState<HistoryEntry[]>([]);
  const [future, setFuture] = useState<HistoryEntry[]>([]);

  const safeSelectedLayerId =
    selectedLayerId && doc.layers.some((layer) => layer.id === selectedLayerId) ? selectedLayerId : null;

  const docRef = useRef(doc);
  const selectedLayerIdRef = useRef(selectedLayerId);
  const histDebounceRef = useRef<ReturnType<typeof setTimeout>>();
  const preChangeRef = useRef<HistoryEntry | null>(null);

  useLayoutEffect(() => {
    docRef.current = doc;
    selectedLayerIdRef.current = safeSelectedLayerId;
  }, [doc, safeSelectedLayerId]);

  // Clean up ?doc= param from URL after loading — prevents stale deep-link on refresh/share
  useEffect(() => {
    if (fromDocParam) {
      window.history.replaceState(null, '', removeDocParamFromUrl(window.location.href));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clearPendingHistory = useCallback(() => {
    clearTimeout(histDebounceRef.current);
    preChangeRef.current = null;
  }, []);

  useEffect(() => () => clearTimeout(histDebounceRef.current), []);

  const commitDocument = useCallback(
    (newDoc: CanvasDocument, mode: DocumentUpdateMode) => {
      if (mode === 'snapshot') {
        clearPendingHistory();
        setPast((items) => pushSnapshotHistory({ past: items, future: [] }, docRef.current).past);
        setFuture([]);
        _setDoc(newDoc);
        return;
      }

      if (mode === 'debounce') {
        _setDoc(newDoc);
        preChangeRef.current = createPendingHistoryEntry(docRef.current, preChangeRef.current);
        clearTimeout(histDebounceRef.current);
        histDebounceRef.current = setTimeout(() => {
          if (!preChangeRef.current) return;
          setPast((items) => flushPendingHistory({ past: items, future: [] }, preChangeRef.current).past);
          setFuture([]);
          preChangeRef.current = null;
        }, 400);
        return;
      }

      _setDoc(newDoc);
    },
    [clearPendingHistory],
  );

  const setDoc = useCallback(
    (newDoc: CanvasDocument) => {
      commitDocument(newDoc, 'debounce');
    },
    [commitDocument],
  );

  const updateDocument = useCallback(
    (mutate: (current: CanvasDocument) => CanvasDocument, mode: DocumentUpdateMode) => {
      commitDocument(mutate(docRef.current), mode);
    },
    [commitDocument],
  );

  const replaceDocument = useCallback(
    (nextDoc: CanvasDocument) => {
      commitDocument(normalizeDocument(nextDoc), 'snapshot');
      setSelectedLayerId(null);
    },
    [commitDocument],
  );

  const setSeed = useCallback(
    (seed: number) => {
      commitDocument(setDocumentSeed(docRef.current, seed), 'snapshot');
    },
    [commitDocument],
  );

  const setAspect = useCallback(
    (aspect: AspectRatio) => {
      updateDocument((current) => setDocumentAspect(current, aspect), 'debounce');
    },
    [updateDocument],
  );

  const undo = useCallback(() => {
    clearPendingHistory();
    const result = undoHistory({ past, future }, docRef.current);
    if (!result) return;
    setPast(result.past);
    setFuture(result.future);
    _setDoc(result.doc);
  }, [clearPendingHistory, future, past]);

  const redo = useCallback(() => {
    clearPendingHistory();
    const result = redoHistory({ past, future }, docRef.current);
    if (!result) return;
    setPast(result.past);
    setFuture(result.future);
    _setDoc(result.doc);
  }, [clearPendingHistory, future, past]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.key !== 'z') return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [redo, undo]);

  useEffect(() => {
    saveDocumentToStorage(doc);
  }, [doc]);

  useEffect(() => {
    if (nodeModeEnabled && !docRef.current.graph) {
      commitDocument(bootstrapDocumentGraph(docRef.current), 'silent');
    }
  }, [commitDocument, nodeModeEnabled]);

  const addLayer = useCallback(
    (kind: Exclude<LayerKind, 'effect'>) => {
      const layer = createLayerOfKind(kind);
      updateDocument((current) => addLayerToDocument(current, layer), 'snapshot');
      setSelectedLayerId(layer.id);
    },
    [updateDocument],
  );

  const addEffectPreset = useCallback(
    (preset: EffectPreset) => {
      const layer = createEffectPresetLayer(preset);
      updateDocument((current) => addLayerToDocument(current, layer), 'snapshot');
      setSelectedLayerId(layer.id);
    },
    [updateDocument],
  );

  const addImageFromSource = useCallback(
    (src: string) => {
      const layer = createImageLayerFromSource(src);
      updateDocument((current) => addLayerToDocument(current, layer), 'snapshot');
      setSelectedLayerId(layer.id);
    },
    [updateDocument],
  );

  const removeLayer = useCallback(
    (id: string) => {
      updateDocument((current) => removeLayerFromDocument(current, id), 'snapshot');
      if (selectedLayerIdRef.current === id) setSelectedLayerId(null);
    },
    [updateDocument],
  );

  const deleteNodeSelection = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      const idSet = new Set(ids);
      updateDocument((current) => deleteNodesFromDocument(current, ids), 'snapshot');
      if (selectedLayerIdRef.current && idSet.has(selectedLayerIdRef.current)) setSelectedLayerId(null);
    },
    [updateDocument],
  );

  const updateLayer = useCallback(
    (id: string, patch: Partial<Layer>) => {
      updateDocument((current) => updateLayerInDocument(current, id, patch), 'debounce');
    },
    [updateDocument],
  );

  const updateMergeNode = useCallback(
    (id: string, patch: Partial<GraphMergeNode>) => {
      updateDocument((current) => updateMergeNodeInDocument(current, id, patch), 'debounce');
    },
    [updateDocument],
  );

  const updateColorNode = useCallback(
    (id: string, patch: Partial<GraphColorNode>) => {
      updateDocument((current) => updateColorNodeInDocument(current, id, patch), 'debounce');
    },
    [updateDocument],
  );

  const reorderLayers = useCallback(
    (layers: Layer[]) => {
      updateDocument((current) => reorderDocumentLayers(current, layers), 'snapshot');
    },
    [updateDocument],
  );

  const duplicateLayer = useCallback(
    (id: string) => {
      const result = duplicateLayerInDocument(docRef.current, id);
      if (!result.layer) return;
      commitDocument(result.doc, 'snapshot');
      setSelectedLayerId(result.layer.id);
    },
    [commitDocument],
  );

  const handleAddLayerAt = useCallback(
    (action: AddAction, position: { x: number; y: number }, insertion?: InsertConnectionConfig) => {
      if (action.kind === 'merge') {
        const node = makeGraphMergeNode();
        updateDocument((current) => {
          let graph = addMergeNode(ensureDocumentGraph(current), node, position);
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
        }, 'snapshot');
        return;
      }

      if (action.kind === 'color') {
        const node = makeGraphColorNode();
        updateDocument((current) => {
          let graph = addColorNode(ensureDocumentGraph(current), node, position);
          if (insertion?.replaceEdgeId) {
            graph = splitEdgeWithNode(graph, insertion.replaceEdgeId, node.id, 'in');
          } else if (insertion?.sourceId) {
            graph = addGraphEdge(graph, {
              id: `e-${insertion.sourceId}-${node.id}-${Date.now()}`,
              fromId: insertion.sourceId,
              fromPort: 'out',
              toId: node.id,
              toPort: 'in',
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
        }, 'snapshot');
        return;
      }

      const layer =
        action.kind === 'effect' ? createEffectPresetLayer(action.preset) : createLayerOfKind(action.layerKind);

      updateDocument((current) => {
        let graph = addLayerToGraph(ensureDocumentGraph(current), layer.id, position);
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
      }, 'snapshot');
      setSelectedLayerId(layer.id);
    },
    [updateDocument],
  );

  const handleRandomize = useCallback(() => {
    commitDocument(randomDocument(), 'snapshot');
    setSelectedLayerId(null);
  }, [commitDocument]);

  const handleGraphChange = useCallback(
    (graph: CanvasGraph) => {
      updateDocument((current) => setDocumentGraph(current, graph), 'debounce');
    },
    [updateDocument],
  );

  const handleExportConfigChange = useCallback(
    (patch: Partial<CanvasDocument['export']>) => {
      updateDocument((current) => updateDocumentExportConfig(current, patch), 'debounce');
    },
    [updateDocument],
  );

  const handleCopyLink = useCallback(() => {
    const url = createDocumentShareUrl(window.location.origin, docRef.current);
    navigator.clipboard.writeText(url).catch(() => {
      prompt('Copy this link:', url);
    });
  }, []);

  return {
    doc,
    docRef,
    selectedLayerId: safeSelectedLayerId,
    setSelectedLayerId,
    addLayer,
    addEffectPreset,
    addImageFromSource,
    removeLayer,
    deleteNodeSelection,
    updateLayer,
    updateMergeNode,
    updateColorNode,
    reorderLayers,
    duplicateLayer,
    handleAddLayerAt,
    handleRandomize,
    handleGraphChange,
    handleExportConfigChange,
    handleCopyLink,
    loadDocument: replaceDocument,
    setDoc,
    setSeed,
    setAspect,
    undo,
    redo,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    undoCount: past.length,
    fromDocParam,
  };
}

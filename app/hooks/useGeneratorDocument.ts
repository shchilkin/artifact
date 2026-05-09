import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { AddAction, InsertConnectionConfig } from '../components/NodeCanvas';
import {
  ASPECT_SIZES,
  cloneDocument,
  DEFAULT_DOCUMENT,
  DEFAULT_EXPORT,
  makeEffectPresetLayer,
  makeEmojiLayer,
  makeFillLayer,
  makeGraphColorNode,
  makeGraphMergeNode,
  makeImageLayer,
  makeTextLayer,
  type AspectRatio,
  type CanvasDocument,
  type CanvasGraph,
  type EffectPreset,
  type GraphColorNode,
  type GraphMergeNode,
  type Layer,
  type LayerKind,
} from '../types/config';
import { randomDocument } from '../utils/randomConfig';
import {
  addColorNode,
  addGraphEdge,
  addLayerToGraph,
  addMergeNode,
  inferLinearGraph,
  nextDropPosition,
  removeColorNode,
  removeLayerFromGraph,
  removeMergeNode,
  splitEdgeWithNode,
  updateColorNode as updateColorNodeInGraph,
} from '../utils/nodeGraph';

const DOC_KEY = 'doc';
const HISTORY_MAX = 50;

type HistoryEntry = { doc: CanvasDocument };

function isValidAspect(value: unknown): value is AspectRatio {
  return typeof value === 'string' && value in ASPECT_SIZES;
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
  const graph = doc.graph
    ? { ...doc.graph, colorNodes: doc.graph.colorNodes ?? [] }
    : undefined;
  return { ...doc, global: { ...doc.global, aspect }, export: exportConfig, graph };
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

function cloneLayerForDuplicate(layer: Layer): Layer {
  if (layer.kind === 'emoji') {
    return {
      ...layer,
      emojis: [...layer.emojis],
      id: `layer-${Date.now()}`,
      name: `${layer.name} copy`,
    };
  }
  return { ...layer, id: `layer-${Date.now()}`, name: `${layer.name} copy` };
}

export function useGeneratorDocument(nodeModeEnabled: boolean) {
  const [doc, _setDoc] = useState<CanvasDocument>(getInitialDocument());
  const fromDocParam = useRef(
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('doc')
  );
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [past, setPast] = useState<HistoryEntry[]>([]);
  const [future, setFuture] = useState<HistoryEntry[]>([]);

  const safeSelectedLayerId = selectedLayerId && doc.layers.some((layer) => layer.id === selectedLayerId)
    ? selectedLayerId
    : null;

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
    if (fromDocParam.current) {
      const url = new URL(window.location.href);
      url.searchParams.delete('doc');
      window.history.replaceState(null, '', url.toString());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pushHistorySnapshot = useCallback(() => {
    clearTimeout(histDebounceRef.current);
    preChangeRef.current = null;
    setPast((items) => [...items.slice(-(HISTORY_MAX - 1)), { doc: cloneDocument(docRef.current) }]);
    setFuture([]);
  }, []);

  const setDoc = useCallback((newDoc: CanvasDocument) => {
    _setDoc(newDoc);
    if (!preChangeRef.current) preChangeRef.current = { doc: cloneDocument(docRef.current) };
    clearTimeout(histDebounceRef.current);
    histDebounceRef.current = setTimeout(() => {
      if (preChangeRef.current) {
        setPast((items) => [...items.slice(-(HISTORY_MAX - 1)), preChangeRef.current!]);
        setFuture([]);
        preChangeRef.current = null;
      }
    }, 400);
  }, []);

  const updateDocument = useCallback((mutate: (current: CanvasDocument) => CanvasDocument) => {
    setDoc(mutate(docRef.current));
  }, [setDoc]);

  const replaceDocument = useCallback((nextDoc: CanvasDocument) => {
    pushHistorySnapshot();
    _setDoc(normalizeDocument(nextDoc));
    setSelectedLayerId(null);
  }, [pushHistorySnapshot]);

  const setSeed = useCallback((seed: number) => {
    pushHistorySnapshot();
    _setDoc({ ...docRef.current, global: { ...docRef.current.global, seed } });
  }, [pushHistorySnapshot]);

  const setAspect = useCallback((aspect: AspectRatio) => {
    updateDocument((current) => ({
      ...current,
      global: { ...current.global, aspect },
    }));
  }, [updateDocument]);

  const undo = useCallback(() => {
    if (past.length === 0) return;
    clearTimeout(histDebounceRef.current);
    preChangeRef.current = null;
    const previous = past[past.length - 1];
    setPast((items) => items.slice(0, -1));
    setFuture((items) => [{ doc: cloneDocument(docRef.current) }, ...items.slice(0, HISTORY_MAX - 1)]);
    _setDoc(previous.doc);
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
    try {
      localStorage.setItem(DOC_KEY, JSON.stringify(doc));
    } catch {
      // quota exceeded or private browsing, ignore
    }
  }, [doc]);

  useEffect(() => {
    if (nodeModeEnabled && !docRef.current.graph) {
      const current = docRef.current;
      setDoc({ ...current, graph: inferLinearGraph(current.layers) });
    }
  }, [nodeModeEnabled, setDoc]);

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

  const addImageFromSource = useCallback((src: string) => {
    const layer = makeImageLayer(src);
    updateDocument((current) => ({ ...current, layers: [...current.layers, layer] }));
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
        for (const colorNode of (nextGraph?.colorNodes ?? [])) {
          if (idSet.has(colorNode.id)) nextGraph = removeColorNode(nextGraph!, colorNode.id);
        }
        for (const id of ids) {
          if (current.layers.some((layer) => layer.id === id)) nextGraph = removeLayerFromGraph(nextGraph!, id);
        }
      }
      return { ...current, layers: nextLayers, graph: nextGraph };
    });
    if (selectedLayerIdRef.current && idSet.has(selectedLayerIdRef.current)) setSelectedLayerId(null);
  }, [updateDocument]);

  const updateLayer = useCallback((id: string, patch: Partial<Layer>) => {
    updateDocument((current) => ({
      ...current,
      layers: current.layers.map((layer) => (layer.id === id ? { ...layer, ...patch } : layer)),
    }));
  }, [updateDocument]);

  const updateMergeNode = useCallback((id: string, patch: Partial<GraphMergeNode>) => {
    updateDocument((current) => {
      if (!current.graph) return current;
      return {
        ...current,
        graph: {
          ...current.graph,
          mergeNodes: current.graph.mergeNodes.map((node) => (node.id === id ? { ...node, ...patch } : node)),
        },
      };
    });
  }, [updateDocument]);

  const updateColorNode = useCallback((id: string, patch: Partial<GraphColorNode>) => {
    updateDocument((current) => {
      if (!current.graph) return current;
      return { ...current, graph: updateColorNodeInGraph(current.graph, id, patch) };
    });
  }, [updateDocument]);

  const reorderLayers = useCallback((layers: Layer[]) => {
    updateDocument((current) => ({ ...current, layers }));
  }, [updateDocument]);

  const duplicateLayer = useCallback((id: string) => {
    const current = docRef.current;
    const layer = current.layers.find((item) => item.id === id);
    if (!layer) return;
    const duplicate = cloneLayerForDuplicate(layer);
    updateDocument((innerCurrent) => {
      const index = innerCurrent.layers.findIndex((item) => item.id === id);
      const nextLayers = [...innerCurrent.layers];
      nextLayers.splice(index + 1, 0, duplicate);
      if (!innerCurrent.graph) return { ...innerCurrent, layers: nextLayers };
      return {
        ...innerCurrent,
        layers: nextLayers,
        graph: addLayerToGraph(innerCurrent.graph, duplicate.id, nextDropPosition(innerCurrent.graph)),
      };
    });
    setSelectedLayerId(duplicate.id);
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

    if (action.kind === 'color') {
      const node = makeGraphColorNode();
      updateDocument((current) => {
        let graph = addColorNode(ensureGraph(current), node, position);
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
    pushHistorySnapshot();
    _setDoc(randomDocument());
    setSelectedLayerId(null);
  }, [pushHistorySnapshot]);

  const handleGraphChange = useCallback((graph: CanvasGraph) => {
    updateDocument((current) => ({ ...current, graph }));
  }, [updateDocument]);

  const handleExportConfigChange = useCallback((patch: Partial<CanvasDocument['export']>) => {
    updateDocument((current) => ({
      ...current,
      export: { ...current.export, ...patch },
    }));
  }, [updateDocument]);

  const handleCopyLink = useCallback(() => {
    const params = new URLSearchParams();
    params.set('doc', JSON.stringify(docRef.current));
    const url = `${window.location.origin}/app?${params.toString()}`;
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
    fromDocParam: fromDocParam.current,
  };
}

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { InsertConnectionConfig } from '../components/NodeCanvas';
import {
  type AspectRatio,
  type CanvasDocument,
  type CanvasGraph,
  type EffectPreset,
  type GraphColorNode,
  type GraphEnvironmentNode,
  type GraphGrimeShadowNode,
  type GraphMaskNode,
  type GraphMaterialNode,
  type GraphMergeNode,
  type GraphRepeatNode,
  type GraphScene3DNode,
  type GraphShaderNode,
  type GraphTransformNode,
  type ImageLayer,
  type Layer,
  type LayerKind,
  type ModelLayer,
} from '../types/config';
import type { AddAction } from '../utils/addActions';
import { type ArrayPresetId, makeArrayPresetLayer } from '../utils/arrayPresets';
import {
  hasPortableDocumentPayloads,
  preparePortableDocument,
  storePortableDocumentAssets,
  stripPortableDocumentAssets,
} from '../utils/documentAssets';
import {
  addEnvironmentMapToDocument,
  addLayerToDocument,
  addLooseLayerNodeToDocument,
  addNodeAtDocument,
  bootstrapDocumentGraph,
  createEffectPresetLayer,
  createImageLayerFromSource,
  createLayerOfKind,
  createModelLayerFromAsset,
  createTextPresetLayer,
  deleteNodesFromDocument,
  duplicateLayerInDocument,
  removeLayerFromDocument,
  reorderDocumentLayers,
  setDocumentAspect,
  setDocumentGraph,
  setDocumentSeed,
  updateColorNodeInDocument,
  updateDocumentExportConfig,
  updateEnvironmentNodeInDocument,
  updateGrimeShadowNodeInDocument,
  updateLayerInDocument,
  updateMaskNodeInDocument,
  updateMaterialNodeInDocument,
  updateMergeNodeInDocument,
  updateRepeatNodeInDocument,
  updateScene3DNodeInDocument,
  updateShaderNodeInDocument,
  updateTransformNodeInDocument,
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
  createBlankDocument,
  createDocumentShareUrl,
  getInitialDocument,
  isBlankDocument,
  normalizeDocument,
  removeDocParamFromUrl,
  saveDocumentToStorage,
  takePendingPreBlankDraft,
} from '../utils/documentPersistence';
import { makeNoisePresetLayer, type NoisePresetId } from '../utils/noisePresets';
import { saveStoredPreBlankDraft } from '../utils/projectStore';
import { randomDocument } from '../utils/randomConfig';
import { isSelectableScene3DTarget } from '../utils/scene3DInputs';
import type { TextPresetId } from '../utils/textPresets';

function isEditableUndoTarget(target: EventTarget | null) {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}

function isUndoShortcut(event: KeyboardEvent) {
  return (event.metaKey || event.ctrlKey) && event.key === 'z' && !isEditableUndoTarget(event.target);
}

export function useEditorDocument(nodeModeEnabled: boolean) {
  const [doc, _setDoc] = useState<CanvasDocument>(getInitialDocument());
  const [documentSaveStatus, setDocumentSaveStatus] = useState<{ ok: boolean; savedAt: string | null }>({
    ok: true,
    savedAt: null,
  });
  const [fromDocParam] = useState(
    () => typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('doc'),
  );
  const [fromBlankParam] = useState(() => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    return ['blank', '1'].includes(params.get('new') ?? '') || params.get('blank') === '1';
  });
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [past, setPast] = useState<HistoryEntry[]>([]);
  const [future, setFuture] = useState<HistoryEntry[]>([]);

  const safeSelectedLayerId =
    selectedLayerId &&
    (doc.layers.some((layer) => layer.id === selectedLayerId) || isSelectableScene3DTarget(doc, selectedLayerId))
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
    if (fromDocParam || fromBlankParam) {
      window.history.replaceState(null, '', removeDocParamFromUrl(window.location.href));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!fromBlankParam) return;
    const draft = takePendingPreBlankDraft();
    if (!draft) return;
    void saveStoredPreBlankDraft(draft.doc, new Date(draft.savedAt)).catch(() => {
      // Recovery drafts are best-effort. The active blank document must still open.
    });
  }, [fromBlankParam]);

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

  const applyHistoryNavigation = useCallback(
    (navigate: typeof undoHistory | typeof redoHistory) => {
      clearPendingHistory();
      const result = navigate({ past, future }, docRef.current);
      if (!result) return;
      setPast(result.past);
      setFuture(result.future);
      _setDoc(result.doc);
    },
    [clearPendingHistory, future, past],
  );

  const undo = useCallback(() => {
    applyHistoryNavigation(undoHistory);
  }, [applyHistoryNavigation]);

  const redo = useCallback(() => {
    applyHistoryNavigation(redoHistory);
  }, [applyHistoryNavigation]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!isUndoShortcut(event)) return;
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [redo, undo]);

  useEffect(() => {
    const ok = saveDocumentToStorage(doc);
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setDocumentSaveStatus({ ok, savedAt: ok ? new Date().toISOString() : null });
    });
    return () => {
      cancelled = true;
    };
  }, [doc]);

  useEffect(() => {
    if (!hasPortableDocumentPayloads(doc)) return;
    const sourceDoc = doc;
    let cancelled = false;
    void storePortableDocumentAssets(sourceDoc)
      .then((storedDoc) => {
        if (!cancelled && docRef.current === sourceDoc) commitDocument(storedDoc, 'silent');
      })
      .catch(() => {
        if (!cancelled && docRef.current === sourceDoc)
          commitDocument(stripPortableDocumentAssets(docRef.current), 'silent');
      });
    return () => {
      cancelled = true;
    };
  }, [commitDocument, doc]);

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

  const addTextPreset = useCallback(
    (preset: TextPresetId) => {
      const layer = createTextPresetLayer(preset);
      updateDocument((current) => addLayerToDocument(current, layer), 'snapshot');
      setSelectedLayerId(layer.id);
    },
    [updateDocument],
  );

  const addNoisePreset = useCallback(
    (preset: NoisePresetId) => {
      const layer = makeNoisePresetLayer(preset);
      updateDocument((current) => addLayerToDocument(current, layer), 'snapshot');
      setSelectedLayerId(layer.id);
    },
    [updateDocument],
  );

  const addArrayPreset = useCallback(
    (preset: ArrayPresetId) => {
      const layer = makeArrayPresetLayer(preset);
      updateDocument((current) => addLayerToDocument(current, layer), 'snapshot');
      setSelectedLayerId(layer.id);
    },
    [updateDocument],
  );

  const addImageFromSource = useCallback(
    (src: string, aiGeneration?: ImageLayer['aiGeneration'], nodePosition?: { x: number; y: number }) => {
      const layer = {
        ...createImageLayerFromSource(src),
        aiGeneration,
        ...(aiGeneration ? { aiGenerationHistory: [{ src, aiGeneration }], aiGenerationHistoryIndex: 0 } : {}),
      };
      updateDocument(
        (current) =>
          nodeModeEnabled
            ? addLooseLayerNodeToDocument(current, layer, nodePosition)
            : addLayerToDocument(current, layer),
        'snapshot',
      );
      setSelectedLayerId(layer.id);
    },
    [nodeModeEnabled, updateDocument],
  );

  const addModelFromAsset = useCallback(
    (
      asset: Pick<ModelLayer, 'modelSrc' | 'modelName' | 'modelMime' | 'modelBytes'>,
      nodePosition?: { x: number; y: number },
    ) => {
      const layer = createModelLayerFromAsset({
        src: asset.modelSrc,
        name: asset.modelName,
        mime: asset.modelMime,
        bytes: asset.modelBytes,
      });
      updateDocument(
        (current) =>
          nodeModeEnabled
            ? addLooseLayerNodeToDocument(current, layer, nodePosition)
            : addLayerToDocument(current, layer),
        'snapshot',
      );
      setSelectedLayerId(layer.id);
    },
    [nodeModeEnabled, updateDocument],
  );

  const addEnvironmentFromAsset = useCallback(
    (
      asset: Pick<GraphEnvironmentNode, 'environmentSrc' | 'environmentName' | 'environmentMime' | 'environmentBytes'>,
      nodePosition?: { x: number; y: number },
    ) => {
      updateDocument((current) => addEnvironmentMapToDocument(current, asset, nodePosition).doc, 'snapshot');
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

  const storeImageAssetSource = useCallback(
    (id: string, src: string, previousSrc: string) => {
      updateDocument((current) => {
        const layer = current.layers.find((item): item is ImageLayer => item.id === id && item.kind === 'image');
        const aiGenerationHistory = layer?.aiGenerationHistory?.map((variant) =>
          variant.src === previousSrc ? { ...variant, src } : variant,
        );
        return updateLayerInDocument(current, id, { src, aiGenerationHistory } as Partial<Layer>);
      }, 'silent');
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

  const updateRepeatNode = useCallback(
    (id: string, patch: Partial<GraphRepeatNode>) => {
      updateDocument((current) => updateRepeatNodeInDocument(current, id, patch), 'debounce');
    },
    [updateDocument],
  );

  const updateMaterialNode = useCallback(
    (id: string, patch: Partial<GraphMaterialNode>) => {
      updateDocument((current) => updateMaterialNodeInDocument(current, id, patch), 'debounce');
    },
    [updateDocument],
  );

  const updateMaskNode = useCallback(
    (id: string, patch: Partial<GraphMaskNode>) => {
      updateDocument((current) => updateMaskNodeInDocument(current, id, patch), 'debounce');
    },
    [updateDocument],
  );

  const updateTransformNode = useCallback(
    (id: string, patch: Partial<GraphTransformNode>) => {
      updateDocument((current) => updateTransformNodeInDocument(current, id, patch), 'debounce');
    },
    [updateDocument],
  );

  const updateGrimeShadowNode = useCallback(
    (id: string, patch: Partial<GraphGrimeShadowNode>) => {
      updateDocument((current) => updateGrimeShadowNodeInDocument(current, id, patch), 'debounce');
    },
    [updateDocument],
  );

  const updateScene3DNode = useCallback(
    (id: string, patch: Partial<GraphScene3DNode>) => {
      updateDocument((current) => updateScene3DNodeInDocument(current, id, patch), 'debounce');
    },
    [updateDocument],
  );

  const updateEnvironmentNode = useCallback(
    (id: string, patch: Partial<GraphEnvironmentNode>) => {
      updateDocument((current) => updateEnvironmentNodeInDocument(current, id, patch), 'debounce');
    },
    [updateDocument],
  );

  const updateShaderNode = useCallback(
    (id: string, patch: Partial<GraphShaderNode>) => {
      updateDocument((current) => updateShaderNodeInDocument(current, id, patch), 'debounce');
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
      let selectedLayerId: string | null = null;
      updateDocument((current) => {
        const result = addNodeAtDocument(current, action, position, insertion);
        selectedLayerId = result.selectedLayerId;
        return result.doc;
      }, 'snapshot');
      if (selectedLayerId) setSelectedLayerId(selectedLayerId);
    },
    [updateDocument],
  );

  const handleRandomize = useCallback(() => {
    commitDocument(randomDocument(), 'snapshot');
    setSelectedLayerId(null);
  }, [commitDocument]);

  const handleNewBlank = useCallback(() => {
    const current = docRef.current;
    if (!isBlankDocument(current)) {
      void storePortableDocumentAssets(current)
        .then((storedDoc) => saveStoredPreBlankDraft(storedDoc))
        .catch(() => {
          // Recovery drafts are best-effort. The blank action should not be blocked by storage failure.
        });
    }
    commitDocument(createBlankDocument({ aspect: current.global.aspect, seed: current.global.seed }), 'snapshot');
    setSelectedLayerId(null);
  }, [commitDocument]);

  const saveRecoveryDraft = useCallback(async () => {
    const current = docRef.current;
    if (isBlankDocument(current)) return;
    const storedDoc = await storePortableDocumentAssets(current);
    await saveStoredPreBlankDraft(storedDoc);
  }, []);

  const handleGraphChange = useCallback(
    (graph: CanvasGraph, mode: DocumentUpdateMode = 'debounce') => {
      updateDocument((current) => setDocumentGraph(current, graph), mode);
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
    void preparePortableDocument(docRef.current)
      .then((portableDoc) => createDocumentShareUrl(window.location.origin, portableDoc))
      .then((url) => {
        navigator.clipboard.writeText(url).catch(() => {
          prompt('Copy this link:', url);
        });
      })
      .catch(() => {
        const url = createDocumentShareUrl(window.location.origin, docRef.current);
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
    addTextPreset,
    addNoisePreset,
    addArrayPreset,
    addImageFromSource,
    addModelFromAsset,
    addEnvironmentFromAsset,
    removeLayer,
    deleteNodeSelection,
    updateLayer,
    storeImageAssetSource,
    updateMergeNode,
    updateColorNode,
    updateRepeatNode,
    updateMaterialNode,
    updateMaskNode,
    updateTransformNode,
    updateGrimeShadowNode,
    updateScene3DNode,
    updateEnvironmentNode,
    updateShaderNode,
    reorderLayers,
    duplicateLayer,
    handleAddLayerAt,
    handleRandomize,
    handleNewBlank,
    saveRecoveryDraft,
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
    fromBlankParam,
    isBlank: isBlankDocument(doc),
    documentSaveStatus,
  };
}

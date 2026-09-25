import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { InsertConnectionConfig } from '../components/node-canvas';
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
import { isImageDataUrl, saveImageAsset } from '../utils/assetStore';
import {
  hasPortableDocumentPayloads,
  preparePortableDocument,
  storePortableDocumentAssets,
} from '../utils/documentAssets';
import {
  addEnvironmentMapToDocument,
  addLayerToDocument,
  addLooseLayerNodeToDocument,
  addNodeAtDocument,
  bootstrapDocumentGraph,
  createAiImageLayer,
  createEffectPresetLayer,
  createImageLayerFromSource,
  createLayerOfKind,
  createModelLayerFromAsset,
  createTextPresetLayer,
  deleteNodesFromDocument,
  duplicateLayerInDocument,
  insertLayerAboveInDocument,
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
import type { DocumentUpdateMode } from '../utils/documentHistory';
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
import { ImageSourceWriteGate } from '../utils/imageSourceWriteGate';
import { makeNoisePresetLayer, type NoisePresetId } from '../utils/noisePresets';
import { saveStoredPreBlankDraft } from '../utils/projectStore';
import { randomDocument } from '../utils/randomConfig';
import { isSelectableScene3DTarget } from '../utils/scene3DInputs';
import { SharedDocumentSession } from '../utils/sharedDocumentSession';
import type { TextPresetId } from '../utils/textPresets';

type EditorLayerInsertAction =
  | { kind: 'layer'; layerKind: Exclude<LayerKind, 'effect'> }
  | { kind: 'textPreset'; preset: TextPresetId }
  | { kind: 'aiImage' }
  | { kind: 'noisePreset'; preset: NoisePresetId }
  | { kind: 'arrayPreset'; preset: ArrayPresetId }
  | { kind: 'effect'; preset: EffectPreset };

function isEditableUndoTarget(target: EventTarget | null) {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}

function isUndoShortcut(event: KeyboardEvent) {
  return (event.metaKey || event.ctrlKey) && event.key === 'z' && !isEditableUndoTarget(event.target);
}

const INSERT_LAYER_BUILDERS = {
  layer: (action: Extract<EditorLayerInsertAction, { kind: 'layer' }>) => createLayerOfKind(action.layerKind),
  textPreset: (action: Extract<EditorLayerInsertAction, { kind: 'textPreset' }>) =>
    createTextPresetLayer(action.preset),
  aiImage: () => createAiImageLayer(),
  noisePreset: (action: Extract<EditorLayerInsertAction, { kind: 'noisePreset' }>) =>
    makeNoisePresetLayer(action.preset),
  arrayPreset: (action: Extract<EditorLayerInsertAction, { kind: 'arrayPreset' }>) =>
    makeArrayPresetLayer(action.preset),
  effect: (action: Extract<EditorLayerInsertAction, { kind: 'effect' }>) => createEffectPresetLayer(action.preset),
} satisfies Record<string, (action: never) => Layer>;

function createLayerForInsertAction(action: EditorLayerInsertAction): Layer {
  return INSERT_LAYER_BUILDERS[action.kind](action as never);
}

export function useEditorDocument(nodeModeEnabled: boolean) {
  const [doc, _setDoc] = useState<CanvasDocument>(getInitialDocument());
  const [coreState, setCoreState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [coreError, setCoreError] = useState<string | null>(null);
  const [coreRetryRevision, setCoreRetryRevision] = useState(0);
  const [historyState, setHistoryState] = useState({
    canUndo: false,
    canRedo: false,
    undoCount: 0,
  });
  const [documentSaveStatus, setDocumentSaveStatus] = useState<{
    ok: boolean;
    savedAt: string | null;
  }>({
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

  const safeSelectedLayerId =
    selectedLayerId &&
    (doc.layers.some((layer) => layer.id === selectedLayerId) || isSelectableScene3DTarget(doc, selectedLayerId))
      ? selectedLayerId
      : null;

  const docRef = useRef(doc);
  const selectedLayerIdRef = useRef(selectedLayerId);
  const sessionRef = useRef<SharedDocumentSession | null>(null);
  const documentEpochRef = useRef(0);
  const wasNodeModeReadyRef = useRef(false);
  const pendingReplacementRef = useRef(0);
  const imageWriteGateRef = useRef<ImageSourceWriteGate | null>(null);
  imageWriteGateRef.current ??= new ImageSourceWriteGate(() => documentEpochRef.current);

  const refreshHistory = useCallback((session: SharedDocumentSession) => {
    setHistoryState({
      canUndo: session.canUndo,
      canRedo: session.canRedo,
      undoCount: session.undoCount,
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const prepare = async () => {
      const source = docRef.current;
      if (!hasPortableDocumentPayloads(source)) return source;
      try {
        return await storePortableDocumentAssets(source);
      } catch {
        return source;
      }
    };
    void prepare()
      .then((prepared) => {
        if (cancelled) return null;
        docRef.current = prepared;
        _setDoc(prepared);
        return SharedDocumentSession.open(
          prepared,
          (error, recovered) => {
            docRef.current = recovered;
            _setDoc(recovered);
            setCoreError(error.message);
            const active = sessionRef.current;
            if (active) refreshHistory(active);
          },
          () => {
            const active = sessionRef.current;
            if (active) refreshHistory(active);
          },
        );
      })
      .then((session) => {
        if (!session) return;
        if (cancelled) session.dispose();
        else {
          sessionRef.current = session;
          refreshHistory(session);
          setCoreState('ready');
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setCoreError(error instanceof Error ? error.message : 'The editor could not open this document.');
          setCoreState('error');
        }
      });
    return () => {
      cancelled = true;
      sessionRef.current?.dispose();
      sessionRef.current = null;
    };
  }, [coreRetryRevision, refreshHistory]);

  const retryCore = useCallback(() => {
    if (sessionRef.current) return;
    setCoreError(null);
    setCoreState('loading');
    setCoreRetryRevision((value) => value + 1);
  }, []);

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

  const commitDocument = useCallback(
    (newDoc: CanvasDocument, mode: DocumentUpdateMode) => {
      const session = sessionRef.current;
      if (!session) return;
      try {
        const accepted = session.apply(newDoc, mode);
        docRef.current = accepted;
        _setDoc(accepted);
        setCoreError(null);
        refreshHistory(session);
      } catch (error) {
        setCoreError(error instanceof Error ? error.message : 'The document edit could not be applied.');
      }
    },
    [refreshHistory],
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

  const replaceCurrentDocument = useCallback(
    (nextDoc: CanvasDocument) => {
      const session = sessionRef.current;
      if (!session) return null;
      try {
        const replacement = nodeModeEnabled && !nextDoc.graph ? bootstrapDocumentGraph(nextDoc) : nextDoc;
        const accepted = session.replace(replacement);
        documentEpochRef.current += 1;
        imageWriteGateRef.current?.clear();
        docRef.current = accepted;
        _setDoc(accepted);
        setSelectedLayerId(null);
        setCoreError(null);
        refreshHistory(session);
        return accepted;
      } catch (error) {
        setCoreError(error instanceof Error ? error.message : 'The document could not be opened.');
        return null;
      }
    },
    [nodeModeEnabled, refreshHistory],
  );

  const replaceDocument = useCallback(
    async (nextDoc: CanvasDocument): Promise<CanvasDocument | null> => {
      const replacement = ++pendingReplacementRef.current;
      const epoch = ++documentEpochRef.current;
      imageWriteGateRef.current?.clear();
      setCoreState('loading');
      try {
        const prepared = await storePortableDocumentAssets(normalizeDocument(nextDoc));
        if (pendingReplacementRef.current !== replacement || documentEpochRef.current !== epoch) return null;
        return replaceCurrentDocument(prepared);
      } catch (error) {
        if (pendingReplacementRef.current === replacement)
          setCoreError(error instanceof Error ? error.message : 'The document could not be prepared.');
        return null;
      } finally {
        if (pendingReplacementRef.current === replacement) setCoreState('ready');
      }
    },
    [replaceCurrentDocument],
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
    const session = sessionRef.current;
    if (!session) return;
    try {
      const previous = session.undo();
      if (!previous) return;
      documentEpochRef.current += 1;
      imageWriteGateRef.current?.clear();
      docRef.current = previous;
      _setDoc(previous);
      refreshHistory(session);
      setCoreError(null);
    } catch (error) {
      setCoreError(error instanceof Error ? error.message : 'Undo could not be applied.');
    }
  }, [refreshHistory]);

  const redo = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;
    try {
      const next = session.redo();
      if (!next) return;
      documentEpochRef.current += 1;
      imageWriteGateRef.current?.clear();
      docRef.current = next;
      _setDoc(next);
      refreshHistory(session);
      setCoreError(null);
    } catch (error) {
      setCoreError(error instanceof Error ? error.message : 'Redo could not be applied.');
    }
  }, [refreshHistory]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (coreState !== 'ready' || !isUndoShortcut(event)) return;
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [coreState, redo, undo]);

  useEffect(() => {
    if (coreState !== 'ready') return;
    const ok = saveDocumentToStorage(doc);
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled)
        setDocumentSaveStatus({
          ok,
          savedAt: ok ? new Date().toISOString() : null,
        });
    });
    return () => {
      cancelled = true;
    };
  }, [coreState, doc]);

  useEffect(() => {
    if (coreState !== 'ready') return;
    const enteredNodes = nodeModeEnabled && !wasNodeModeReadyRef.current;
    wasNodeModeReadyRef.current = nodeModeEnabled;
    if (enteredNodes && !docRef.current.graph) {
      commitDocument(bootstrapDocumentGraph(docRef.current), 'snapshot');
    }
  }, [commitDocument, coreState, nodeModeEnabled]);

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

  const insertLayerAbove = useCallback(
    (targetLayerId: string, action: EditorLayerInsertAction) => {
      const layer = createLayerForInsertAction(action);
      updateDocument((current) => insertLayerAboveInDocument(current, targetLayerId, layer), 'snapshot');
      setSelectedLayerId(layer.id);
    },
    [updateDocument],
  );

  const addImageFromSource = useCallback(
    async (src: string, aiGeneration?: ImageLayer['aiGeneration'], nodePosition?: { x: number; y: number }) => {
      const epoch = documentEpochRef.current;
      const storedSrc = isImageDataUrl(src) ? await saveImageAsset(src).catch(() => src) : src;
      if (documentEpochRef.current !== epoch) return;
      const layer = {
        ...createImageLayerFromSource(storedSrc),
        aiGeneration,
        ...(aiGeneration
          ? {
              aiGenerationHistory: [{ src: storedSrc, aiGeneration }],
              aiGenerationHistoryIndex: 0,
            }
          : {}),
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
      const imagePatch = patch as Partial<ImageLayer>;
      if (imagePatch.src && isImageDataUrl(imagePatch.src)) {
        const source = imagePatch.src;
        void imageWriteGateRef.current?.storeThenApply(id, source, saveImageAsset, (storedSrc) => {
          const aiGenerationHistory = imagePatch.aiGenerationHistory?.map((variant) =>
            variant.src === source ? { ...variant, src: storedSrc } : variant,
          );
          updateDocument(
            (current) =>
              updateLayerInDocument(current, id, {
                ...patch,
                src: storedSrc,
                ...(aiGenerationHistory ? { aiGenerationHistory } : {}),
              } as Partial<Layer>),
            'snapshot',
          );
        });
        return;
      }
      if ('src' in imagePatch) imageWriteGateRef.current?.invalidateLayer(id);
      updateDocument(
        (current) => updateLayerInDocument(current, id, patch),
        'src' in imagePatch ? 'snapshot' : 'debounce',
      );
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
    replaceCurrentDocument(randomDocument());
  }, [replaceCurrentDocument]);

  const handleNewBlank = useCallback(() => {
    const current = docRef.current;
    if (!isBlankDocument(current)) {
      void storePortableDocumentAssets(current)
        .then((storedDoc) => saveStoredPreBlankDraft(storedDoc))
        .catch(() => {
          // Recovery drafts are best-effort. The blank action should not be blocked by storage failure.
        });
    }
    return replaceCurrentDocument(
      createBlankDocument({
        aspect: current.global.aspect,
        seed: current.global.seed,
      }),
    );
  }, [replaceCurrentDocument]);

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
    insertLayerAbove,
    addImageFromSource,
    addModelFromAsset,
    addEnvironmentFromAsset,
    removeLayer,
    deleteNodeSelection,
    updateLayer,
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
    canUndo: coreState === 'ready' && historyState.canUndo,
    canRedo: coreState === 'ready' && historyState.canRedo,
    undoCount: historyState.undoCount,
    coreState,
    coreError,
    retryCore,
    fromDocParam,
    fromBlankParam,
    isBlank: isBlankDocument(doc),
    documentSaveStatus,
    documentEpochRef,
  };
}

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { InsertConnectionConfig } from '../components/node-canvas';
import {
  type AspectRatio,
  type CanvasDocument,
  type CanvasGraph,
  type EffectPreset,
  type ImageLayer,
  isObject3DLayer,
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
  createEffectPresetLayer,
  createImageLayerFromSource,
  createLayerOfKind,
  createModelLayerFromAsset,
  createTextPresetLayer,
  type SceneEnvironmentAsset,
} from '../utils/documentCommands';
import {
  type DocumentCommand,
  type DocumentCommandOutcome,
  type GraphEditKind,
  runDocumentCommand,
} from '../utils/documentDispatch';
import {
  createDocumentHistoryState,
  type DocumentHistoryEvent,
  type DocumentHistoryState,
  documentHistoryReducer,
  HISTORY_DEBOUNCE_MS,
} from '../utils/documentHistory';
import {
  createBlankDocument,
  createDocumentShareUrl,
  getInitialDocumentState,
  isBlankDocument,
  normalizeDocument,
  removeDocParamFromUrl,
  saveDocumentToStorage,
  takePendingPreBlankDraft,
} from '../utils/documentPersistence';
import type { LayerAddPlacement, TreeEditResult } from '../utils/graphTreeEdits';
import { graphUtilityNodeKind } from '../utils/nodeGraph';
import type { GraphNodePatch } from '../utils/nodeKinds';
import { makeNoisePresetLayer, type NoisePresetId } from '../utils/noisePresets';
import { saveStoredPreBlankDraft } from '../utils/projectStore';
import { randomDocument } from '../utils/randomConfig';
import type { DocumentSaveStatus } from '../utils/storageStatus';
import type { TextPresetId } from '../utils/textPresets';

function isEditableUndoTarget(target: EventTarget | null) {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}

function isUndoShortcut(event: KeyboardEvent) {
  return (event.metaKey || event.ctrlKey) && event.key === 'z' && !isEditableUndoTarget(event.target);
}

export function useEditorDocument(nodeModeEnabled: boolean) {
  const [initialDocumentState] = useState(getInitialDocumentState);
  const [history, setHistory] = useState<DocumentHistoryState>(() =>
    createDocumentHistoryState(initialDocumentState.doc),
  );
  const { doc, past, future } = history;
  // Changes when the whole document is replaced (load, starter, new blank), so per-document UI state can reset.
  const [documentSessionId, setDocumentSessionId] = useState(0);
  const [documentSaveStatus, setDocumentSaveStatus] = useState<DocumentSaveStatus>({ ok: true });
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
    (doc.layers.some((layer) => layer.id === selectedLayerId) ||
      Boolean(graphUtilityNodeKind(doc.graph, selectedLayerId)))
      ? selectedLayerId
      : null;

  // The history state is applied synchronously, so commands that run in the same tick see each other's results.
  const historyRef = useRef(history);
  const docRef = useRef(doc);
  const selectedLayerIdRef = useRef(selectedLayerId);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useLayoutEffect(() => {
    selectedLayerIdRef.current = safeSelectedLayerId;
  }, [safeSelectedLayerId]);

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

  const applyHistory = useCallback((event: DocumentHistoryEvent) => {
    const commit = (next: DocumentHistoryState) => {
      if (next === historyRef.current) return;
      historyRef.current = next;
      docRef.current = next.doc;
      setHistory(next);
      clearTimeout(settleTimerRef.current);
      if (!next.pending) return;
      settleTimerRef.current = setTimeout(
        () => commit(documentHistoryReducer(historyRef.current, { type: 'settle' })),
        HISTORY_DEBOUNCE_MS,
      );
    };
    commit(documentHistoryReducer(historyRef.current, event));
  }, []);

  useEffect(() => () => clearTimeout(settleTimerRef.current), []);

  /** Runs one document command and records history with the policy the command declares. */
  const dispatch = useCallback(
    (command: DocumentCommand): DocumentCommandOutcome => {
      const current = historyRef.current.doc;
      const outcome = runDocumentCommand(current, command);
      if (outcome.doc !== current) {
        applyHistory(
          outcome.mode === 'silent'
            ? { type: 'commit', doc: outcome.doc, mode: 'silent', amend: outcome.amend }
            : { type: 'commit', doc: outcome.doc, mode: outcome.mode },
        );
      }
      if (outcome.select) setSelectedLayerId(outcome.select);
      else if (outcome.removed && selectedLayerIdRef.current && outcome.removed.includes(selectedLayerIdRef.current)) {
        setSelectedLayerId(null);
      }
      return outcome;
    },
    [applyHistory],
  );

  const replaceDocument = useCallback(
    (nextDoc: CanvasDocument) => {
      const loadedDoc = normalizeDocument(nextDoc);
      dispatch({ type: 'replaceDocument', doc: loadedDoc });
      setSelectedLayerId(null);
      setDocumentSessionId((id) => id + 1);
      return loadedDoc;
    },
    [dispatch],
  );

  const setSeed = useCallback((seed: number) => dispatch({ type: 'setSeed', seed }), [dispatch]);
  const setAspect = useCallback((aspect: AspectRatio) => dispatch({ type: 'setAspect', aspect }), [dispatch]);

  const undo = useCallback(() => applyHistory({ type: 'undo' }), [applyHistory]);
  const redo = useCallback(() => applyHistory({ type: 'redo' }), [applyHistory]);

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
      // Keep the same status object while the outcome is unchanged, so autosave on every edit does not re-render
      // the editor a second time per edit.
      if (!cancelled) setDocumentSaveStatus((current) => (current.ok === ok ? current : { ok }));
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
        if (!cancelled) dispatch({ type: 'storeDocumentAssets', source: sourceDoc, stored: storedDoc });
      })
      .catch(() => {
        if (!cancelled) {
          dispatch({ type: 'storeDocumentAssets', source: sourceDoc, stored: stripPortableDocumentAssets(sourceDoc) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [dispatch, doc]);

  const addLayer = useCallback(
    (kind: Exclude<LayerKind, 'effect'>, placement?: LayerAddPlacement) =>
      dispatch({ type: 'addLayer', layer: createLayerOfKind(kind), placement }),
    [dispatch],
  );

  const addEffectPreset = useCallback(
    (preset: EffectPreset, placement?: LayerAddPlacement) =>
      dispatch({ type: 'addLayer', layer: createEffectPresetLayer(preset), placement }),
    [dispatch],
  );

  const addTextPreset = useCallback(
    (preset: TextPresetId, placement?: LayerAddPlacement) =>
      dispatch({ type: 'addLayer', layer: createTextPresetLayer(preset), placement }),
    [dispatch],
  );

  const addNoisePreset = useCallback(
    (preset: NoisePresetId, placement?: LayerAddPlacement) =>
      dispatch({ type: 'addLayer', layer: makeNoisePresetLayer(preset), placement }),
    [dispatch],
  );

  const addArrayPreset = useCallback(
    (preset: ArrayPresetId, placement?: LayerAddPlacement) =>
      dispatch({ type: 'addLayer', layer: makeArrayPresetLayer(preset), placement }),
    [dispatch],
  );

  const addImageFromSource = useCallback(
    (src: string, aiGeneration?: ImageLayer['aiGeneration'], nodePosition?: { x: number; y: number }) => {
      const layer = {
        ...createImageLayerFromSource(src),
        aiGeneration,
        ...(aiGeneration ? { aiGenerationHistory: [{ src, aiGeneration }], aiGenerationHistoryIndex: 0 } : {}),
      };
      dispatch({ type: 'addImportedLayer', layer, asNode: nodeModeEnabled, position: nodePosition });
    },
    [dispatch, nodeModeEnabled],
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
      dispatch({ type: 'addImportedLayer', layer, asNode: nodeModeEnabled, position: nodePosition });
    },
    [dispatch, nodeModeEnabled],
  );

  /** Gives the selected 3D Object a dropped environment map; returns an error message when nothing can take it. */
  const applyEnvironmentAsset = useCallback(
    (asset: SceneEnvironmentAsset): string | null => {
      const target = docRef.current.layers.find((layer) => layer.id === selectedLayerId);
      if (!isObject3DLayer(target)) return 'Select a 3D Object to use this environment map';
      dispatch({ type: 'setSceneEnvironment', id: target.id, asset });
      return null;
    },
    [dispatch, selectedLayerId],
  );

  const removeLayer = useCallback((id: string) => dispatch({ type: 'removeLayer', id }), [dispatch]);

  const deleteNodeSelection = useCallback(
    (ids: string[]) => {
      if (ids.length > 0) dispatch({ type: 'deleteNodes', ids });
    },
    [dispatch],
  );

  const updateLayer = useCallback(
    (id: string, patch: Partial<Layer>) => dispatch({ type: 'updateLayer', id, patch }),
    [dispatch],
  );

  const storeImageAssetSource = useCallback(
    (id: string, src: string, previousSrc: string) => dispatch({ type: 'storeImageAsset', id, src, previousSrc }),
    [dispatch],
  );

  const updateGraphNode = useCallback(
    (id: string, patch: GraphNodePatch) => dispatch({ type: 'updateGraphNode', id, patch }),
    [dispatch],
  );

  const reorderLayers = useCallback((layers: Layer[]) => dispatch({ type: 'reorderLayers', layers }), [dispatch]);

  const duplicateLayer = useCallback((id: string) => dispatch({ type: 'duplicateLayer', id }), [dispatch]);

  const handleAddLayerAt = useCallback(
    (action: AddAction, position: { x: number; y: number }, insertion?: InsertConnectionConfig) =>
      dispatch({ type: 'addNodeAt', action, position, insertion }),
    [dispatch],
  );

  /** Adds a graph-only node from Layers, above the selected tree row when `placement` names one. */
  const addNodeFromLayers = useCallback(
    (action: AddAction, position: { x: number; y: number }, placement?: LayerAddPlacement) =>
      placement
        ? dispatch({ type: 'addNodeAboveRow', action, anchorId: placement.aboveNodeId, position })
        : dispatch({ type: 'addNodeAt', action, position }),
    [dispatch],
  );

  /** Runs one Layers tree edit as one undo step. A blocked edit leaves the document as it is. */
  const applyTreeEdit = useCallback(
    (edit: (current: CanvasDocument) => TreeEditResult): TreeEditResult =>
      dispatch({ type: 'treeEdit', edit }).treeEdit!,
    [dispatch],
  );

  const handleRandomize = useCallback(() => {
    const nextDoc = randomDocument();
    dispatch({ type: 'replaceDocument', doc: nextDoc });
    setSelectedLayerId(null);
    return nextDoc;
  }, [dispatch]);

  const handleNewBlank = useCallback(() => {
    const current = docRef.current;
    if (!isBlankDocument(current)) {
      void storePortableDocumentAssets(current)
        .then((storedDoc) => saveStoredPreBlankDraft(storedDoc))
        .catch(() => {
          // Recovery drafts are best-effort. The blank action should not be blocked by storage failure.
        });
    }
    dispatch({
      type: 'replaceDocument',
      doc: createBlankDocument({ aspect: current.global.aspect, seed: current.global.seed }),
    });
    setSelectedLayerId(null);
    setDocumentSessionId((id) => id + 1);
  }, [dispatch]);

  const saveRecoveryDraft = useCallback(async () => {
    const current = docRef.current;
    if (isBlankDocument(current)) return;
    const storedDoc = await storePortableDocumentAssets(current);
    await saveStoredPreBlankDraft(storedDoc);
  }, []);

  const handleGraphEdit = useCallback(
    (graph: CanvasGraph, edit: GraphEditKind) => dispatch({ type: 'editGraph', graph, edit }),
    [dispatch],
  );

  const handleExportConfigChange = useCallback(
    (patch: Partial<CanvasDocument['export']>) => dispatch({ type: 'updateExportConfig', patch }),
    [dispatch],
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
    applyEnvironmentAsset,
    removeLayer,
    deleteNodeSelection,
    updateLayer,
    storeImageAssetSource,
    updateGraphNode,
    reorderLayers,
    duplicateLayer,
    handleAddLayerAt,
    addNodeFromLayers,
    applyTreeEdit,
    handleRandomize,
    handleNewBlank,
    saveRecoveryDraft,
    handleGraphEdit,
    handleExportConfigChange,
    handleCopyLink,
    loadDocument: replaceDocument,
    documentSessionId,
    dispatch,
    setSeed,
    setAspect,
    undo,
    redo,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    undoCount: past.length,
    fromDocParam,
    documentLinkStatus: initialDocumentState.linkStatus,
    fromBlankParam,
    isBlank: isBlankDocument(doc),
    documentSaveStatus,
  };
}

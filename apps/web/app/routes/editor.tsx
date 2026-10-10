import './styles/editor.css';
import { IconButton } from '@artifact/ui';
import { AnimatePresence } from 'framer-motion';
import { lazy, type RefObject, Suspense, useCallback, useRef, useState } from 'react';
import { Link } from 'react-router';
import { BottomBar } from '../components/BottomBar';
import { CanvasPreview } from '../components/CanvasPreview';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { EditorConfirmDialog } from '../components/editor-workflow/EditorConfirmDialog';
import { EditorExportStatus } from '../components/editor-workflow/EditorExportStatus';
import { EditorWorkflowNotice } from '../components/editor-workflow/EditorWorkflowNotice';
import { useEditorConfirm } from '../components/editor-workflow/useEditorConfirm';
import type { NodeCanvasViewport } from '../components/node-canvas';
import { ProjectsPanel } from '../components/ProjectsPanel';
import { Sidebar } from '../components/Sidebar';
import { SiteNav } from '../components/SiteNav';
import { StorageWarningStrip } from '../components/StorageWorkspaceStatus';
import { getProjectWorkspaceStatus } from '../components/StorageWorkspaceStatusModel';
import { useBrowserStorageStatus } from '../hooks/useBrowserStorageStatus';
import {
  isArtifactDocumentFile,
  type PendingDocumentImport,
  useDocumentFileTransfer,
} from '../hooks/useDocumentFileTransfer';
import { useEditorAssets } from '../hooks/useEditorAssets';
import { useEditorDocument } from '../hooks/useEditorDocument';
import { useEditorExport } from '../hooks/useEditorExport';
import { useEditorProjectsController } from '../hooks/useEditorProjectsController';
import { type AspectRatio, type CanvasDocument, cloneDocument, getPreviewDims } from '../types/config';
import { ARTIFACT_PROJECT_PACKAGE_MIME } from '../utils/documentPackage';
import { ARTIFACT_FILE_MIME } from '../utils/documentPersistence';
import { environmentUriFromId, isSupportedEnvironmentFile, saveEnvironmentFileAsset } from '../utils/envAssetStore';
import { isSupportedModelFile, modelUriFromId, saveModelFileAsset } from '../utils/modelAssetStore';
import type { SavedProject } from '../utils/projectLibrary';
import { getStarterDocument } from '../utils/starterDocuments';
import { EmptyCanvasStart } from './editor/EmptyCanvasStart';
import { useEditorPanels } from './editor/useEditorPanels';
import { useEditorPrimitiveExportState } from './editor/useEditorPrimitiveExportState';
import { useReplaceableWork } from './editor/useReplaceableWork';
import { type ViewMode, ViewModeToggle } from './editor/ViewModeToggle';

const NodeCanvas = lazy(() => import('../components/node-canvas').then((module) => ({ default: module.NodeCanvas })));
const MAX_ENVIRONMENT_BYTES = 80 * 1024 * 1024;
const MAX_MODEL_BYTES = 50 * 1024 * 1024;

type DropPreviewKind = 'document' | 'file' | 'image';

function inferDropPreviewKind(dataTransfer: DataTransfer): DropPreviewKind {
  const items = Array.from(dataTransfer.items ?? []);
  if (items.some((item) => item.kind === 'file' && item.type.startsWith('image/'))) return 'image';
  if (
    items.some(
      (item) =>
        item.kind === 'file' &&
        [ARTIFACT_FILE_MIME, ARTIFACT_PROJECT_PACKAGE_MIME, 'application/json'].includes(item.type),
    )
  ) {
    return 'document';
  }
  return 'file';
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function importKindLabel(kind: PendingDocumentImport['fileKind']) {
  return kind === 'project-package' ? 'PROJECT PACKAGE' : 'ARTIFACT DOCUMENT';
}

const IMPORT_FILE_TYPES = [
  { icon: 'IMG', label: 'Images', detail: 'PNG, JPG, GIF, WebP' },
  { icon: 'DOC', label: 'Artifact', detail: '.artifact.json' },
  { icon: 'PKG', label: 'Package', detail: '.artifact with assets' },
];

function CanvasErrorFallback({ aspect }: { aspect: AspectRatio }) {
  const [previewWidth, previewHeight] = getPreviewDims(aspect);
  return (
    <div className="canvas-wrapper flex-1 flex items-center justify-center min-h-0 w-full">
      <div
        className="canvas-area relative h-full max-h-[min(100%,540px)] max-w-full flex flex-col items-center justify-center gap-2"
        style={{
          aspectRatio: `${previewWidth} / ${previewHeight}`,
          background: 'var(--surface-panel)',
          border: '1px solid var(--line-default)',
          color: 'var(--text-secondary)',
          fontFamily: 'var(--font-mono)',
          fontSize: '11px',
        }}
      >
        <span>Canvas error: could not render layers.</span>
        <span style={{ opacity: 0.5 }}>
          {previewWidth} × {previewHeight}
        </span>
      </div>
    </div>
  );
}

function EditorChromeSlot({
  onViewModeChange,
  viewMode,
}: {
  onViewModeChange: (mode: ViewMode) => void;
  viewMode: ViewMode;
}) {
  return (
    <div className="editor-chrome-slot">
      <ViewModeToggle value={viewMode} onChange={onViewModeChange} variant="chrome" />
    </div>
  );
}

// Renamed legacy editor shell; v0.32 tracks controller extraction.
// fallow-ignore-next-line complexity
export default function Editor() {
  const [dropPreview, setDropPreview] = useState<DropPreviewKind | null>(null);
  const [documentImportBusy, setDocumentImportBusy] = useState(false);
  const [recoveryCopyFailed, setRecoveryCopyFailed] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('layers');
  const [docsBannerDismissed, setDocsBannerDismissed] = useState(false);
  const [environmentFileError, setEnvironmentFileError] = useState<string | null>(null);
  const [modelFileError, setModelFileError] = useState<string | null>(null);
  const [aiPanelRequested, setAiPanelRequested] = useState(false);
  const imageFileInputRef = useRef<HTMLInputElement>(null);

  // fallow-ignore-next-line code-duplication
  const {
    doc,
    docRef,
    selectedLayerId,
    // fallow-ignore-next-line code-duplication
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
    addNodeFromLayers,
    applyTreeEdit,
    handleRandomize,
    handleNewBlank,
    saveRecoveryDraft,
    handleGraphChange,
    handleExportConfigChange,
    handleCopyLink,
    loadDocument,
    documentSessionId,
    setDoc,
    setAspect,
    undo,
    redo,
    canUndo,
    canRedo,
    fromDocParam,
    fromBlankParam,
    isBlank,
    documentSaveStatus,
  } = useEditorDocument(viewMode === 'nodes');
  const { confirm, confirmDialog } = useEditorConfirm();
  const { hasReplaceableWork, setBaseline } = useReplaceableWork(doc, docRef);
  const replaceDocument = useCallback(
    (nextDoc: CanvasDocument) => {
      setBaseline(loadDocument(nextDoc));
    },
    [loadDocument, setBaseline],
  );
  // The Nodes viewport the user left, per document (UI state, not saved): the first entry fits the graph instead.
  const [nodeViewport, setNodeViewport] = useState<{ sessionId: number; viewport: NodeCanvasViewport } | null>(null);
  const handleNodeViewportChange = useCallback(
    (viewport: NodeCanvasViewport) => setNodeViewport({ sessionId: documentSessionId, viewport }),
    [documentSessionId],
  );
  const { imageCache, dropError, handleDroppedFile } = useEditorAssets(
    doc,
    (src, position) => addImageFromSource(src, undefined, position),
    addModelFromAsset,
    addEnvironmentFromAsset,
    storeImageAssetSource,
  );
  const handleDroppedFiles = useCallback(
    (files: File[], position?: { x: number; y: number }) => {
      files.forEach((file, index) => {
        const offsetPosition = position
          ? {
              x: position.x + (index % 4) * 44,
              y: position.y + Math.floor(index / 4) * 44,
            }
          : undefined;
        void handleDroppedFile(file, offsetPosition);
      });
    },
    [handleDroppedFile],
  );

  const handleReplaceEnvironmentNodeFile = useCallback(
    async (id: string, file: File) => {
      setEnvironmentFileError(null);
      if (!isSupportedEnvironmentFile(file)) {
        setEnvironmentFileError('Use an EXR or HDR environment map.');
        return;
      }
      if (file.size > MAX_ENVIRONMENT_BYTES) {
        setEnvironmentFileError(`Environment too large — max ${MAX_ENVIRONMENT_BYTES / 1024 / 1024}MB`);
        return;
      }
      try {
        const asset = await saveEnvironmentFileAsset(file);
        updateEnvironmentNode(id, {
          environmentSrc: environmentUriFromId(asset.id),
          environmentName: asset.label,
          environmentMime: asset.mime,
          environmentBytes: asset.bytes,
        });
      } catch {
        setEnvironmentFileError('Could not read environment map.');
      }
    },
    [updateEnvironmentNode],
  );
  const handleReplaceModelLayerFile = useCallback(
    async (id: string, file: File) => {
      setModelFileError(null);
      if (!isSupportedModelFile(file)) {
        setModelFileError('Use a GLB model.');
        return;
      }
      if (file.size > MAX_MODEL_BYTES) {
        setModelFileError(`Model too large — max ${MAX_MODEL_BYTES / 1024 / 1024}MB`);
        return;
      }
      try {
        const asset = await saveModelFileAsset(file);
        updateLayer(id, {
          modelSrc: modelUriFromId(asset.id),
          modelName: asset.label,
          modelMime: asset.mime,
          modelBytes: asset.bytes,
        });
      } catch {
        setModelFileError('Could not read model.');
      }
    },
    [updateLayer],
  );
  const {
    effectivePrimitiveViewStates,
    exportRenderOptions,
    handlePrimitiveViewStatesChange,
    resetPrimitiveViewStates,
  } = useEditorPrimitiveExportState({
    doc,
    docRef,
    onGraphChange: handleGraphChange,
  });
  const { exportBusy, exportFeedback, dismissExportFeedback, handleNodeExport } = useEditorExport(
    docRef,
    imageCache,
    exportRenderOptions,
  );
  const {
    showProjects,
    projects,
    activeProject,
    recoveryDraft,
    storageError,
    projectSyncStates,
    maxProjects,
    toggleProjects,
    closeProjects,
    handleLoadProject,
    clearActiveProject,
    saveCurrentProject,
    saveActiveProject,
    deleteProject,
    saveProjectToCloud,
    deleteRecoveryDraft,
    projectSaveState,
  } = useEditorProjectsController({
    doc,
    docRef,
    imageCache,
    onLoadDocument: replaceDocument,
    initialDocumentClearsProject: fromDocParam || fromBlankParam,
  });
  const handleLoadExternalDocument = useCallback(
    (nextDoc: typeof doc) => {
      clearActiveProject();
      setAiPanelRequested(false);
      replaceDocument(nextDoc);
    },
    [clearActiveProject, replaceDocument],
  );
  const {
    fileInputRef,
    documentPickerReturnFocusRef,
    documentFileError,
    pendingDocumentImport,
    handleCancelDocumentImport,
    handleConfirmDocumentImport,
    handleOpenDocumentPicker,
    handleSaveDocument,
    handleSaveProjectPackage,
    handleStageDocumentImport,
  } = useDocumentFileTransfer(docRef, handleLoadExternalDocument, confirm);

  const handleNodeFileDragPreviewChange = useCallback((dataTransfer: DataTransfer | null) => {
    setDropPreview(dataTransfer ? inferDropPreviewKind(dataTransfer) : null);
  }, []);
  const handleNodeDroppedFiles = useCallback(
    (files: File[], position: { x: number; y: number }) => {
      const documentFile = files.find(isArtifactDocumentFile);
      if (documentFile) void handleStageDocumentImport(documentFile);
      const assetFiles = files.filter((file) => !isArtifactDocumentFile(file));
      if (assetFiles.length > 0) handleDroppedFiles(assetFiles, position);
    },
    [handleDroppedFiles, handleStageDocumentImport],
  );

  const { handleToggleProjects, closePanels } = useEditorPanels({
    closeProjects,
    toggleProjects,
  });
  const storageStatus = useBrowserStorageStatus({
    doc,
    projects,
    recoveryDraft,
    saveStatus: documentSaveStatus,
    projectSaveState,
  });
  const projectWorkspaceStatus = getProjectWorkspaceStatus(storageStatus, storageError);

  const handleEditInNodes = useCallback(
    (nodeId: string) => {
      setSelectedLayerId(nodeId);
      setViewMode('nodes');
    },
    [setSelectedLayerId],
  );

  const handleStartAiImage = useCallback(() => {
    setViewMode('layers');
    setAiPanelRequested(true);
    window.setTimeout(() => {
      document.querySelector<HTMLTextAreaElement>('[data-ai-generation-prompt]')?.focus();
    }, 0);
  }, []);

  const handleNewBlankRequest = useCallback(async () => {
    if (
      !isBlank &&
      !(await confirm({
        title: 'Create a new project?',
        description: 'Current work is kept as a recovery copy in Projects before the canvas is cleared.',
        confirmLabel: 'Create new project',
      }))
    ) {
      return;
    }
    closePanels();
    clearActiveProject();
    setAiPanelRequested(false);
    setBaseline(null);
    handleNewBlank();
    resetPrimitiveViewStates();
    setViewMode('layers');
  }, [clearActiveProject, closePanels, confirm, handleNewBlank, isBlank, resetPrimitiveViewStates, setBaseline]);

  /** Work is at risk when it changed since it was put in place and the active project does not hold it. */
  const hasUnsavedWork = useCallback(
    () => projectSaveState !== 'saved' && hasReplaceableWork(),
    [hasReplaceableWork, projectSaveState],
  );

  const handleRandomizeRequest = useCallback(async () => {
    if (
      hasUnsavedWork() &&
      !(await confirm({
        title: 'Replace with a random cover?',
        description: 'Your changes on the canvas are replaced by a new random document. Undo brings them back.',
        confirmLabel: 'Randomize',
      }))
    ) {
      return;
    }
    setBaseline(handleRandomize());
  }, [confirm, handleRandomize, hasUnsavedWork, setBaseline]);

  const handleLoadProjectRequest = useCallback(
    async (project: SavedProject) => {
      if (
        hasUnsavedWork() &&
        !(await confirm({
          title: `Open ${project.name}?`,
          description: 'Unsaved changes on the canvas will be replaced. Save them as a project first to keep them.',
          confirmLabel: 'Open project',
          tone: 'danger',
        }))
      ) {
        return;
      }
      handleLoadProject(project);
    },
    [confirm, handleLoadProject, hasUnsavedWork],
  );

  const handleLoadStarter = useCallback(
    (id: string) => {
      const starter = getStarterDocument(id);
      if (!starter) return;
      closePanels();
      clearActiveProject();
      setAiPanelRequested(false);
      replaceDocument(cloneDocument(starter.doc));
      resetPrimitiveViewStates();
      setViewMode('layers');
    },
    [clearActiveProject, closePanels, replaceDocument, resetPrimitiveViewStates],
  );

  const finishDroppedDocumentImport = useCallback(() => {
    closePanels();
    handleConfirmDocumentImport();
    resetPrimitiveViewStates();
    setViewMode('layers');
  }, [closePanels, handleConfirmDocumentImport, resetPrimitiveViewStates]);

  const handleConfirmDroppedDocument = useCallback(async () => {
    if (!pendingDocumentImport || documentImportBusy) return;
    if (recoveryCopyFailed) {
      setRecoveryCopyFailed(false);
      finishDroppedDocumentImport();
      return;
    }
    setDocumentImportBusy(true);
    try {
      await saveRecoveryDraft();
      finishDroppedDocumentImport();
    } catch {
      // The person decides in the dialog whether to open the file without a recovery copy.
      setRecoveryCopyFailed(true);
    } finally {
      setDocumentImportBusy(false);
    }
  }, [documentImportBusy, finishDroppedDocumentImport, pendingDocumentImport, recoveryCopyFailed, saveRecoveryDraft]);

  const handleCancelDroppedDocument = useCallback(() => {
    setRecoveryCopyFailed(false);
    handleCancelDocumentImport();
  }, [handleCancelDocumentImport]);

  const handleGeneratedImageSource = useCallback(
    (...args: Parameters<typeof addImageFromSource>) => {
      setAiPanelRequested(true);
      addImageFromSource(...args);
    },
    [addImageFromSource],
  );

  const selectedLayer = doc.layers.find((layer) => layer.id === selectedLayerId) ?? null;
  const selectedLayerHasAiGeneration =
    selectedLayer?.kind === 'image' && Boolean(selectedLayer.aiGeneration || selectedLayer.aiGenerationHistory?.length);
  const showAiGeneration = aiPanelRequested || selectedLayerHasAiGeneration;

  const bottomBarProps = {
    onNewBlank: handleNewBlankRequest,
    onRandomize: handleRandomizeRequest,
    onUndo: undo,
    onRedo: redo,
    canUndo,
    canRedo,
    onProjectsToggle: handleToggleProjects,
    onCopyLink: handleCopyLink,
    onOpenDocument: handleOpenDocumentPicker,
    onSaveDocument: handleSaveDocument,
    onSaveProjectPackage: handleSaveProjectPackage,
    onExport: handleNodeExport,
    exportBusy,
    projectWorkspaceStatus,
  };

  return (
    <div className={`editor-layout editor-layout-${viewMode} flex flex-col w-full h-full`}>
      <SiteNav
        ariaLabel="Editor navigation"
        solid
        compact
        compactSlot={<EditorChromeSlot viewMode={viewMode} onViewModeChange={setViewMode} />}
      />
      <input
        ref={fileInputRef}
        className="sr-only"
        type="file"
        accept=".artifact,.artifact.json,application/json,application/vnd.artifact.project+json"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          void handleStageDocumentImport(file);
          event.currentTarget.value = '';
        }}
      />
      <input
        ref={imageFileInputRef}
        className="sr-only"
        type="file"
        accept="image/*"
        multiple
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? []);
          if (files.length > 0) handleDroppedFiles(files);
          event.currentTarget.value = '';
        }}
      />
      {fromDocParam && !docsBannerDismissed && (
        <EditorWorkflowNotice
          className="editor-workflow-notice--docs"
          action={
            <IconButton
              label="Dismiss loaded document notice"
              icon={<span aria-hidden="true">×</span>}
              onClick={() => setDocsBannerDismissed(true)}
            />
          }
        >
          <span>
            Loaded from <Link to="/docs/nodes">docs</Link> — customize or randomize to make it yours.
          </span>
        </EditorWorkflowNotice>
      )}
      <div className={`app app-${viewMode}`}>
        <main
          className={`main main-${viewMode}`}
          onDragEnter={(event) => {
            if (Array.from(event.dataTransfer.types).includes('Files')) {
              setDropPreview(inferDropPreviewKind(event.dataTransfer));
            }
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setDropPreview(inferDropPreviewKind(event.dataTransfer));
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropPreview(null);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDropPreview(null);
            const files = Array.from(event.dataTransfer.files);
            const documentFile = files.find(isArtifactDocumentFile);
            if (documentFile) void handleStageDocumentImport(documentFile);
            const assetFiles = files.filter((file) => !isArtifactDocumentFile(file));
            if (assetFiles.length > 0) handleDroppedFiles(assetFiles);
          }}
        >
          <h1 className="sr-only">Artifact Cover Editor</h1>
          <StorageWarningStrip status={storageStatus} storageError={storageError} />

          {viewMode === 'layers' ? (
            <ErrorBoundary fallback={<CanvasErrorFallback aspect={doc.global.aspect ?? '1:1'} />}>
              <CanvasPreview
                doc={doc}
                imageCache={imageCache}
                selectedLayerId={selectedLayerId}
                primitiveViewStates={effectivePrimitiveViewStates}
                dropPreview={dropPreview}
                onLayerUpdate={updateLayer}
                onSelectLayer={setSelectedLayerId}
              />
              {doc.layers.length === 0 && (
                <EmptyCanvasStart
                  onImportImage={() => imageFileInputRef.current?.click()}
                  onStartAiImage={handleStartAiImage}
                  onAddText={() => addLayer('text')}
                  onAddNoise={() => addLayer('noise')}
                  onLoadStarter={handleLoadStarter}
                />
              )}
            </ErrorBoundary>
          ) : (
            <div className="node-mode-stage">
              <Suspense fallback={<div style={{ flex: 1, background: 'var(--surface-app)' }} />}>
                <NodeCanvas
                  key={documentSessionId}
                  doc={doc}
                  initialViewport={nodeViewport?.sessionId === documentSessionId ? nodeViewport.viewport : null}
                  onViewportChange={handleNodeViewportChange}
                  imageCache={imageCache}
                  initialPrimitiveViewStates={effectivePrimitiveViewStates}
                  onPrimitiveViewStatesChange={handlePrimitiveViewStatesChange}
                  selectedLayerId={selectedLayerId}
                  onSelectLayer={setSelectedLayerId}
                  onGraphChange={handleGraphChange}
                  onUpdateLayer={updateLayer}
                  onUpdateMergeNode={updateMergeNode}
                  onUpdateColorNode={updateColorNode}
                  onUpdateRepeatNode={updateRepeatNode}
                  onUpdateMaterialNode={updateMaterialNode}
                  onUpdateMaskNode={updateMaskNode}
                  onUpdateTransformNode={updateTransformNode}
                  onUpdateGrimeShadowNode={updateGrimeShadowNode}
                  onUpdateScene3DNode={updateScene3DNode}
                  onUpdateEnvironmentNode={updateEnvironmentNode}
                  onUpdateShaderNode={updateShaderNode}
                  onReplaceModelLayerFile={handleReplaceModelLayerFile}
                  onReplaceEnvironmentNodeFile={handleReplaceEnvironmentNodeFile}
                  onUpdateExportConfig={handleExportConfigChange}
                  onUpdateAspectRatio={setAspect}
                  exportBusy={exportBusy}
                  onExport={handleNodeExport}
                  onAddLayerAt={handleAddLayerAt}
                  onImageFileDrop={(file, position) => void handleDroppedFile(file, position)}
                  onFilesDrop={handleNodeDroppedFiles}
                  onFileDragPreviewChange={handleNodeFileDragPreviewChange}
                  onDeleteNodes={deleteNodeSelection}
                  onDuplicateLayer={duplicateLayer}
                />
              </Suspense>
            </div>
          )}
          {viewMode === 'nodes' && <EditorDropPreview dropPreview={dropPreview} />}

          <DocumentImportConfirm
            pendingImport={pendingDocumentImport}
            busy={documentImportBusy}
            recoveryCopyFailed={recoveryCopyFailed}
            returnFocusRef={documentPickerReturnFocusRef}
            onCancel={handleCancelDroppedDocument}
            onConfirm={() => {
              void handleConfirmDroppedDocument();
            }}
          />
          {confirmDialog}

          {(dropError || documentFileError || modelFileError || environmentFileError) && (
            <EditorWorkflowNotice className="editor-workflow-notice--error" variant="danger">
              {dropError ?? documentFileError ?? modelFileError ?? environmentFileError}
            </EditorWorkflowNotice>
          )}
          <EditorExportStatus feedback={exportFeedback} onRetry={handleNodeExport} onDismiss={dismissExportFeedback} />
        </main>

        <BottomBar {...bottomBarProps} />

        {viewMode === 'layers' && (
          <Sidebar
            doc={doc}
            onDocChange={setDoc}
            selectedLayerId={selectedLayerId}
            onSelectLayer={setSelectedLayerId}
            onAddLayer={addLayer}
            onAddEffectPreset={addEffectPreset}
            onAddTextPreset={addTextPreset}
            onAddNoisePreset={addNoisePreset}
            onAddArrayPreset={addArrayPreset}
            onAddScene3D={(placement) => addNodeFromLayers({ kind: 'scene3d' }, { x: 360, y: 180 }, placement)}
            onStartAiImage={handleStartAiImage}
            onRemoveLayer={removeLayer}
            onReorderLayers={reorderLayers}
            onDuplicateLayer={duplicateLayer}
            onApplyTreeEdit={applyTreeEdit}
            onEditInNodes={handleEditInNodes}
            showAiGeneration={showAiGeneration}
            onGeneratedImageSource={handleGeneratedImageSource}
            mobileActionBar={<BottomBar {...bottomBarProps} />}
            onReplaceModelLayerFile={handleReplaceModelLayerFile}
            onReplaceEnvironmentNodeFile={handleReplaceEnvironmentNodeFile}
          />
        )}

        <AnimatePresence>
          {showProjects && (
            <ProjectsPanel
              projects={projects}
              activeProject={activeProject}
              recoveryDraft={recoveryDraft}
              storageStatus={storageStatus}
              storageError={storageError}
              projectSyncStates={projectSyncStates}
              maxProjects={maxProjects}
              onSaveCopy={saveCurrentProject}
              onSaveActive={saveActiveProject}
              onLoad={handleLoadProjectRequest}
              onDelete={deleteProject}
              onSaveToCloud={saveProjectToCloud}
              onDeleteRecoveryDraft={deleteRecoveryDraft}
              onNewBlank={handleNewBlankRequest}
              onClose={closeProjects}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function EditorDropPreview({ dropPreview }: { dropPreview: DropPreviewKind | null }) {
  if (!dropPreview) return null;
  const copy = {
    document: ['Drop artifact file', 'We will inspect it before opening.'],
    file: ['Drop file', 'Images import as layers. Artifact files ask first.'],
    image: ['Drop image', 'Adds a new image layer.'],
  }[dropPreview];
  return (
    <div className="editor-drop-preview" aria-hidden="true">
      <div className="editor-drop-preview__panel">
        <div className="editor-drop-preview__header">
          <span>Import files</span>
        </div>
        <ImportFileTypeRail />
        <div className="editor-drop-preview__zone">
          <span className="editor-drop-preview__mark">⇧</span>
          <strong>{copy[0]}</strong>
          <small>{copy[1]}</small>
        </div>
      </div>
    </div>
  );
}

function ImportFileTypeRail() {
  return (
    <div className="import-file-types" aria-hidden="true">
      {IMPORT_FILE_TYPES.map((type) => (
        <div className="import-file-type" key={type.label}>
          <span className="import-file-type__icon">{type.icon}</span>
          <span>
            <strong>{type.label}</strong>
            <small>{type.detail}</small>
          </span>
        </div>
      ))}
    </div>
  );
}

function DocumentImportConfirm({
  busy,
  onCancel,
  onConfirm,
  pendingImport,
  recoveryCopyFailed,
  returnFocusRef,
}: {
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  pendingImport: PendingDocumentImport | null;
  recoveryCopyFailed: boolean;
  returnFocusRef: RefObject<HTMLElement | null>;
}) {
  if (!pendingImport) return null;

  return (
    <EditorConfirmDialog
      open
      busy={busy}
      returnFocusRef={returnFocusRef}
      className="document-import-confirm"
      title="Open artifact file?"
      description={
        recoveryCopyFailed
          ? 'Could not save a recovery copy of the current work. Open the file anyway and replace the canvas?'
          : 'Current work will be saved as a recovery copy before this file replaces the canvas.'
      }
      tone={recoveryCopyFailed ? 'danger' : 'default'}
      confirmLabel={recoveryCopyFailed ? 'Open anyway' : 'Open file'}
      onCancel={onCancel}
      onConfirm={onConfirm}
    >
      <ImportFileTypeRail />
      <div className="document-import-confirm__zone">
        <span className="document-import-confirm__zone-mark">⇧</span>
        <span className="document-import-confirm__eyebrow">{importKindLabel(pendingImport.fileKind)}</span>
        <div className="document-import-confirm__file" aria-label="Artifact file">
          <span className="document-import-confirm__file-name">{pendingImport.fileName}</span>
          <span>{formatFileSize(pendingImport.fileSize)}</span>
        </div>
        <dl className="document-import-confirm__meta" aria-label="Dropped document summary">
          <div>
            <dt>Aspect</dt>
            <dd>{pendingImport.aspect}</dd>
          </div>
          <div>
            <dt>Layers</dt>
            <dd>{pendingImport.layerCount}</dd>
          </div>
          <div>
            <dt>Graph</dt>
            <dd>{pendingImport.hasGraph ? 'YES' : 'NO'}</dd>
          </div>
        </dl>
      </div>
    </EditorConfirmDialog>
  );
}

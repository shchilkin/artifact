import { AnimatePresence } from 'framer-motion';
import { type CSSProperties, lazy, Suspense, useCallback, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { BottomBar } from '../components/BottomBar';
import { CanvasPreview } from '../components/CanvasPreview';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { PresetsPanel } from '../components/PresetsPanel';
import type { PrimitiveViewportState } from '../components/PrimitiveViewportState';
import { ProjectsPanel } from '../components/ProjectsPanel';
import { Sidebar } from '../components/Sidebar';
import { SiteNav } from '../components/SiteNav';
import { isArtifactDocumentFile, useDocumentFileTransfer } from '../hooks/useDocumentFileTransfer';
import { useGeneratorAssets } from '../hooks/useGeneratorAssets';
import { useGeneratorDocument } from '../hooks/useGeneratorDocument';
import { useGeneratorExport } from '../hooks/useGeneratorExport';
import { useGeneratorPresetsController } from '../hooks/useGeneratorPresetsController';
import { useGeneratorProjectsController } from '../hooks/useGeneratorProjectsController';
import { type AspectRatio, cloneDocument, getPreviewDims } from '../types/config';
import { inferLinearGraph } from '../utils/nodeGraph';
import { getStarterDocument, LAYER_STARTER_DOCUMENTS } from '../utils/starterDocuments';

const NodeCanvas = lazy(() => import('../components/NodeCanvas').then((module) => ({ default: module.NodeCanvas })));

function CanvasErrorFallback({ aspect }: { aspect: AspectRatio }) {
  const [previewWidth, previewHeight] = getPreviewDims(aspect);
  return (
    <div className="canvas-wrapper flex-1 flex items-center justify-center min-h-0 w-full">
      <div
        className="canvas-area relative h-full max-h-[min(100%,540px)] max-w-full flex flex-col items-center justify-center gap-2"
        style={{
          aspectRatio: `${previewWidth} / ${previewHeight}`,
          background: 'var(--sidebar-bg)',
          border: '1px solid var(--border)',
          color: 'var(--text-dim)',
          fontFamily: 'var(--mono)',
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

type ViewMode = 'layers' | 'nodes';

function EmptyCanvasStart({
  onImportImage,
  onStartAiImage,
  onAddText,
  onAddNoise,
  onLoadStarter,
}: {
  onImportImage: () => void;
  onStartAiImage: () => void;
  onAddText: () => void;
  onAddNoise: () => void;
  onLoadStarter: (id: string) => void;
}) {
  const firstStarter = LAYER_STARTER_DOCUMENTS[0];

  return (
    <div className="empty-canvas-start" aria-label="Start a new artifact">
      <div className="empty-canvas-start-actions">
        <button type="button" onClick={onImportImage}>
          Image
        </button>
        <button type="button" onClick={onStartAiImage}>
          AI
        </button>
        <button type="button" onClick={onAddText}>
          Text
        </button>
        <button type="button" onClick={onAddNoise}>
          Noise
        </button>
        {firstStarter && (
          <button type="button" onClick={() => onLoadStarter(firstStarter.id)}>
            {firstStarter.shortName}
          </button>
        )}
        <Link to="/examples">Examples</Link>
      </div>
    </div>
  );
}

function ViewModeToggle({
  value,
  onChange,
  variant = 'floating',
}: {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
  variant?: 'floating' | 'sidebar';
}) {
  const buttonStyle = (active: boolean, side: 'left' | 'right'): CSSProperties => ({
    minHeight: 'var(--touch)',
    padding: '0 16px',
    fontFamily: 'var(--mono)',
    fontSize: 11,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    cursor: 'pointer',
    background: active ? 'var(--text)' : 'transparent',
    color: active ? 'var(--bg)' : 'var(--text-dim)',
    border: '1px solid var(--border)',
    borderRight: side === 'left' ? 'none' : undefined,
    borderRadius: 0,
    transition: 'background 120ms ease-out, color 120ms ease-out',
  });

  return (
    <div className={`view-mode-toggle view-mode-toggle-${variant}`}>
      <button type="button" onClick={() => onChange('layers')} style={buttonStyle(value === 'layers', 'left')}>
        layers
      </button>
      <button type="button" onClick={() => onChange('nodes')} style={buttonStyle(value === 'nodes', 'right')}>
        nodes
      </button>
    </div>
  );
}

export default function Generator() {
  const [canvasDragOver, setCanvasDragOver] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('layers');
  const [docsBannerDismissed, setDocsBannerDismissed] = useState(false);
  const [primitiveViewStates, setPrimitiveViewStates] = useState<Record<string, PrimitiveViewportState>>({});
  const imageFileInputRef = useRef<HTMLInputElement>(null);

  const {
    doc,
    docRef,
    selectedLayerId,
    setSelectedLayerId,
    addLayer,
    addEffectPreset,
    addImageFromSource,
    removeLayer,
    deleteNodeSelection,
    updateLayer,
    storeImageAssetSource,
    updateMergeNode,
    updateColorNode,
    updateRepeatNode,
    reorderLayers,
    duplicateLayer,
    handleAddLayerAt,
    handleRandomize,
    handleNewBlank,
    handleGraphChange,
    handleExportConfigChange,
    handleCopyLink,
    loadDocument,
    setDoc,
    setAspect,
    undo,
    redo,
    canUndo,
    canRedo,
    undoCount,
    fromDocParam,
    isBlank,
  } = useGeneratorDocument(viewMode === 'nodes');
  const { imageCache, dropError, handleDroppedFile } = useGeneratorAssets(
    doc,
    addImageFromSource,
    storeImageAssetSource,
  );
  const effectivePrimitiveViewStates = useMemo(
    () => ({
      ...(doc.graph?.primitiveViewStates ?? {}),
      ...primitiveViewStates,
    }),
    [doc.graph?.primitiveViewStates, primitiveViewStates],
  );
  const exportRenderOptions = useMemo(
    () => ({ primitiveViewStates: effectivePrimitiveViewStates }),
    [effectivePrimitiveViewStates],
  );
  const { exportBusy, exportError, handleNodeExport } = useGeneratorExport(docRef, imageCache, exportRenderOptions);
  const { fileInputRef, documentFileError, handleOpenDocument, handleOpenDocumentPicker, handleSaveDocument } =
    useDocumentFileTransfer(docRef, loadDocument);
  const { showPresets, presets, togglePresets, closePresets, handleLoadPreset, saveCurrentPreset, deletePreset } =
    useGeneratorPresetsController({
      docRef,
      imageCache,
      onLoadDocument: loadDocument,
    });
  const {
    showProjects,
    projects,
    recoveryDraft,
    storageError,
    maxProjects,
    toggleProjects,
    closeProjects,
    handleLoadProject,
    saveCurrentProject,
    deleteProject,
    deleteRecoveryDraft,
  } = useGeneratorProjectsController({
    docRef,
    imageCache,
    onLoadDocument: loadDocument,
  });

  const handlePrimitiveViewStatesChange = useCallback(
    (next: Record<string, PrimitiveViewportState>) => {
      setPrimitiveViewStates((current) => (primitiveViewStateMapsEqual(current, next) ? current : next));
      const currentDoc = docRef.current;
      const graph = currentDoc.graph ?? inferLinearGraph(currentDoc.layers);
      const currentPersisted = graph.primitiveViewStates ?? {};
      if (primitiveViewStateMapsEqual(currentPersisted, next)) return;
      handleGraphChange({ ...graph, primitiveViewStates: prunePrimitiveViewStates(next, currentDoc.layers) });
    },
    [docRef, handleGraphChange],
  );

  const handleStartAiImage = useCallback(() => {
    setViewMode('layers');
    window.setTimeout(() => {
      document.querySelector<HTMLTextAreaElement>('[data-ai-generation-prompt]')?.focus();
    }, 0);
  }, []);

  const handleTogglePresets = useCallback(() => {
    closeProjects();
    togglePresets();
  }, [closeProjects, togglePresets]);

  const handleToggleProjects = useCallback(() => {
    closePresets();
    toggleProjects();
  }, [closePresets, toggleProjects]);

  const handleNewBlankRequest = useCallback(() => {
    if (
      !isBlank &&
      !window.confirm('Start a blank canvas? Current work will be saved as a recoverable draft before replacing it.')
    ) {
      return;
    }
    closePresets();
    closeProjects();
    handleNewBlank();
    setPrimitiveViewStates({});
    setViewMode('layers');
  }, [closePresets, closeProjects, handleNewBlank, isBlank]);

  const handleLoadStarter = useCallback(
    (id: string) => {
      const starter = getStarterDocument(id);
      if (!starter) return;
      closePresets();
      closeProjects();
      loadDocument(cloneDocument(starter.doc));
      setPrimitiveViewStates({});
      setViewMode('layers');
    },
    [closePresets, closeProjects, loadDocument],
  );

  const bottomBarProps = {
    onNewBlank: handleNewBlankRequest,
    onRandomize: handleRandomize,
    onUndo: undo,
    onRedo: redo,
    canUndo,
    canRedo,
    undoCount,
    onPresetsToggle: handleTogglePresets,
    onProjectsToggle: handleToggleProjects,
    onCopyLink: handleCopyLink,
    onOpenDocument: handleOpenDocumentPicker,
    onSaveDocument: handleSaveDocument,
    onExport: handleNodeExport,
    exportBusy,
  };

  return (
    <div className={`generator-layout generator-layout-${viewMode} flex flex-col w-full h-full`}>
      <SiteNav solid compact={viewMode === 'nodes'} />
      <input
        ref={fileInputRef}
        className="sr-only"
        type="file"
        accept=".artifact.json,application/json"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          void handleOpenDocument(file);
          event.currentTarget.value = '';
        }}
      />
      <input
        ref={imageFileInputRef}
        className="sr-only"
        type="file"
        accept="image/*"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) void handleDroppedFile(file);
          event.currentTarget.value = '';
        }}
      />
      {fromDocParam && !docsBannerDismissed && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 16px',
            background: 'var(--sidebar-bg)',
            borderBottom: '1px solid var(--border)',
            fontFamily: 'var(--mono)',
            fontSize: '0.62rem',
            letterSpacing: '0.04em',
            color: 'var(--text-dim)',
            flexShrink: 0,
            gap: '12px',
          }}
          role="status"
        >
          <span>
            Loaded from{' '}
            <Link to="/docs/nodes" style={{ color: 'var(--accent)', textDecoration: 'none' }}>
              docs
            </Link>{' '}
            — customize or randomize to make it yours.
          </span>
          <button
            type="button"
            onClick={() => setDocsBannerDismissed(true)}
            aria-label="Dismiss"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-dim)',
              cursor: 'pointer',
              fontSize: '1rem',
              lineHeight: 1,
              padding: '4px 6px',
              flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>
      )}
      <div className={`app app-${viewMode}`}>
        <main
          className={`main main-${viewMode}`}
          onDragEnter={(event) => {
            if (Array.from(event.dataTransfer.types).includes('Files')) setCanvasDragOver(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node)) setCanvasDragOver(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setCanvasDragOver(false);
            const file = event.dataTransfer.files[0];
            if (file) {
              if (isArtifactDocumentFile(file)) void handleOpenDocument(file);
              else void handleDroppedFile(file);
            }
          }}
        >
          <h1 className="sr-only">Album Cover Generator</h1>
          {viewMode === 'nodes' && (
            <div className="floating-view-toggle">
              <ViewModeToggle value={viewMode} onChange={setViewMode} />
            </div>
          )}

          {viewMode === 'layers' ? (
            <ErrorBoundary fallback={<CanvasErrorFallback aspect={doc.global.aspect ?? '1:1'} />}>
              <CanvasPreview
                doc={doc}
                imageCache={imageCache}
                selectedLayerId={selectedLayerId}
                dragOver={canvasDragOver}
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
              <Suspense fallback={<div style={{ flex: 1, background: 'var(--bg)' }} />}>
                <NodeCanvas
                  doc={doc}
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
                  onUpdateExportConfig={handleExportConfigChange}
                  onUpdateAspectRatio={setAspect}
                  exportBusy={exportBusy}
                  onExport={handleNodeExport}
                  onAddLayerAt={handleAddLayerAt}
                  onDeleteNodes={deleteNodeSelection}
                  onDuplicateLayer={duplicateLayer}
                />
              </Suspense>
            </div>
          )}

          {(dropError || exportError || documentFileError) && (
            <p className="font-mono text-[10px] text-red-400 text-center py-1.5 border-t border-red-400/30 flex-shrink-0">
              {dropError ?? exportError ?? documentFileError}
            </p>
          )}
          <BottomBar {...bottomBarProps} />
        </main>

        {viewMode === 'layers' && (
          <Sidebar
            doc={doc}
            onDocChange={setDoc}
            selectedLayerId={selectedLayerId}
            onSelectLayer={setSelectedLayerId}
            onAddLayer={addLayer}
            onAddEffectPreset={addEffectPreset}
            onRemoveLayer={removeLayer}
            onReorderLayers={reorderLayers}
            onDuplicateLayer={duplicateLayer}
            onGeneratedImageSource={addImageFromSource}
            mobileActionBar={<BottomBar {...bottomBarProps} />}
            modeSwitcher={<ViewModeToggle value={viewMode} onChange={setViewMode} variant="sidebar" />}
          />
        )}

        <AnimatePresence>
          {showPresets && (
            <PresetsPanel
              presets={presets}
              onSave={saveCurrentPreset}
              onLoad={handleLoadPreset}
              onDelete={deletePreset}
              onClose={closePresets}
            />
          )}
          {showProjects && (
            <ProjectsPanel
              projects={projects}
              recoveryDraft={recoveryDraft}
              storageError={storageError}
              maxProjects={maxProjects}
              onSave={saveCurrentProject}
              onLoad={handleLoadProject}
              onDelete={deleteProject}
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

function primitiveViewStateMapsEqual(
  a: Record<string, PrimitiveViewportState>,
  b: Record<string, PrimitiveViewportState>,
) {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) => {
    const left = a[key];
    const right = b[key];
    return (
      right !== undefined &&
      left.rotationX === right.rotationX &&
      left.rotationY === right.rotationY &&
      left.zoom === right.zoom &&
      left.panX === right.panX &&
      left.panY === right.panY &&
      (left.locked ?? false) === (right.locked ?? false)
    );
  });
}

function prunePrimitiveViewStates(
  viewStates: Record<string, PrimitiveViewportState>,
  layers: Array<{ id: string; kind: string }>,
) {
  const primitiveIds = new Set(layers.filter((layer) => layer.kind === 'primitive').map((layer) => layer.id));
  const entries = Object.entries(viewStates).filter(([id]) => primitiveIds.has(id));
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

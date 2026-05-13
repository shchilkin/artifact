import { AnimatePresence } from 'framer-motion';
import { type CSSProperties, lazy, Suspense, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { BottomBar } from '../components/BottomBar';
import { CanvasPreview } from '../components/CanvasPreview';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { PresetsPanel } from '../components/PresetsPanel';
import type { PrimitiveViewportState } from '../components/PrimitiveViewportState';
import { Sidebar } from '../components/Sidebar';
import { SiteNav } from '../components/SiteNav';
import { isArtifactDocumentFile, useDocumentFileTransfer } from '../hooks/useDocumentFileTransfer';
import { useGeneratorAssets } from '../hooks/useGeneratorAssets';
import { useGeneratorDocument } from '../hooks/useGeneratorDocument';
import { useGeneratorExport } from '../hooks/useGeneratorExport';
import { useGeneratorPresetsController } from '../hooks/useGeneratorPresetsController';
import { type AspectRatio, getPreviewDims } from '../types/config';

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
  onAddText,
  onAddNoise,
  onRandomize,
  onOpenNodes,
}: {
  onImportImage: () => void;
  onAddText: () => void;
  onAddNoise: () => void;
  onRandomize: () => void;
  onOpenNodes: () => void;
}) {
  return (
    <div className="empty-canvas-start" aria-label="Start a new artifact">
      <div className="empty-canvas-start-kicker">new artifact</div>
      <div className="empty-canvas-start-actions">
        <button type="button" onClick={onImportImage}>
          Image
        </button>
        <button type="button" onClick={onAddText}>
          Text
        </button>
        <button type="button" onClick={onAddNoise}>
          Noise
        </button>
        <button type="button" onClick={onRandomize}>
          Random
        </button>
        <Link to="/examples">Examples</Link>
        <button type="button" onClick={onOpenNodes}>
          Nodes
        </button>
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
    updateMergeNode,
    updateColorNode,
    reorderLayers,
    duplicateLayer,
    handleAddLayerAt,
    handleRandomize,
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
  } = useGeneratorDocument(viewMode === 'nodes');
  const { imageCache, dropError, handleDroppedFile } = useGeneratorAssets(doc, addImageFromSource);
  const exportRenderOptions = useMemo(() => ({ primitiveViewStates }), [primitiveViewStates]);
  const { exportBusy, exportError, handleNodeExport } = useGeneratorExport(docRef, imageCache, exportRenderOptions);
  const { fileInputRef, documentFileError, handleOpenDocument, handleOpenDocumentPicker, handleSaveDocument } =
    useDocumentFileTransfer(docRef, loadDocument);
  const { showPresets, presets, togglePresets, closePresets, handleLoadPreset, saveCurrentPreset, deletePreset } =
    useGeneratorPresetsController({
      docRef,
      imageCache,
      onLoadDocument: loadDocument,
    });

  const bottomBarProps = {
    onRandomize: handleRandomize,
    onUndo: undo,
    onRedo: redo,
    canUndo,
    canRedo,
    undoCount,
    onPresetsToggle: togglePresets,
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
                  onAddText={() => addLayer('text')}
                  onAddNoise={() => addLayer('noise')}
                  onRandomize={handleRandomize}
                  onOpenNodes={() => setViewMode('nodes')}
                />
              )}
            </ErrorBoundary>
          ) : (
            <div className="node-mode-stage">
              <Suspense fallback={<div style={{ flex: 1, background: 'var(--bg)' }} />}>
                <NodeCanvas
                  doc={doc}
                  imageCache={imageCache}
                  initialPrimitiveViewStates={primitiveViewStates}
                  onPrimitiveViewStatesChange={setPrimitiveViewStates}
                  selectedLayerId={selectedLayerId}
                  onSelectLayer={setSelectedLayerId}
                  onGraphChange={handleGraphChange}
                  onUpdateLayer={updateLayer}
                  onUpdateMergeNode={updateMergeNode}
                  onUpdateColorNode={updateColorNode}
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
        </AnimatePresence>
      </div>
    </div>
  );
}

import { lazy, Suspense, useState, type CSSProperties } from 'react';
import { AnimatePresence } from 'framer-motion';
import { BottomBar } from '../components/BottomBar';
import { CanvasPreview } from '../components/CanvasPreview';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { PresetsPanel } from '../components/PresetsPanel';
import { Sidebar } from '../components/Sidebar';
import { SiteNav } from '../components/SiteNav';
import { useGeneratorAssets } from '../hooks/useGeneratorAssets';
import { useGeneratorDocument } from '../hooks/useGeneratorDocument';
import { useGeneratorExport } from '../hooks/useGeneratorExport';
import { useGeneratorPresetsController } from '../hooks/useGeneratorPresetsController';
import { getPreviewDims, type AspectRatio } from '../types/config';

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
        <span>Canvas error — could not render layers.</span>
        <span style={{ opacity: 0.5 }}>{previewWidth} × {previewHeight}</span>
      </div>
    </div>
  );
}

type ViewMode = 'layers' | 'nodes';

function ViewModeToggle({ value, onChange }: { value: ViewMode; onChange: (mode: ViewMode) => void }) {
  const buttonStyle = (active: boolean, side: 'left' | 'right'): CSSProperties => ({
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
      <button type="button" onClick={() => onChange('layers')} style={buttonStyle(value === 'layers', 'left')}>layers</button>
      <button type="button" onClick={() => onChange('nodes')} style={buttonStyle(value === 'nodes', 'right')}>nodes</button>
    </div>
  );
}

export default function Generator() {
  const [canvasDragOver, setCanvasDragOver] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('layers');

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
    reorderLayers,
    duplicateLayer,
    handleAddLayerAt,
    handleRandomize,
    handleGraphChange,
    handleExportConfigChange,
    handleCopyLink,
    loadDocument,
    setDoc,
    setSeed,
    setAspect,
    undo,
    redo,
    canUndo,
    canRedo,
    undoCount,
  } = useGeneratorDocument(viewMode === 'nodes');
  const { imageCache, dropError, handleDroppedFile } = useGeneratorAssets(doc, addImageFromSource);
  const { exportBusy, exportError, handleNodeExport } = useGeneratorExport(docRef, imageCache);
  const {
    showPresets,
    presets,
    togglePresets,
    closePresets,
    handleLoadPreset,
    saveCurrentPreset,
    deletePreset,
  } = useGeneratorPresetsController({
    docRef,
    imageCache,
    onLoadDocument: loadDocument,
  });

  const bottomBarProps = {
    seed: doc.global.seed,
    onSeedChange: setSeed,
    onRandomize: handleRandomize,
    onUndo: undo,
    onRedo: redo,
    canUndo,
    canRedo,
    undoCount,
    onPresetsToggle: togglePresets,
    onCopyLink: handleCopyLink,
    onExport: handleNodeExport,
    exportBusy,
  };

  return (
    <div className="generator-layout flex flex-col w-full h-full">
      <SiteNav solid />
      <div className="app">
        <main
          className="main"
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
            if (file) void handleDroppedFile(file);
          }}
        >
          <h1 className="sr-only">Album Cover Generator</h1>
          <ViewModeToggle value={viewMode} onChange={setViewMode} />

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
            selectedLayerId={selectedLayerId}
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

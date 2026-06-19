import { type MouseEvent, useEffect, useMemo, useState } from 'react';

import {
  type GraphMaterialNode,
  type GraphScene3DNode,
  type ModelLayer,
  type PrimitiveLayer,
} from '../../../types/config';
import { renderGraphTarget } from '../../../utils/renderer';
import { LazyModelViewport3D } from '../../LazyViewport3D';
import { defaultPrimitiveViewportState, type PrimitiveViewportState } from '../../PrimitiveViewportState';
import { useNodeCanvasActions, useNodeCanvasPreview } from '../context';
import { EmptyThumbnailFrame } from './LiveMediaOverlay';
import { useGeneratedMaterialTextureCanvases } from './materialTextureCanvases';
import { NodeThumbnail } from './NodeThumbnail';

interface Scene3DPreviewSurfaceProps {
  scene3dNode: GraphScene3DNode;
  selected: boolean;
  previewTargetId: string;
  modelLayer: ModelLayer | PrimitiveLayer | null;
  materialNode: GraphMaterialNode | null;
  sceneViewState?: PrimitiveViewportState;
  backdropPreviewTargetId: string | null;
  environmentPreviewTargetId: string | null;
  environmentSource: string | null;
}

export function Scene3DPreviewSurface({
  scene3dNode,
  selected,
  previewTargetId,
  modelLayer,
  materialNode,
  sceneViewState,
  backdropPreviewTargetId,
  environmentPreviewTargetId,
  environmentSource,
}: Scene3DPreviewSurfaceProps) {
  if (!selected || !modelLayer) return <NodeThumbnail previewTargetId={previewTargetId} priority={selected} />;
  return (
    <SelectedScene3DPreviewSurface
      scene3dNode={scene3dNode}
      modelLayer={modelLayer}
      materialNode={materialNode}
      sceneViewState={sceneViewState}
      backdropPreviewTargetId={backdropPreviewTargetId}
      environmentPreviewTargetId={environmentPreviewTargetId}
      environmentSource={environmentSource}
    />
  );
}

function SelectedScene3DPreviewSurface({
  scene3dNode,
  modelLayer,
  materialNode,
  sceneViewState,
  backdropPreviewTargetId,
  environmentPreviewTargetId,
  environmentSource,
}: {
  scene3dNode: GraphScene3DNode;
  modelLayer: ModelLayer | PrimitiveLayer;
  materialNode: GraphMaterialNode | null;
  sceneViewState?: PrimitiveViewportState;
  backdropPreviewTargetId: string | null;
  environmentPreviewTargetId: string | null;
  environmentSource: string | null;
}) {
  const { doc, graph, imageCache, primitiveViewStates } = useNodeCanvasPreview();
  const { updatePrimitiveView, setPrimitiveViewportActive } = useNodeCanvasActions();
  const generatedEnvironmentCanvas = useGeneratedEnvironmentCanvas({
    enabled: !environmentSource && Boolean(environmentPreviewTargetId),
    previewTargetId: environmentPreviewTargetId,
    doc,
    graph,
    imageCache,
    primitiveViewStates,
  });
  const materialTextures = useGeneratedMaterialTextureCanvases({
    materialNode,
    doc,
    graph,
    imageCache,
    primitiveViewStates,
  });
  const [draftViewState, setDraftViewState] = useState<{ baseKey: string; value: PrimitiveViewportState } | null>(null);
  const committedViewState = useMemo(
    () => sceneViewState ?? defaultPrimitiveViewportState(modelLayer),
    [modelLayer, sceneViewState],
  );
  const committedViewStateKey = sceneViewStateKey(committedViewState);
  const effectiveViewState = activeSceneViewState(draftViewState, committedViewStateKey, committedViewState);
  const locked = !!effectiveViewState.locked;
  const underlayPreviewTargetId = backdropPreviewTargetId ?? environmentPreviewTargetId;

  useEffect(() => {
    return () => setPrimitiveViewportActive(scene3dNode.id, false);
  }, [scene3dNode.id, setPrimitiveViewportActive]);

  const setLocked = (nextLocked: boolean) => {
    const next = { ...effectiveViewState, locked: nextLocked };
    setDraftViewState(null);
    updatePrimitiveView(scene3dNode.id, next, 'snapshot');
    setPrimitiveViewportActive(scene3dNode.id, !nextLocked);
  };

  const resetCamera = () => {
    setDraftViewState(null);
    updatePrimitiveView(
      scene3dNode.id,
      {
        ...defaultPrimitiveViewportState(modelLayer),
        locked,
      },
      'snapshot',
    );
  };

  return (
    <div
      className={scenePreviewSurfaceClassName(locked)}
      onMouseEnter={() => {
        if (!locked) setPrimitiveViewportActive(scene3dNode.id, true);
      }}
      onMouseLeave={() => setPrimitiveViewportActive(scene3dNode.id, false)}
    >
      <div className="node-primitive-live-frame">
        {underlayPreviewTargetId ? (
          <NodeThumbnail previewTargetId={underlayPreviewTargetId} />
        ) : (
          <EmptyThumbnailFrame />
        )}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'auto' }}>
          <LazyModelViewport3D
            layer={modelLayer}
            sceneNode={scene3dNode}
            materialConfig={materialNode ?? undefined}
            materialTextures={materialTextures}
            environmentCanvas={generatedEnvironmentCanvas}
            environmentSource={environmentSource ?? scene3dNode.environmentSrc ?? null}
            viewState={effectiveViewState}
            onViewStateDraft={(next) => setDraftViewState({ baseKey: committedViewStateKey, value: next })}
            onViewStateChange={(next) => {
              setDraftViewState(null);
              updatePrimitiveView(scene3dNode.id, next, 'snapshot');
            }}
            className="node-primitive-preview node-primitive-preview-transparent"
          />
        </div>
      </div>
      <SceneCameraStrip
        locked={locked}
        viewState={effectiveViewState}
        onReset={resetCamera}
        onToggleLocked={setLocked}
      />
    </div>
  );
}

function useGeneratedEnvironmentCanvas({
  enabled,
  previewTargetId,
  doc,
  graph,
  imageCache,
  primitiveViewStates,
}: {
  enabled: boolean;
  previewTargetId: string | null;
  doc: Parameters<typeof renderGraphTarget>[0];
  graph: Parameters<typeof renderGraphTarget>[1];
  imageCache: Map<string, HTMLImageElement>;
  primitiveViewStates: Record<string, PrimitiveViewportState>;
}) {
  const renderKey = enabled && previewTargetId ? previewTargetId : null;
  const [renderedCanvas, setRenderedCanvas] = useState<{ key: string; canvas: HTMLCanvasElement | null } | null>(null);
  useEffect(() => {
    if (!renderKey) return;
    let cancelled = false;
    renderGraphTarget(doc, graph, renderKey, 512, 256, imageCache, {
      primitiveViewStates,
    })
      .then((nextCanvas) => {
        if (!cancelled) setRenderedCanvas({ key: renderKey, canvas: nextCanvas });
      })
      .catch(() => {
        if (!cancelled) setRenderedCanvas({ key: renderKey, canvas: null });
      });
    return () => {
      cancelled = true;
    };
  }, [doc, graph, imageCache, primitiveViewStates, renderKey]);
  return renderedCanvas?.key === renderKey ? renderedCanvas.canvas : null;
}

function activeSceneViewState(
  draft: { baseKey: string; value: PrimitiveViewportState } | null,
  committedKey: string,
  committed: PrimitiveViewportState,
) {
  if (!draft) return committed;
  return draft.baseKey === committedKey ? draft.value : committed;
}

function scenePreviewSurfaceClassName(locked: boolean) {
  return locked
    ? 'node-preview-surface primitive-preview-surface primitive-preview-surface-locked'
    : 'node-preview-surface primitive-preview-surface nodrag nopan nowheel';
}

function SceneCameraStrip({
  locked,
  viewState,
  onReset,
  onToggleLocked,
}: {
  locked: boolean;
  viewState: PrimitiveViewportState;
  onReset: () => void;
  onToggleLocked: (locked: boolean) => void;
}) {
  return (
    <div className="primitive-node-camera-strip nodrag nopan nowheel" data-primitive-camera-control>
      <span className="primitive-node-camera-hint">
        {locked ? 'scene locked' : `scene ${Math.round(viewState.zoom * 100)}%`}
      </span>
      <div className="primitive-node-camera-actions">
        <SceneCameraButton
          active={locked}
          ariaLabel={locked ? 'Unlock scene camera' : 'Lock scene camera'}
          ariaPressed={locked}
          onClick={() => onToggleLocked(!locked)}
        >
          {locked ? 'LOCK' : 'FREE'}
        </SceneCameraButton>
        <SceneCameraButton ariaLabel="Reset scene camera" onClick={onReset}>
          RESET
        </SceneCameraButton>
      </div>
    </div>
  );
}

function SceneCameraButton({
  active,
  ariaLabel,
  ariaPressed,
  children,
  onClick,
}: {
  active?: boolean;
  ariaLabel: string;
  ariaPressed?: boolean;
  children: string;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      className={`nodrag nopan nowheel primitive-camera-button${active ? ' primitive-camera-button-active' : ''}`}
      aria-label={ariaLabel}
      aria-pressed={ariaPressed}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick(event);
      }}
    >
      {children}
    </button>
  );
}

function sceneViewStateKey(viewState: PrimitiveViewportState): string {
  return [
    viewState.rotationX,
    viewState.rotationY,
    viewState.zoom,
    viewState.panX,
    viewState.panY,
    viewState.locked ? 1 : 0,
  ].join(':');
}

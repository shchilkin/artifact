import { type MouseEvent, useEffect, useMemo, useState } from 'react';

import type { ModelLayer } from '../../../types/config';
import { ModelViewport3D } from '../../ModelViewport3D';
import { defaultPrimitiveViewportState, type PrimitiveViewportState } from '../../PrimitiveViewportState';
import { useNodeCanvasActions, useNodeCanvasPreview } from '../context';
import { stopNodeEvent } from '../helpers';
import { EmptyThumbnailFrame } from './LiveMediaOverlay';
import { NodeThumbnail } from './NodeThumbnail';

interface ModelPreviewSurfaceProps {
  layer: ModelLayer;
  selected: boolean;
  modelViewState?: PrimitiveViewportState;
}

export function ModelPreviewSurface({ layer, selected, modelViewState }: ModelPreviewSurfaceProps) {
  return selected ? (
    <SelectedModelPreviewSurface layer={layer} modelViewState={modelViewState} />
  ) : (
    <ModelThumbnailPreviewSurface layerId={layer.id} />
  );
}

function SelectedModelPreviewSurface({ layer, modelViewState }: Omit<ModelPreviewSurfaceProps, 'selected'>) {
  const { graph } = useNodeCanvasPreview();
  const { openGallery, updatePrimitiveView, setPrimitiveViewportActive } = useNodeCanvasActions();
  const [draftViewState, setDraftViewState] = useState<{ baseKey: string; value: PrimitiveViewportState } | null>(null);
  const committedViewState = useMemo(
    () => modelViewState ?? defaultPrimitiveViewportState(layer),
    [layer, modelViewState],
  );
  const committedViewStateKey = modelViewStateKey(committedViewState);
  const effectiveViewState = activeModelViewState(draftViewState, committedViewStateKey, committedViewState);
  const modelLocked = !!effectiveViewState.locked;
  const modelBgPreviewTargetId = useMemo(
    () => graph.edges.find((edge) => edge.toId === layer.id && edge.toPort === 'bg')?.fromId ?? null,
    [graph.edges, layer.id],
  );

  useEffect(() => {
    return () => setPrimitiveViewportActive(layer.id, false);
  }, [layer.id, setPrimitiveViewportActive]);

  const setModelLocked = (locked: boolean) => {
    const next = { ...effectiveViewState, locked };
    setDraftViewState(null);
    updatePrimitiveView(layer.id, next);
    setPrimitiveViewportActive(layer.id, !locked);
  };

  const resetModelCamera = () => {
    setDraftViewState(null);
    updatePrimitiveView(layer.id, {
      ...defaultPrimitiveViewportState(layer),
      locked: modelLocked,
    });
  };

  return (
    <div
      className={modelPreviewSurfaceClassName(modelLocked)}
      onMouseEnter={() => {
        if (!modelLocked) setPrimitiveViewportActive(layer.id, true);
      }}
      onMouseLeave={() => setPrimitiveViewportActive(layer.id, false)}
    >
      <ModelViewportFrame
        layer={layer}
        bgPreviewTargetId={modelBgPreviewTargetId}
        viewState={effectiveViewState}
        interactive
        onViewStateDraft={(next) => setDraftViewState({ baseKey: committedViewStateKey, value: next })}
        onViewStateChange={(next) => {
          setDraftViewState(null);
          updatePrimitiveView(layer.id, next);
        }}
      />
      <ModelCameraStrip
        layerId={layer.id}
        locked={modelLocked}
        viewState={effectiveViewState}
        onOpenGallery={openGallery}
        onResetCamera={resetModelCamera}
        onToggleLocked={setModelLocked}
      />
    </div>
  );
}

function ModelThumbnailPreviewSurface({ layerId }: { layerId: string }) {
  const { openGallery } = useNodeCanvasActions();
  const [hovered, setHovered] = useState(false);
  return (
    <div
      className="node-preview-surface nodrag nopan"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <NodeThumbnail previewTargetId={layerId} />
      <button
        type="button"
        className={`node-preview-open${hovered ? ' node-preview-open-visible' : ''}`}
        onClick={(event) => {
          stopNodeEvent(event);
          openGallery(layerId);
        }}
        aria-label="Open preview"
      >
        View
      </button>
    </div>
  );
}

function activeModelViewState(
  draft: { baseKey: string; value: PrimitiveViewportState } | null,
  committedKey: string,
  committed: PrimitiveViewportState,
) {
  if (!draft) return committed;
  return draft.baseKey === committedKey ? draft.value : committed;
}

function modelPreviewSurfaceClassName(locked: boolean) {
  return locked
    ? 'node-preview-surface primitive-preview-surface primitive-preview-surface-locked'
    : 'node-preview-surface primitive-preview-surface nodrag nopan nowheel';
}

function ModelViewportFrame({
  layer,
  bgPreviewTargetId,
  viewState,
  interactive,
  onViewStateDraft,
  onViewStateChange,
}: {
  layer: ModelLayer;
  bgPreviewTargetId: string | null;
  viewState: PrimitiveViewportState;
  interactive: boolean;
  onViewStateDraft?: (viewState: PrimitiveViewportState) => void;
  onViewStateChange: (viewState: PrimitiveViewportState) => void;
}) {
  return (
    <div className="node-primitive-live-frame">
      {bgPreviewTargetId ? <NodeThumbnail previewTargetId={bgPreviewTargetId} /> : <EmptyThumbnailFrame />}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: interactive ? 'auto' : 'none' }}>
        <ModelViewport3D
          layer={layer}
          viewState={viewState}
          interactive={interactive}
          onViewStateDraft={onViewStateDraft}
          onViewStateChange={onViewStateChange}
          className="node-primitive-preview node-primitive-preview-transparent"
        />
      </div>
    </div>
  );
}

function ModelCameraStrip({
  layerId,
  locked,
  viewState,
  onOpenGallery,
  onResetCamera,
  onToggleLocked,
}: {
  layerId: string;
  locked: boolean;
  viewState: PrimitiveViewportState;
  onOpenGallery: (targetId: string) => void;
  onResetCamera: () => void;
  onToggleLocked: (locked: boolean) => void;
}) {
  return (
    <div className="primitive-node-camera-strip nodrag nopan nowheel" data-primitive-camera-control>
      <span className="primitive-node-camera-hint">
        {locked ? 'camera locked' : `camera ${Math.round(viewState.zoom * 100)}%`}
      </span>
      <div className="primitive-node-camera-actions">
        <ModelCameraButton
          active={locked}
          ariaLabel={locked ? 'Unlock camera' : 'Lock camera'}
          ariaPressed={locked}
          onClick={() => onToggleLocked(!locked)}
        >
          {locked ? 'LOCK' : 'FREE'}
        </ModelCameraButton>
        <ModelCameraButton
          ariaLabel="Open preview"
          onClick={(event) => {
            stopNodeEvent(event);
            onOpenGallery(layerId);
          }}
        >
          VIEW
        </ModelCameraButton>
        <ModelCameraButton ariaLabel="Reset camera" onClick={onResetCamera}>
          RESET
        </ModelCameraButton>
      </div>
    </div>
  );
}

function ModelCameraButton({
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

function modelViewStateKey(viewState: PrimitiveViewportState): string {
  return [
    viewState.rotationX,
    viewState.rotationY,
    viewState.zoom,
    viewState.panX,
    viewState.panY,
    viewState.locked ? 1 : 0,
  ].join(':');
}

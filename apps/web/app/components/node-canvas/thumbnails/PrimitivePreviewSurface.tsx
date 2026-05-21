import { useEffect, useMemo, useState } from 'react';

import type { PrimitiveLayer } from '../../../types/config';
import { PrimitiveViewport3D } from '../../PrimitiveViewport3D';
import {
  defaultPrimitiveViewportState,
  type PrimitiveRenderMode,
  type PrimitiveViewportState,
} from '../../PrimitiveViewportState';
import { useNodeCanvasActions, useNodeCanvasPreview } from '../context';
import { stopNodeEvent } from '../helpers';
import { EmptyThumbnailFrame } from './LiveMediaOverlay';
import { NodeThumbnail } from './NodeThumbnail';

interface PrimitivePreviewSurfaceProps {
  layer: PrimitiveLayer;
  selected: boolean;
  primitiveViewState?: PrimitiveViewportState;
  primitiveRenderMode?: PrimitiveRenderMode;
}

export function PrimitivePreviewSurface({
  layer,
  selected,
  primitiveViewState,
  primitiveRenderMode,
}: PrimitivePreviewSurfaceProps) {
  const { graph } = useNodeCanvasPreview();
  const { openGallery, updatePrimitiveView, setPrimitiveViewportActive } = useNodeCanvasActions();
  const [hovered, setHovered] = useState(false);
  const [draftViewState, setDraftViewState] = useState<{
    baseKey: string;
    value: PrimitiveViewportState;
  } | null>(null);
  const committedViewState = useMemo(
    () => primitiveViewState ?? defaultPrimitiveViewportState(layer),
    [layer, primitiveViewState],
  );
  const committedViewStateKey = primitiveViewStateKey(committedViewState);
  const activeDraftViewState =
    selected && draftViewState && draftViewState.baseKey === committedViewStateKey ? draftViewState.value : null;
  const effectiveViewState = activeDraftViewState ?? committedViewState;
  const effectiveRenderMode = primitiveRenderMode ?? 'shaded';
  const primitiveLocked = !!effectiveViewState.locked;
  const primitiveBgPreviewTargetId = useMemo(
    () => graph.edges.find((edge) => edge.toId === layer.id && edge.toPort === 'bg')?.fromId ?? null,
    [graph.edges, layer.id],
  );

  useEffect(() => {
    if (!selected) setPrimitiveViewportActive(layer.id, false);
    return () => setPrimitiveViewportActive(layer.id, false);
  }, [layer.id, selected, setPrimitiveViewportActive]);

  const setPrimitiveLocked = (locked: boolean) => {
    const next = { ...effectiveViewState, locked };
    setDraftViewState(null);
    updatePrimitiveView(layer.id, next);
    if (selected) setPrimitiveViewportActive(layer.id, !locked);
  };

  const resetPrimitiveCamera = () => {
    setDraftViewState(null);
    updatePrimitiveView(layer.id, {
      ...defaultPrimitiveViewportState(layer),
      locked: primitiveLocked,
    });
  };

  if (!selected) {
    return (
      <div
        className="node-preview-surface nodrag nopan"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <NodeThumbnail previewTargetId={layer.id} />
        <button
          type="button"
          className={`node-preview-open${hovered ? ' node-preview-open-visible' : ''}`}
          onClick={(event) => {
            stopNodeEvent(event);
            openGallery(layer.id);
          }}
          aria-label="Open preview"
        >
          View
        </button>
      </div>
    );
  }

  return (
    <div
      className={`node-preview-surface primitive-preview-surface${primitiveLocked ? ' primitive-preview-surface-locked' : ' nodrag nopan nowheel'}`}
      onMouseEnter={() => {
        setHovered(true);
        if (!primitiveLocked) setPrimitiveViewportActive(layer.id, true);
      }}
      onMouseLeave={() => {
        setHovered(false);
        setPrimitiveViewportActive(layer.id, false);
      }}
    >
      <PrimitiveViewportFrame
        layer={layer}
        bgPreviewTargetId={primitiveBgPreviewTargetId}
        renderMode={effectiveRenderMode}
        viewState={effectiveViewState}
        interactive
        onViewStateDraft={(next) => setDraftViewState({ baseKey: committedViewStateKey, value: next })}
        onViewStateChange={(next) => {
          setDraftViewState(null);
          updatePrimitiveView(layer.id, next);
        }}
      />
      <div className="primitive-node-camera-strip nodrag nopan nowheel" data-primitive-camera-control>
        <span className="primitive-node-camera-hint">
          {primitiveLocked ? 'camera locked' : `camera ${Math.round(effectiveViewState.zoom * 100)}%`}
        </span>
        <div className="primitive-node-camera-actions">
          <button
            type="button"
            className={`nodrag nopan nowheel primitive-camera-button${primitiveLocked ? ' primitive-camera-button-active' : ''}`}
            aria-label={primitiveLocked ? 'Unlock camera' : 'Lock camera'}
            aria-pressed={primitiveLocked}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setPrimitiveLocked(!primitiveLocked);
            }}
          >
            {primitiveLocked ? 'LOCK' : 'FREE'}
          </button>
          <button
            type="button"
            className="nodrag nopan nowheel primitive-camera-button"
            aria-label="Open preview"
            onClick={(event) => {
              stopNodeEvent(event);
              openGallery(layer.id);
            }}
          >
            VIEW
          </button>
          <button
            type="button"
            className="nodrag nopan nowheel primitive-camera-button"
            aria-label="Reset camera"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              resetPrimitiveCamera();
            }}
          >
            RESET
          </button>
        </div>
      </div>
    </div>
  );
}

function primitiveViewStateKey(viewState: PrimitiveViewportState): string {
  return [
    viewState.rotationX,
    viewState.rotationY,
    viewState.zoom,
    viewState.panX,
    viewState.panY,
    viewState.locked ? 1 : 0,
  ].join(':');
}

function PrimitiveViewportFrame({
  layer,
  bgPreviewTargetId,
  renderMode,
  viewState,
  interactive,
  onViewStateDraft,
  onViewStateChange,
}: {
  layer: PrimitiveLayer;
  bgPreviewTargetId: string | null;
  renderMode: PrimitiveRenderMode;
  viewState: PrimitiveViewportState;
  interactive: boolean;
  onViewStateDraft?: (viewState: PrimitiveViewportState) => void;
  onViewStateChange: (viewState: PrimitiveViewportState) => void;
}) {
  return (
    <div className="node-primitive-live-frame">
      {bgPreviewTargetId ? <NodeThumbnail previewTargetId={bgPreviewTargetId} /> : <EmptyThumbnailFrame />}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: interactive ? 'auto' : 'none' }}>
        <PrimitiveViewport3D
          layer={layer}
          mode="node"
          renderMode={renderMode}
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

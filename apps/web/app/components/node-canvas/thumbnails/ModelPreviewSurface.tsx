import { useMemo, useState } from 'react';

import type { ModelLayer } from '../../../types/config';
import { LazyModelViewport3D } from '../../LazyViewport3D';
import { defaultPrimitiveViewportState, type PrimitiveViewportState } from '../../PrimitiveViewportState';
import { useNodeCanvasActions, useNodeCanvasPreview } from '../context';
import { stopNodeEvent } from '../helpers';
import { EmptyThumbnailFrame } from './LiveMediaOverlay';
import { NodeThumbnail } from './NodeThumbnail';

interface ModelPreviewSurfaceProps {
  layer: ModelLayer;
  selected: boolean;
}

export function ModelPreviewSurface({ layer, selected }: ModelPreviewSurfaceProps) {
  return <ModelAssetPreviewSurface layer={layer} selected={selected} />;
}

function ModelAssetPreviewSurface({ layer, selected }: ModelPreviewSurfaceProps) {
  const { graph } = useNodeCanvasPreview();
  const { openGallery } = useNodeCanvasActions();
  const [hovered, setHovered] = useState(false);
  const previewViewState = useMemo(() => defaultPrimitiveViewportState(layer), [layer]);
  const modelBgPreviewTargetId = useMemo(
    () => graph.edges.find((edge) => edge.toId === layer.id && edge.toPort === 'bg')?.fromId ?? null,
    [graph.edges, layer.id],
  );

  return (
    <div
      className="node-preview-surface primitive-preview-surface"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <ModelViewportFrame
        layer={layer}
        bgPreviewTargetId={modelBgPreviewTargetId}
        viewState={previewViewState}
        interactive={false}
      />
      <button
        type="button"
        className={`node-preview-open${selected || hovered ? ' node-preview-open-visible' : ''}`}
        onClick={(event) => {
          stopNodeEvent(event);
          openGallery(layer.id);
        }}
        aria-label="Open model asset preview"
      >
        View
      </button>
    </div>
  );
}

function ModelViewportFrame({
  layer,
  bgPreviewTargetId,
  viewState,
  interactive,
}: {
  layer: ModelLayer;
  bgPreviewTargetId: string | null;
  viewState: PrimitiveViewportState;
  interactive: boolean;
}) {
  return (
    <div className="node-primitive-live-frame">
      {bgPreviewTargetId ? <NodeThumbnail previewTargetId={bgPreviewTargetId} /> : <EmptyThumbnailFrame />}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: interactive ? 'auto' : 'none' }}>
        <LazyModelViewport3D
          layer={layer}
          viewState={viewState}
          interactive={interactive}
          autoRotatePreview={!interactive}
          onViewStateChange={() => undefined}
          className="node-primitive-preview node-primitive-preview-transparent"
        />
      </div>
    </div>
  );
}

import { Skeleton } from '@artifact/ui';
import { memo } from 'react';

import type { ThumbProps } from '../types';
import { useNodeThumbnailRender } from './useNodeThumbnailRender';

export const NodeThumbnail = memo(function NodeThumbnail({
  previewTargetId,
  priority = false,
  statusOverlay,
}: ThumbProps) {
  const {
    frameRef,
    canvasRef,
    isExportPreview,
    previewSize,
    canvasOpacity,
    showSkeleton,
    showPreparing,
    renderFailed,
    missingRequiredSource,
  } = useNodeThumbnailRender(previewTargetId, { priority });
  const chromeState = renderFailed ? 'failed' : showSkeleton ? 'loading' : showPreparing ? 'updating' : 'ready';

  return (
    <div
      className={`node-thumbnail${isExportPreview ? ' node-thumbnail-export' : ''}`}
      data-canvas-chrome-surface="node-thumbnail"
      data-canvas-chrome-state={chromeState}
      style={{ minHeight: previewSize.display.height }}
    >
      <div
        ref={frameRef}
        className="node-thumbnail-frame checkerboard-surface"
        style={{ width: previewSize.display.width, height: previewSize.display.height }}
      >
        <canvas
          ref={canvasRef}
          width={previewSize.render.width}
          height={previewSize.render.height}
          className="node-thumbnail-canvas"
          style={{ opacity: canvasOpacity, transition: 'opacity 0.1s ease' }}
        />
        <NodeThumbnailOverlays
          missingRequiredSource={missingRequiredSource}
          renderFailed={renderFailed}
          showPreparing={showPreparing}
          showSkeleton={showSkeleton}
        />
        {statusOverlay}
      </div>
    </div>
  );
});

function NodeThumbnailOverlays({
  missingRequiredSource,
  renderFailed,
  showPreparing,
  showSkeleton,
}: {
  missingRequiredSource: boolean;
  renderFailed: boolean;
  showPreparing: boolean;
  showSkeleton: boolean;
}) {
  return (
    <>
      {showSkeleton && !renderFailed && <Skeleton className="node-thumbnail-skeleton" shape="block" />}
      {showPreparing && !renderFailed && <div className="node-thumbnail-preparing">Preparing</div>}
      {renderFailed && (
        <div className="node-thumbnail-failed" role="status">
          Preview unavailable
        </div>
      )}
      {missingRequiredSource && <div className="node-thumbnail-empty-label">Connect source</div>}
    </>
  );
}

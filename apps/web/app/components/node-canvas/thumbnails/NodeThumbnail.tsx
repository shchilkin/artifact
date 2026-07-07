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
    missingRequiredSource,
  } = useNodeThumbnailRender(previewTargetId, { priority });

  return (
    <div
      className={`node-thumbnail${isExportPreview ? ' node-thumbnail-export' : ''}`}
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
  showPreparing,
  showSkeleton,
}: {
  missingRequiredSource: boolean;
  showPreparing: boolean;
  showSkeleton: boolean;
}) {
  return (
    <>
      {showSkeleton && <div className="node-thumbnail-skeleton" />}
      {showPreparing && <div className="node-thumbnail-preparing">Preparing</div>}
      {missingRequiredSource && <div className="node-thumbnail-empty-label">Connect source</div>}
    </>
  );
}

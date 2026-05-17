import { memo } from 'react';

import type { ThumbProps } from '../types';
import { useNodeThumbnailRender } from './useNodeThumbnailRender';

export const NodeThumbnail = memo(function NodeThumbnail({ previewTargetId, priority = false }: ThumbProps) {
  const { canvasRef, isExportPreview, previewSize, canvasOpacity, showSkeleton, showPreparing } =
    useNodeThumbnailRender(previewTargetId, { priority });

  return (
    <div
      className={`node-thumbnail${isExportPreview ? ' node-thumbnail-export' : ''}`}
      style={{ minHeight: previewSize.display.height }}
    >
      <div
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
        {showSkeleton && <div className="node-thumbnail-skeleton" />}
        {showPreparing && <div className="node-thumbnail-preparing">Preparing</div>}
      </div>
    </div>
  );
});

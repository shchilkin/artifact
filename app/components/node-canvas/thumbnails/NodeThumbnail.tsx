import { memo } from 'react';

import type { ThumbProps } from '../types';
import { useNodeThumbnailRender } from './useNodeThumbnailRender';

export const NodeThumbnail = memo(function NodeThumbnail({ previewTargetId }: ThumbProps) {
  const { canvasRef, isExportPreview, previewSize, canvasOpacity, showSkeleton } =
    useNodeThumbnailRender(previewTargetId);

  return (
    <div
      className={`node-thumbnail${isExportPreview ? ' node-thumbnail-export' : ''}`}
      style={{ minHeight: previewSize.display.height }}
    >
      <div
        className="node-thumbnail-frame"
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
      </div>
    </div>
  );
});

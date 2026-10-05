import { useEffect, useRef } from 'react';

import { PreviewProgress } from '../../ui/PreviewProgress';
import { getThumbnailQueueSnapshot, subscribeThumbnailQueue } from './thumbnailQueue';

/**
 * Progress for Nodes: shows while node previews, including the Output preview, are queued or rendering. The queue
 * is read through its subscription and written to `data-preview-pending` directly, so it costs no React commit.
 */
export function NodePreviewProgress() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sync = () => {
      const element = ref.current;
      if (!element) return;
      const { queued, active } = getThumbnailQueueSnapshot();
      const value = queued > 0 || active ? 'true' : 'false';
      if (element.dataset.previewPending !== value) element.dataset.previewPending = value;
    };
    sync();
    const unsubscribe = subscribeThumbnailQueue(sync);
    return () => {
      unsubscribe();
    };
  }, []);

  return <PreviewProgress ref={ref} className="node-preview-progress" />;
}

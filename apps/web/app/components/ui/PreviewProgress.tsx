import { forwardRef } from 'react';

import { cn } from '@/lib/utils';

import './preview-progress.css';

/**
 * Hairline progress bar for a preview surface. It shows while its own `data-preview-pending` attribute, or that of
 * a preceding sibling, is "true"; callers write that attribute outside React so pending work costs no commit.
 */
export const PreviewProgress = forwardRef<HTMLDivElement, { className?: string }>(function PreviewProgress(
  { className },
  ref,
) {
  return <div ref={ref} className={cn('preview-progress', className)} aria-hidden="true" />;
});

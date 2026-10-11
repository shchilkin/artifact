import { type MutableRefObject, useCallback, useEffect, useRef, useState } from 'react';
import { type CanvasDocument, DEFAULT_EXPORT } from '../types/config';
import { exportCanvas } from '../utils/exportCanvas';
import { exportEnvMap } from '../utils/exportEnvMap';
import type { RenderOptions } from '../utils/renderer';

const MIN_EXPORT_BUSY_MS = 400;

function waitForExportBusyPaint() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

async function waitForMinimumExportBusyDuration(startedAt: number) {
  const remaining = MIN_EXPORT_BUSY_MS - (performance.now() - startedAt);
  if (remaining <= 0) return;
  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, remaining);
  });
}

/** What the last export did: the downloaded file, or an error that stays until it is dismissed or retried. */
export type EditorExportFeedback = { tone: 'done'; fileName: string } | { tone: 'error'; message: string };

/** One export, bound to the document and settings it was started with, so a retry writes the same file. */
interface ExportJob {
  download: () => Promise<string>;
  fallbackError: string;
}

const EXPORT_DONE_VISIBLE_MS = 6000;

export function useEditorExport(
  docRef: MutableRefObject<CanvasDocument>,
  imageCache: Map<string, HTMLImageElement>,
  renderOptions: RenderOptions = {},
) {
  const [exportBusy, setExportBusy] = useState(false);
  const [exportFeedback, setExportFeedback] = useState<EditorExportFeedback | null>(null);
  const doneTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const failedJobRef = useRef<ExportJob | null>(null);

  useEffect(() => () => clearTimeout(doneTimerRef.current), []);

  const runExport = useCallback(async (job: ExportJob) => {
    const busyStartedAt = performance.now();
    clearTimeout(doneTimerRef.current);
    failedJobRef.current = null;
    setExportBusy(true);
    setExportFeedback(null);
    let feedback: EditorExportFeedback;
    try {
      await waitForExportBusyPaint();
      feedback = { tone: 'done', fileName: await job.download() };
    } catch (error) {
      failedJobRef.current = job;
      feedback = { tone: 'error', message: error instanceof Error ? error.message : job.fallbackError };
    }
    await waitForMinimumExportBusyDuration(busyStartedAt);
    setExportBusy(false);
    setExportFeedback(feedback);
    // Success is announced and then fades; an error stays until it is dismissed or retried.
    if (feedback.tone === 'done') {
      doneTimerRef.current = setTimeout(() => setExportFeedback(null), EXPORT_DONE_VISIBLE_MS);
    }
  }, []);

  const handleNodeExport = useCallback(() => {
    // Documents are immutable, so holding this one keeps what the person exported even if they edit afterwards.
    const doc = docRef.current;
    const exportConfig = doc.export ?? DEFAULT_EXPORT;
    if (exportConfig.target === 'envmap') {
      void runExport({ download: () => exportEnvMap(doc, imageCache), fallbackError: 'Env map export failed' });
      return;
    }
    void runExport({
      download: () => exportCanvas(doc, imageCache, exportConfig.scale, exportConfig.format, renderOptions),
      fallbackError: 'Export failed',
    });
  }, [docRef, imageCache, renderOptions, runExport]);

  /** Runs the failed export again with the document and settings it was started with. */
  const retryExport = useCallback(() => {
    const job = failedJobRef.current;
    if (job) void runExport(job);
  }, [runExport]);

  const dismissExportFeedback = useCallback(() => {
    clearTimeout(doneTimerRef.current);
    failedJobRef.current = null;
    setExportFeedback(null);
  }, []);

  return {
    exportBusy,
    exportFeedback,
    dismissExportFeedback,
    handleNodeExport,
    retryExport,
  };
}

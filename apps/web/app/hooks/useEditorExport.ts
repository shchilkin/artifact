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

const EXPORT_DONE_VISIBLE_MS = 6000;

export function useEditorExport(
  docRef: MutableRefObject<CanvasDocument>,
  imageCache: Map<string, HTMLImageElement>,
  renderOptions: RenderOptions = {},
) {
  const [exportBusy, setExportBusy] = useState(false);
  const [exportFeedback, setExportFeedback] = useState<EditorExportFeedback | null>(null);
  const doneTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(doneTimerRef.current), []);

  const runExport = useCallback(async (download: () => Promise<string>, fallbackError: string) => {
    const busyStartedAt = performance.now();
    clearTimeout(doneTimerRef.current);
    setExportBusy(true);
    setExportFeedback(null);
    let feedback: EditorExportFeedback;
    try {
      await waitForExportBusyPaint();
      feedback = { tone: 'done', fileName: await download() };
    } catch (error) {
      feedback = {
        tone: 'error',
        message: error instanceof Error ? error.message : fallbackError,
      };
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
    const exportConfig = docRef.current.export ?? DEFAULT_EXPORT;
    if (exportConfig.target === 'envmap') {
      void runExport(() => exportEnvMap(docRef.current, imageCache), 'Env map export failed');
      return;
    }
    void runExport(
      () => exportCanvas(docRef.current, imageCache, exportConfig.scale, exportConfig.format, renderOptions),
      'Export failed',
    );
  }, [docRef, imageCache, renderOptions, runExport]);

  const dismissExportFeedback = useCallback(() => {
    clearTimeout(doneTimerRef.current);
    setExportFeedback(null);
  }, []);

  return {
    exportBusy,
    exportFeedback,
    dismissExportFeedback,
    handleNodeExport,
  };
}

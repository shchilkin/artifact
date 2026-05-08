import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { DEFAULT_EXPORT, type CanvasDocument } from '../types/config';
import { exportCanvas } from '../utils/exportCanvas';
import { exportEnvMap } from '../utils/exportEnvMap';

export function useGeneratorExport(
  docRef: MutableRefObject<CanvasDocument>,
  imageCache: Map<string, HTMLImageElement>,
) {
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingEnvMap, setIsExportingEnvMap] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const exportErrorTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(exportErrorTimerRef.current), []);

  const showExportError = useCallback((message: string) => {
    setExportError(message);
    clearTimeout(exportErrorTimerRef.current);
    exportErrorTimerRef.current = setTimeout(() => setExportError(null), 5000);
  }, []);

  const handleExport = useCallback(async (scale: 1 | 2 | 3, format: 'png' | 'jpeg') => {
    setIsExporting(true);
    setExportError(null);
    try {
      await exportCanvas(docRef.current, imageCache, scale, format);
    } catch (error) {
      showExportError(error instanceof Error ? error.message : 'Export failed');
    } finally {
      setIsExporting(false);
    }
  }, [docRef, imageCache, showExportError]);

  const handleEnvMapExport = useCallback(async () => {
    setIsExportingEnvMap(true);
    setExportError(null);
    try {
      await exportEnvMap(docRef.current, imageCache);
    } catch (error) {
      showExportError(error instanceof Error ? error.message : 'Env map export failed');
    } finally {
      setIsExportingEnvMap(false);
    }
  }, [docRef, imageCache, showExportError]);

  const handleNodeExport = useCallback(() => {
    const exportConfig = docRef.current.export ?? DEFAULT_EXPORT;
    if (exportConfig.target === 'envmap') {
      void handleEnvMapExport();
      return;
    }
    void handleExport(exportConfig.scale, exportConfig.format);
  }, [docRef, handleEnvMapExport, handleExport]);

  return {
    exportBusy: isExporting || isExportingEnvMap,
    exportError,
    handleNodeExport,
  };
}

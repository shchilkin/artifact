import { useCallback, useState } from 'react';

const PERF_DEBUG_STORAGE_KEY = 'artifact-debug-perf';

/**
 * The performance overlay is a developer tool: its toolbar toggle and the stored preference apply only when the URL
 * has `?debug` (any value) or `?perf=1`.
 */
export function useNodePerfDebug() {
  const [perfDebugAvailable] = useState(() => isPerfDebugAvailable());
  const [perfDebugEnabled, setPerfDebugEnabled] = useState(() => perfDebugAvailable && isPerfDebugEnabledByDefault());

  const handleTogglePerfDebug = useCallback(() => {
    setPerfDebugEnabled((enabled) => {
      const next = !enabled;
      try {
        localStorage.setItem(PERF_DEBUG_STORAGE_KEY, next ? '1' : '0');
      } catch {
        // Debug preferences are best-effort.
      }
      return next;
    });
  }, []);

  return { perfDebugAvailable, perfDebugEnabled, handleTogglePerfDebug };
}

function isPerfDebugAvailable() {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return params.has('debug') || params.get('perf') === '1';
}

function isPerfDebugEnabledByDefault() {
  if (perfDebugEnabledInSearch(window.location.search)) return true;
  try {
    return localStorage.getItem(PERF_DEBUG_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function perfDebugEnabledInSearch(search: string) {
  const params = new URLSearchParams(search);
  return params.get('debug') === 'perf' || params.get('perf') === '1';
}

import { useCallback, useState } from 'react';

const PERF_DEBUG_STORAGE_KEY = 'artifact-debug-perf';

export function useNodePerfDebug() {
  const [perfDebugEnabled, setPerfDebugEnabled] = useState(() => isPerfDebugEnabledByDefault());

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

  return { perfDebugEnabled, handleTogglePerfDebug };
}

function isPerfDebugEnabledByDefault() {
  if (typeof window === 'undefined') return false;
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

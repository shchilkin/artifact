/**
 * Runs `callback` in an idle period, at the latest after `timeoutMs`, or after `fallbackMs` where
 * `requestIdleCallback` is unavailable. Returns a function that cancels it.
 */
export function scheduleIdle(callback: () => void, timeoutMs: number, fallbackMs = 0): () => void {
  if (typeof globalThis.requestIdleCallback === 'function') {
    const handle = globalThis.requestIdleCallback(callback, { timeout: timeoutMs });
    return () => globalThis.cancelIdleCallback?.(handle);
  }
  const handle = setTimeout(callback, fallbackMs);
  return () => clearTimeout(handle);
}

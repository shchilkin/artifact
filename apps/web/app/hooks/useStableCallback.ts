import { useCallback, useLayoutEffect, useRef } from 'react';

/**
 * A function whose identity never changes and that always calls the latest `callback`. Pass it to memoized children
 * whose handlers would otherwise change on every document edit. Call it from event handlers, not during render.
 */
export function useStableCallback<Args extends unknown[], Result>(
  callback: (...args: Args) => Result,
): (...args: Args) => Result {
  const callbackRef = useRef(callback);
  useLayoutEffect(() => {
    callbackRef.current = callback;
  });
  return useCallback((...args: Args) => callbackRef.current(...args), []);
}

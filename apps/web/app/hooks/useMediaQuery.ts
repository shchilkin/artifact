import { useEffect, useState } from 'react';

export interface MediaQuerySource {
  matches: boolean;
  addEventListener(type: 'change', listener: () => void): void;
  removeEventListener(type: 'change', listener: () => void): void;
}

/**
 * Reports `source.matches` now and after each change; returns a stop function.
 *
 * Firefox can run media query change listeners synchronously inside a style flush, and a flush can happen while
 * React is rendering another component. A state update from there is a render-phase update of a different
 * component, so changes are reported from a microtask, after that call stack has finished.
 */
export function watchMediaQuery(source: MediaQuerySource, onChange: (matches: boolean) => void): () => void {
  let watching = true;
  const handleChange = () =>
    queueMicrotask(() => {
      if (watching) onChange(source.matches);
    });
  onChange(source.matches);
  source.addEventListener('change', handleChange);
  return () => {
    watching = false;
    source.removeEventListener('change', handleChange);
  };
}

/** Whether `query` matches. False on the server and the first client render, so hydration matches. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const source = window.matchMedia?.(query);
    if (!source) return;
    return watchMediaQuery(source, setMatches);
  }, [query]);
  return matches;
}

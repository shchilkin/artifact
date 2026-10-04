import { type RefObject, useCallback, useRef } from 'react';
import type { CanvasDocument } from '../../types/config';
import { documentFingerprint } from '../../utils/documentFingerprint';
import { isBlankDocument } from '../../utils/documentPersistence';

/**
 * Remembers the document the editor last put in place, exactly as loaded: the document the editor opened with
 * (a restored autosave, a shared link, a project opened from Projects), a loaded file or project, or a random
 * cover. Replacing actions ask first only when the person changed it since. Editor UI state; never saved.
 */
export function useReplaceableWork(initialDoc: CanvasDocument, docRef: RefObject<CanvasDocument>) {
  // Lazily seeded on first render with the document the editor opened with.
  const baselineRef = useRef<string | null | undefined>(undefined);
  if (baselineRef.current === undefined) baselineRef.current = documentFingerprint(initialDoc);

  /** The document the editor just put in place, or null when it starts from a blank canvas. */
  const setBaseline = useCallback((loadedDoc: CanvasDocument | null) => {
    baselineRef.current = loadedDoc ? documentFingerprint(loadedDoc) : null;
  }, []);

  const hasReplaceableWork = useCallback(() => {
    const current = docRef.current;
    if (isBlankDocument(current)) return false;
    return documentFingerprint(current) !== baselineRef.current;
  }, [docRef]);

  return { hasReplaceableWork, setBaseline };
}

import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { type CanvasDocument, cloneDocument, DEFAULT_DOCUMENT } from '../../types/config';
import { documentFingerprint } from '../../utils/documentFingerprint';
import { isBlankDocument } from '../../utils/documentPersistence';

/**
 * Remembers the document the editor last put in place (the default document, a shared link, a loaded
 * file or project, New, Randomize) so replacing actions ask first only when the person changed it since.
 * Editor UI state; it is never saved.
 */
export function useReplaceableWork(doc: CanvasDocument, docRef: RefObject<CanvasDocument>, openedFromLink: boolean) {
  const [initialBaseline] = useState(() => documentFingerprint(openedFromLink ? doc : cloneDocument(DEFAULT_DOCUMENT)));
  const baselineRef = useRef<string | null>(initialBaseline);
  const replacingRef = useRef(false);

  useEffect(() => {
    if (!replacingRef.current) return;
    replacingRef.current = false;
    baselineRef.current = documentFingerprint(doc);
  }, [doc]);

  /** Call right before the editor replaces the whole document; the next document becomes the baseline. */
  const markReplacing = useCallback(() => {
    replacingRef.current = true;
  }, []);

  const hasReplaceableWork = useCallback(() => {
    const current = docRef.current;
    if (isBlankDocument(current)) return false;
    return documentFingerprint(current) !== baselineRef.current;
  }, [docRef]);

  return { hasReplaceableWork, markReplacing };
}

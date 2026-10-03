import { type CanvasDocument, cloneDocument } from '../types/config';

export const HISTORY_MAX = 50;

export type DocumentUpdateMode = 'snapshot' | 'debounce' | 'silent';

export interface HistoryEntry {
  doc: CanvasDocument;
}

export interface HistoryStacks {
  past: HistoryEntry[];
  future: HistoryEntry[];
}

export function createHistoryEntry(doc: CanvasDocument): HistoryEntry {
  return { doc: cloneDocument(doc) };
}

export function appendHistoryEntry(past: HistoryEntry[], entry: HistoryEntry, max = HISTORY_MAX) {
  return [...past.slice(-(max - 1)), entry];
}

export function pushSnapshotHistory(stacks: HistoryStacks, currentDoc: CanvasDocument): HistoryStacks {
  return {
    past: appendHistoryEntry(stacks.past, createHistoryEntry(currentDoc)),
    future: [],
  };
}

export function createPendingHistoryEntry(currentDoc: CanvasDocument, pending: HistoryEntry | null) {
  return pending ?? createHistoryEntry(currentDoc);
}

export function flushPendingHistory(stacks: HistoryStacks, pending: HistoryEntry | null): HistoryStacks {
  if (!pending) return stacks;
  return {
    past: appendHistoryEntry(stacks.past, pending),
    future: [],
  };
}

export function undoHistory(stacks: HistoryStacks, currentDoc: CanvasDocument) {
  if (stacks.past.length === 0) return null;
  const previous = stacks.past[stacks.past.length - 1];
  return {
    doc: previous.doc,
    past: stacks.past.slice(0, -1),
    future: [createHistoryEntry(currentDoc), ...stacks.future.slice(0, HISTORY_MAX - 1)],
  };
}

export function redoHistory(stacks: HistoryStacks, currentDoc: CanvasDocument) {
  if (stacks.future.length === 0) return null;
  const next = stacks.future[0];
  return {
    doc: next.doc,
    past: appendHistoryEntry(stacks.past, createHistoryEntry(currentDoc)),
    future: stacks.future.slice(1),
  };
}

export const HISTORY_DEBOUNCE_MS = 400;

/** State and setters `commitDocumentWithHistory` works with; the editor passes its refs and React state setters. */
export interface DocumentHistoryCommit {
  docRef: { current: CanvasDocument };
  pendingRef: { current: HistoryEntry | null };
  timerRef: { current: ReturnType<typeof setTimeout> | undefined };
  setDoc: (doc: CanvasDocument) => void;
  setPast: (update: (past: HistoryEntry[]) => HistoryEntry[]) => void;
  setFuture: (future: HistoryEntry[]) => void;
}

export function clearPendingDocumentHistory({ pendingRef, timerRef }: DocumentHistoryCommit) {
  clearTimeout(timerRef.current);
  pendingRef.current = null;
}

/**
 * Commits a document change and records history for its update mode. `setPast` updaters may run later than the call
 * (React defers them while other updates are queued), so every value they use is captured before they are queued.
 */
export function commitDocumentWithHistory(
  newDoc: CanvasDocument,
  mode: DocumentUpdateMode,
  commit: DocumentHistoryCommit,
) {
  const { docRef, pendingRef, timerRef, setDoc, setPast, setFuture } = commit;
  if (mode === 'snapshot') {
    clearPendingDocumentHistory(commit);
    const previous = docRef.current;
    setPast((items) => pushSnapshotHistory({ past: items, future: [] }, previous).past);
    setFuture([]);
    setDoc(newDoc);
    return;
  }

  if (mode === 'debounce') {
    pendingRef.current = createPendingHistoryEntry(docRef.current, pendingRef.current);
    setDoc(newDoc);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const pending = pendingRef.current;
      if (!pending) return;
      pendingRef.current = null;
      setPast((items) => flushPendingHistory({ past: items, future: [] }, pending).past);
      setFuture([]);
    }, HISTORY_DEBOUNCE_MS);
    return;
  }

  setDoc(newDoc);
}

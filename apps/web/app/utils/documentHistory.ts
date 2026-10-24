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

/**
 * The editor's document and its undo history. `pending` is the document a gesture started from while the gesture is
 * still running; it becomes one undo step when the gesture settles, or as soon as another history event needs it.
 */
export interface DocumentHistoryState extends HistoryStacks {
  doc: CanvasDocument;
  pending: HistoryEntry | null;
}

export type DocumentHistoryEvent =
  | { type: 'commit'; doc: CanvasDocument; mode: 'snapshot' | 'debounce' }
  /**
   * A write that keeps every visible result the same (asset references for embedded payloads, layout for nodes
   * that had none). `amend` applies the same change to every history entry, so undo and redo cannot bring the old
   * form back.
   */
  | { type: 'commit'; doc: CanvasDocument; mode: 'silent'; amend?: (doc: CanvasDocument) => CanvasDocument }
  | { type: 'settle' }
  | { type: 'undo' }
  | { type: 'redo' };

export function createDocumentHistoryState(doc: CanvasDocument): DocumentHistoryState {
  return { doc, past: [], future: [], pending: null };
}

/** Turns an unsettled gesture into its undo step. */
function settle(state: DocumentHistoryState): DocumentHistoryState {
  if (!state.pending) return state;
  return { ...state, ...flushPendingHistory(state, state.pending), pending: null };
}

function amendEntry(entry: HistoryEntry, amend: (doc: CanvasDocument) => CanvasDocument): HistoryEntry {
  const doc = amend(entry.doc);
  return doc === entry.doc ? entry : { doc };
}

function amendHistory(state: DocumentHistoryState, amend: (doc: CanvasDocument) => CanvasDocument) {
  return {
    past: state.past.map((entry) => amendEntry(entry, amend)),
    future: state.future.map((entry) => amendEntry(entry, amend)),
    pending: state.pending && amendEntry(state.pending, amend),
  };
}

export function documentHistoryReducer(state: DocumentHistoryState, event: DocumentHistoryEvent): DocumentHistoryState {
  switch (event.type) {
    case 'commit':
      if (event.mode === 'snapshot') {
        const settled = settle(state);
        return { ...settled, ...pushSnapshotHistory(settled, settled.doc), doc: event.doc };
      }
      if (event.mode === 'debounce') {
        if (state.pending) return { ...state, doc: event.doc };
        return { ...state, doc: event.doc, future: [], pending: createPendingHistoryEntry(state.doc, null) };
      }
      return {
        ...state,
        ...(event.mode === 'silent' && event.amend ? amendHistory(state, event.amend) : {}),
        doc: event.doc,
      };
    case 'settle':
      return settle(state);
    case 'undo':
    case 'redo': {
      const settled = settle(state);
      const navigate = event.type === 'undo' ? undoHistory : redoHistory;
      const result = navigate(settled, settled.doc);
      return result ? { ...result, pending: null } : settled;
    }
  }
}

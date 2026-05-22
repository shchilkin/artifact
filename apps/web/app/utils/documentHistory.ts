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

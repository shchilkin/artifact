import { useEffect, useMemo, useState } from 'react';

import type { CanvasDocument } from '../types/config';
import { type BrowserCapabilityReport, detectBrowserCapabilities } from '../utils/browserCapabilities';
import type { SavedProject } from '../utils/projectLibrary';
import {
  type DocumentSaveStatus,
  type EditorStorageSummary,
  type ProjectSaveState,
  type StorageEstimateSnapshot,
  summarizeEditorStorage,
} from '../utils/storageStatus';

interface BrowserStorageStatusOptions {
  doc: CanvasDocument;
  projects: SavedProject[];
  recoveryDraft: SavedProject | null;
  saveStatus: DocumentSaveStatus;
  projectSaveState: ProjectSaveState;
}

export interface BrowserStorageStatus {
  capabilities: BrowserCapabilityReport;
  online: boolean;
  storageEstimate: StorageEstimateSnapshot | null;
  summary: EditorStorageSummary;
}

const DEFAULT_CAPABILITIES: BrowserCapabilityReport = {
  localSave: 'limited',
  projectStorage: 'limited',
  canvas: 'limited',
  webgl: 'limited',
  downloads: 'limited',
  fileOpen: 'limited',
  offlineShell: 'limited',
};

/** Storage usage follows the document once an edit gesture has settled, not on every slider step. */
const STORAGE_SUMMARY_SETTLE_MS = 600;

/** `value`, updated once it has stopped changing for `delayMs`. */
function useSettledValue<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    if (Object.is(settled, value)) return;
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs, settled, value]);
  return settled;
}

function sameEstimate(a: StorageEstimateSnapshot | null, b: StorageEstimateSnapshot | null) {
  return a === b || (a !== null && b !== null && a.usage === b.usage && a.quota === b.quota);
}

export function useBrowserStorageStatus({
  doc,
  projects,
  recoveryDraft,
  saveStatus,
  projectSaveState,
}: BrowserStorageStatusOptions): BrowserStorageStatus {
  const [capabilities] = useState<BrowserCapabilityReport>(() =>
    typeof window === 'undefined' ? DEFAULT_CAPABILITIES : detectBrowserCapabilities(),
  );
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const [storageEstimate, setStorageEstimate] = useState<StorageEstimateSnapshot | null>(null);
  const settledDoc = useSettledValue(doc, STORAGE_SUMMARY_SETTLE_MS);

  useEffect(() => {
    function updateOnline() {
      setOnline(navigator.onLine);
    }

    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);
    return () => {
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOnline);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void navigator.storage
      ?.estimate?.()
      .then((estimate) => {
        if (!cancelled) setStorageEstimate((current) => (sameEstimate(current, estimate) ? current : estimate));
      })
      .catch(() => {
        if (!cancelled) setStorageEstimate(null);
      });
    return () => {
      cancelled = true;
    };
  }, [settledDoc, projects.length, recoveryDraft]);

  const summary = useMemo(
    () =>
      summarizeEditorStorage({
        doc: settledDoc,
        projects,
        recoveryDraft,
        estimate: storageEstimate,
        saveStatus,
        projectSaveState,
      }),
    [projects, projectSaveState, recoveryDraft, saveStatus, settledDoc, storageEstimate],
  );

  return { capabilities, online, storageEstimate, summary };
}

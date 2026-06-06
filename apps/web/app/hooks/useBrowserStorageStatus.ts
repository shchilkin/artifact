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
        if (!cancelled) setStorageEstimate(estimate);
      })
      .catch(() => {
        if (!cancelled) setStorageEstimate(null);
      });
    return () => {
      cancelled = true;
    };
  }, [doc, projects.length, recoveryDraft]);

  const summary = useMemo(
    () =>
      summarizeEditorStorage({
        doc,
        projects,
        recoveryDraft,
        estimate: storageEstimate,
        saveStatus,
        projectSaveState,
      }),
    [doc, projects, projectSaveState, recoveryDraft, saveStatus, storageEstimate],
  );

  return { capabilities, online, storageEstimate, summary };
}

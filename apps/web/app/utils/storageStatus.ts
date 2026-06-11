import type { CanvasDocument } from '../types/config';
import type { SavedProject } from './projectLibrary';

export type StoragePressure = 'unknown' | 'ok' | 'watch' | 'full';

export interface DocumentSaveStatus {
  ok: boolean;
  savedAt: string | null;
}

export type ProjectSaveState = 'saved' | 'unsaved' | 'untracked';

export interface StorageEstimateSnapshot {
  usage?: number;
  quota?: number;
}

export interface EditorStorageSummary {
  activeDocumentBytes: number;
  projectBytes: number;
  recoveryBytes: number;
  totalKnownBytes: number;
  estimateUsage: number | null;
  estimateQuota: number | null;
  pressure: StoragePressure;
  activeWorkState: ProjectSaveState | 'blocked';
  usageLabel: string;
  saveLabel: string;
  projectLabel: string;
  recoveryLabel: string | null;
}

function estimateJsonBytes(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
  } catch {
    return 0;
  }
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export function classifyStoragePressure(estimate: StorageEstimateSnapshot | null | undefined): StoragePressure {
  const usage = estimate?.usage;
  const quota = estimate?.quota;
  if (!Number.isFinite(usage) || !Number.isFinite(quota) || Number(quota) <= 0) return 'unknown';
  const ratio = usage / quota;
  if (ratio >= 0.92) return 'full';
  if (ratio >= 0.72) return 'watch';
  return 'ok';
}

export function projectSizeBytes(project: SavedProject): number {
  return estimateJsonBytes(project.doc) + estimateDataUrlLikeBytes(project.thumbnail);
}

export function summarizeEditorStorage({
  doc,
  projects,
  recoveryDraft,
  estimate,
  saveStatus,
  projectSaveState = 'untracked',
}: {
  doc: CanvasDocument;
  projects: SavedProject[];
  recoveryDraft: SavedProject | null;
  estimate?: StorageEstimateSnapshot | null;
  saveStatus: DocumentSaveStatus;
  projectSaveState?: ProjectSaveState;
}): EditorStorageSummary {
  const activeDocumentBytes = estimateJsonBytes(doc);
  const projectBytes = projects.reduce((total, project) => total + projectSizeBytes(project), 0);
  const recoveryBytes = recoveryDraft ? projectSizeBytes(recoveryDraft) : 0;
  const knownBytes = activeDocumentBytes + projectBytes + recoveryBytes;
  const estimateUsage = Number.isFinite(estimate?.usage) ? Number(estimate?.usage) : null;
  const estimateQuota = Number.isFinite(estimate?.quota) ? Number(estimate?.quota) : null;
  const pressure = classifyStoragePressure(estimate);
  const usageLabel =
    estimateUsage !== null && estimateQuota !== null
      ? `${formatBytes(estimateUsage)} / ${formatBytes(estimateQuota)}`
      : formatBytes(knownBytes);

  return {
    activeDocumentBytes,
    projectBytes,
    recoveryBytes,
    totalKnownBytes: knownBytes,
    estimateUsage,
    estimateQuota,
    pressure,
    activeWorkState: saveStatus.ok ? projectSaveState : 'blocked',
    usageLabel,
    saveLabel: activeWorkLabel(saveStatus, projectSaveState),
    projectLabel: `${projects.length} project${projects.length === 1 ? '' : 's'} / ${formatBytes(projectBytes)}`,
    recoveryLabel: recoveryDraft ? `Available / ${formatBytes(recoveryBytes)}` : null,
  };
}

function activeWorkLabel(saveStatus: DocumentSaveStatus, projectSaveState: ProjectSaveState) {
  if (!saveStatus.ok) return 'Autosave blocked';
  if (projectSaveState === 'saved') return 'Saved in project';
  if (projectSaveState === 'unsaved') return 'Unsaved changes';
  return 'Not saved as project';
}

function estimateDataUrlLikeBytes(value: string): number {
  const comma = value.indexOf(',');
  if (value.startsWith('data:') && comma !== -1) return Math.round((value.length - comma - 1) * 0.75);
  return estimateJsonBytes(value);
}

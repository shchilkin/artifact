import type { BrowserStorageStatus } from '../hooks/useBrowserStorageStatus';
import type { CapabilityState } from '../utils/browserCapabilities';

export type StatusTone = 'ok' | 'warning' | 'danger' | 'muted';
type ProjectStatusTone = 'ok' | 'warning' | 'danger';

export interface ProjectWorkspaceStatus {
  tone: ProjectStatusTone;
  badge: string | null;
  title: string;
}

export interface WorkspaceStatusRow {
  id: string;
  tone: StatusTone;
  label: string;
  value: string;
}

export interface StatusPillModel {
  id: string;
  tone: Exclude<StatusTone, 'muted'>;
  label: string;
}

export function getProjectWorkspaceStatus(
  status: BrowserStorageStatus,
  storageError: string | null,
): ProjectWorkspaceStatus {
  if (hasWorkspaceDanger(status, storageError)) {
    return { tone: 'danger', badge: 'WARN', title: 'Local workspace needs attention' };
  }
  if (status.summary.recoveryLabel) {
    return { tone: 'warning', badge: null, title: 'Recovery copy is available' };
  }
  if (status.summary.activeWorkState === 'unsaved') {
    return { tone: 'warning', badge: null, title: 'Unsaved project changes' };
  }
  if (hasWorkspaceWarning(status)) {
    return { tone: 'warning', badge: 'WARN', title: 'Local workspace has warnings' };
  }
  return { tone: 'ok', badge: null, title: 'Local workspace ready' };
}

export function workspaceStatusRows(status: BrowserStorageStatus, storageError: string | null): WorkspaceStatusRow[] {
  return [activeWorkRow(status, storageError), browserStorageRow(status), recoveryRow(status), offlineShellRow(status)];
}

export function workspaceWarnings(status: BrowserStorageStatus, storageError: string | null) {
  return [
    storageError,
    capabilityWarning(status.capabilities.localSave, 'Active saves are blocked'),
    capabilityWarning(status.capabilities.projectStorage, 'Project storage is unavailable'),
    capabilityWarning(status.capabilities.canvas, 'Canvas rendering is unavailable'),
    capabilityWarning(status.capabilities.webgl, '3D previews will use fallback rendering'),
    capabilityWarning(status.capabilities.downloads, 'Downloads may need browser support'),
    capabilityWarning(status.capabilities.fileOpen, 'File import may need browser support'),
  ].filter((warning): warning is string => Boolean(warning));
}

export function warningPills(status: BrowserStorageStatus, storageError: string | null): StatusPillModel[] {
  return [saveWarningPill(status, storageError), storagePressurePill(status), offlineStatusPill(status)].filter(
    (pill): pill is StatusPillModel => Boolean(pill),
  );
}

function hasWorkspaceDanger(status: BrowserStorageStatus, storageError: string | null) {
  return Boolean(storageError) || status.summary.activeWorkState === 'blocked' || status.summary.pressure === 'full';
}

function hasWorkspaceWarning(status: BrowserStorageStatus) {
  return (
    status.summary.activeWorkState === 'unsaved' ||
    status.summary.pressure === 'watch' ||
    workspaceWarnings(status, null).length > 0
  );
}

function activeWorkRow(status: BrowserStorageStatus, storageError: string | null): WorkspaceStatusRow {
  return {
    id: 'active-work',
    tone: activeWorkTone(status, storageError),
    label: 'Active work',
    value: storageError ? 'Needs attention' : status.summary.saveLabel,
  };
}

function browserStorageRow(status: BrowserStorageStatus): WorkspaceStatusRow {
  return {
    id: 'browser-storage',
    tone: pressureStatusTone(status.summary.pressure),
    label: 'Browser storage',
    value: status.summary.usageLabel,
  };
}

function recoveryRow(status: BrowserStorageStatus): WorkspaceStatusRow {
  return {
    id: 'recovery',
    tone: status.summary.recoveryLabel ? 'warning' : 'muted',
    label: 'Recovery copy',
    value: status.summary.recoveryLabel ?? 'None',
  };
}

function offlineShellRow(status: BrowserStorageStatus): WorkspaceStatusRow {
  const ready = status.capabilities.offlineShell === 'ready';
  return {
    id: 'app-shell',
    tone: ready ? 'ok' : 'muted',
    label: 'Offline app',
    value: ready ? 'Cached' : 'Not cached',
  };
}

function activeWorkTone(status: BrowserStorageStatus, storageError: string | null): StatusTone {
  if (storageError || status.summary.activeWorkState === 'blocked') return 'danger';
  if (status.summary.activeWorkState === 'saved') return 'ok';
  return status.summary.activeWorkState === 'unsaved' ? 'warning' : 'muted';
}

function saveWarningPill(status: BrowserStorageStatus, storageError: string | null): StatusPillModel | null {
  if (!storageError && status.summary.activeWorkState !== 'blocked') return null;
  return { id: 'save', tone: 'danger', label: storageError ? 'Storage needs attention' : status.summary.saveLabel };
}

function pressureStatusTone(pressure: BrowserStorageStatus['summary']['pressure']): StatusTone {
  if (pressure === 'full') return 'danger';
  if (pressure === 'watch') return 'warning';
  return 'ok';
}

function storagePressurePill(status: BrowserStorageStatus): StatusPillModel | null {
  const tone = pressureStatusTone(status.summary.pressure);
  if (tone === 'ok' || tone === 'muted') return null;
  return { id: 'storage', tone, label: `Storage ${status.summary.usageLabel}` };
}

function offlineStatusPill(status: BrowserStorageStatus): StatusPillModel | null {
  if (status.online) return null;
  return { id: 'online', tone: 'warning', label: 'Offline' };
}

function capabilityWarning(state: CapabilityState, message: string) {
  return state === 'ready' ? null : message;
}

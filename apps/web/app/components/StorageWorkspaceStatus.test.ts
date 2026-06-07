import { describe, expect, it } from 'vitest';

import type { BrowserStorageStatus } from '../hooks/useBrowserStorageStatus';
import { getProjectWorkspaceStatus, workspaceStatusRows, workspaceWarnings } from './StorageWorkspaceStatusModel';

const READY_CAPABILITIES = {
  localSave: 'ready',
  projectStorage: 'ready',
  canvas: 'ready',
  webgl: 'ready',
  downloads: 'ready',
  fileOpen: 'ready',
  offlineShell: 'ready',
} as const;

const BASE_STATUS: BrowserStorageStatus = {
  capabilities: READY_CAPABILITIES,
  online: true,
  storageEstimate: { usage: 2048, quota: 1024 * 1024 },
  summary: {
    activeDocumentBytes: 1024,
    projectBytes: 0,
    recoveryBytes: 0,
    totalKnownBytes: 1024,
    estimateUsage: 2048,
    estimateQuota: 1024 * 1024,
    pressure: 'ok',
    activeWorkState: 'saved',
    usageLabel: '2 KB / 1 MB',
    saveLabel: 'Saved in project',
    projectLabel: '0 saved',
    recoveryLabel: null,
  },
};

describe('StorageWorkspaceStatus helpers', () => {
  it.each([
    ['ready workspace', BASE_STATUS, null, { tone: 'ok', badge: null }],
    [
      'unsaved changes',
      withSummary({ activeWorkState: 'unsaved', saveLabel: 'Unsaved changes' }),
      null,
      {
        tone: 'warning',
        badge: null,
      },
    ],
    ['recovery copy', withSummary({ recoveryLabel: 'Available / 4 KB' }), null, { tone: 'warning', badge: null }],
    ['quota watch', withSummary({ pressure: 'watch' }), null, { tone: 'warning', badge: 'WARN' }],
    ['storage error', BASE_STATUS, 'Project storage is full', { tone: 'danger', badge: 'WARN' }],
    [
      'blocked save',
      withSummary({ activeWorkState: 'blocked', saveLabel: 'Autosave blocked' }),
      null,
      {
        tone: 'danger',
        badge: 'WARN',
      },
    ],
  ])('classifies the project marker for %s', (_label, status, storageError, expected) => {
    expect(getProjectWorkspaceStatus(status, storageError)).toMatchObject(expected);
  });

  it('builds workspace summary rows', () => {
    expect(workspaceStatusRows(withSummary({ recoveryLabel: 'Available / 4 KB' }), null)).toMatchObject([
      { id: 'active-work', tone: 'ok', label: 'Active work', value: 'Saved in project' },
      { id: 'browser-storage', tone: 'ok', label: 'Browser storage', value: '2 KB / 1 MB' },
      { id: 'recovery', tone: 'warning', label: 'Recovery copy', value: 'Available / 4 KB' },
      { id: 'app-shell', tone: 'ok', label: 'Offline app', value: 'Cached' },
    ]);
  });

  it('keeps untracked documents out of warning state', () => {
    expect(
      workspaceStatusRows(withSummary({ activeWorkState: 'untracked', saveLabel: 'Not saved as project' }), null)[0],
    ).toMatchObject({ id: 'active-work', tone: 'muted', label: 'Active work', value: 'Not saved as project' });
    expect(getProjectWorkspaceStatus(withSummary({ activeWorkState: 'untracked' }), null)).toMatchObject({
      tone: 'ok',
      badge: null,
    });
  });

  it('reports storage and capability warnings for the panel and warning strip', () => {
    const status = {
      ...BASE_STATUS,
      capabilities: {
        ...READY_CAPABILITIES,
        projectStorage: 'blocked',
        downloads: 'limited',
      },
    } satisfies BrowserStorageStatus;

    expect(workspaceWarnings(status, 'Storage quota reached')).toEqual([
      'Storage quota reached',
      'Project storage is unavailable',
      'Downloads may need browser support',
    ]);
  });
});

function withSummary(summary: Partial<BrowserStorageStatus['summary']>): BrowserStorageStatus {
  return { ...BASE_STATUS, summary: { ...BASE_STATUS.summary, ...summary } };
}

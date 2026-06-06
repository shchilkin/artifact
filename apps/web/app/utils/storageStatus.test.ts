import { describe, expect, it } from 'vitest';

import type { CanvasDocument } from '../types/config';
import type { SavedProject } from './projectLibrary';
import { classifyStoragePressure, formatBytes, projectSizeBytes, summarizeEditorStorage } from './storageStatus';

const doc = {
  global: { bg: '#000000', seed: 1, aspect: '1:1' },
  layers: [],
  export: { format: 'png', scale: 1, target: 'cover' },
} as CanvasDocument;

const project: SavedProject = {
  id: 'project-a',
  name: 'Project A',
  doc,
  thumbnail: 'data:image/png;base64,aaaa',
  createdAt: '2026-06-06T00:00:00.000Z',
  updatedAt: '2026-06-06T00:00:00.000Z',
};

describe('storageStatus', () => {
  it('formats compact storage sizes', () => {
    expect(formatBytes(0)).toBe('0 KB');
    expect(formatBytes(512)).toBe('1 KB');
    expect(formatBytes(2.5 * 1024 * 1024)).toBe('2.5 MB');
  });

  it('classifies browser quota pressure', () => {
    expect(classifyStoragePressure({ usage: 0, quota: 100 })).toBe('ok');
    expect(classifyStoragePressure({ usage: 10, quota: 100 })).toBe('ok');
    expect(classifyStoragePressure({ usage: 75, quota: 100 })).toBe('watch');
    expect(classifyStoragePressure({ usage: 94, quota: 100 })).toBe('full');
    expect(classifyStoragePressure(null)).toBe('unknown');
  });

  it('summarizes active document projects and recovery copy', () => {
    const summary = summarizeEditorStorage({
      doc,
      projects: [project],
      recoveryDraft: project,
      estimate: { usage: 1024 * 1024, quota: 4 * 1024 * 1024 },
      saveStatus: { ok: true, savedAt: '2026-06-06T00:00:00.000Z' },
      projectSaveState: 'saved',
    });

    expect(projectSizeBytes(project)).toBeGreaterThan(0);
    expect(summary.activeWorkState).toBe('saved');
    expect(summary.saveLabel).toBe('Snapshot saved');
    expect(summary.projectLabel).toContain('1 project');
    expect(summary.recoveryLabel).toContain('Available');
    expect(summary.pressure).toBe('ok');
    expect(summary.usageLabel).toBe('1.0 MB / 4.0 MB');
  });

  it('marks active work as unsaved until the current document matches a saved project', () => {
    const summary = summarizeEditorStorage({
      doc,
      projects: [project],
      recoveryDraft: null,
      saveStatus: { ok: true, savedAt: '2026-06-06T00:00:00.000Z' },
      projectSaveState: 'unsaved',
    });

    expect(summary.activeWorkState).toBe('unsaved');
    expect(summary.saveLabel).toBe('Unsaved changes');
  });

  it('surfaces blocked active saves', () => {
    const summary = summarizeEditorStorage({
      doc,
      projects: [],
      recoveryDraft: null,
      saveStatus: { ok: false, savedAt: null },
    });

    expect(summary.activeWorkState).toBe('blocked');
    expect(summary.saveLabel).toBe('Autosave blocked');
  });
});

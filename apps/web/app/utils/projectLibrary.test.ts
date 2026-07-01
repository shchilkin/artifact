import { describe, expect, it } from 'vitest';

import type { CanvasDocument } from '../types/config';
import {
  MAX_PROJECTS,
  normalizeSavedProjects,
  PROJECT_THUMBNAIL_FALLBACK,
  PROJECTS_STORAGE_KEY,
  persistSavedProjects,
  saveProjectSnapshot,
} from './projectLibrary';

const doc = {
  global: { bg: '#000000', seed: 1, aspect: '1:1' },
  layers: [],
  export: { format: 'png', scale: 1, target: 'cover' },
} as CanvasDocument;

function project(id: string, updatedAt: string) {
  return {
    id,
    name: id,
    doc,
    thumbnail: 'data:image/png;base64,xxx',
    createdAt: updatedAt,
    updatedAt,
  };
}

describe('projectLibrary', () => {
  it('normalizes saved projects and ignores invalid records', () => {
    const result = normalizeSavedProjects([
      project('old', '2024-01-01T00:00:00.000Z'),
      { id: 'bad' },
      project('new', '2025-01-01T00:00:00.000Z'),
    ]);

    expect(result.map((item) => item.id)).toEqual(['new', 'old']);
  });

  it('normalizes local and cloud project storage labels', () => {
    const result = normalizeSavedProjects([
      project('legacy-local', '2024-01-01T00:00:00.000Z'),
      { ...project('cloud', '2025-01-01T00:00:00.000Z'), storage: 'cloud' },
      { ...project('synced', '2026-01-01T00:00:00.000Z'), storage: 'synced' },
      { ...project('bad-storage', '2027-01-01T00:00:00.000Z'), storage: 'remote' },
    ]);

    expect(result.map((item) => [item.id, item.storage])).toEqual([
      ['bad-storage', 'local'],
      ['synced', 'synced'],
      ['cloud', 'cloud'],
      ['legacy-local', 'local'],
    ]);
  });

  it('normalizes the legacy green thumbnail fallback', () => {
    const legacyGreenFallback =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    const [result] = normalizeSavedProjects([
      { ...project('old-fallback', '2024-01-01T00:00:00.000Z'), thumbnail: legacyGreenFallback },
    ]);

    expect(result?.thumbnail).toBe(PROJECT_THUMBNAIL_FALLBACK);
  });

  it('keeps the newest snapshots within the storage limit', () => {
    const projects = Array.from({ length: MAX_PROJECTS }, (_, index) =>
      project(`p-${index}`, new Date(2024, 0, index + 1).toISOString()),
    );
    const next = saveProjectSnapshot(projects, project('latest', '2026-01-01T00:00:00.000Z'));

    expect(next).toHaveLength(MAX_PROJECTS);
    expect(next[0]?.id).toBe('latest');
    expect(next.some((item) => item.id === 'p-0')).toBe(false);
  });

  it('compacts thumbnails when project storage quota is exceeded', () => {
    const writes: string[] = [];
    const storage = {
      setItem: (key: string, value: string) => {
        expect(key).toBe(PROJECTS_STORAGE_KEY);
        writes.push(value);
        if (writes.length === 1) {
          const error = Object.assign(new Error('quota exceeded'), { name: 'QuotaExceededError' });
          throw error;
        }
      },
    };

    const result = persistSavedProjects(storage, [
      { ...project('large-a', '2026-01-01T00:00:00.000Z'), thumbnail: `data:image/jpeg;base64,${'x'.repeat(100)}` },
      { ...project('large-b', '2026-01-02T00:00:00.000Z'), thumbnail: `data:image/jpeg;base64,${'y'.repeat(100)}` },
    ]);

    expect(result.ok).toBe(true);
    expect(result.compacted).toBe(true);
    expect(result.projects.every((item) => item.thumbnail === PROJECT_THUMBNAIL_FALLBACK)).toBe(true);
    expect(writes).toHaveLength(2);
  });

  it('reports project storage failures without throwing', () => {
    const result = persistSavedProjects(
      {
        setItem: () => {
          throw Object.assign(new Error('quota exceeded'), { name: 'QuotaExceededError' });
        },
      },
      [project('too-large', '2026-01-01T00:00:00.000Z')],
    );

    expect(result.ok).toBe(false);
    expect(result.error).toContain('quota');
  });
});

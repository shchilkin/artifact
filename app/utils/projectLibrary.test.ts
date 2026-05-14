import { describe, expect, it } from 'vitest';

import type { CanvasDocument } from '../types/config';
import { MAX_PROJECTS, normalizeSavedProjects, saveProjectSnapshot } from './projectLibrary';

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

  it('keeps the newest snapshots within the storage limit', () => {
    const projects = Array.from({ length: MAX_PROJECTS }, (_, index) =>
      project(`p-${index}`, new Date(2024, 0, index + 1).toISOString()),
    );
    const next = saveProjectSnapshot(projects, project('latest', '2026-01-01T00:00:00.000Z'));

    expect(next).toHaveLength(MAX_PROJECTS);
    expect(next[0]?.id).toBe('latest');
    expect(next.some((item) => item.id === 'p-0')).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';

import { fillOnly } from '../test-fixtures/render/fixtures';
import { PROJECT_THUMBNAIL_FALLBACK } from '../utils/projectLibrary';
import { draftToProject, mergeProjectStorage, mergeProjects, mergeStoredProjectsWithCurrent } from './useProjects';

describe('project recovery draft mapping', () => {
  it('uses the rendered recovery thumbnail when one is available', () => {
    const project = draftToProject({
      reason: 'before-blank',
      savedAt: '2026-06-09T18:48:00.000Z',
      doc: fillOnly,
      thumbnail: 'data:image/webp;base64,recovery',
    });

    expect(project).toMatchObject({
      id: 'pre-blank-draft',
      name: 'Previous work',
      thumbnail: 'data:image/webp;base64,recovery',
      createdAt: '2026-06-09T18:48:00.000Z',
      updatedAt: '2026-06-09T18:48:00.000Z',
    });
  });

  it('falls back to the neutral placeholder for old drafts without thumbnails', () => {
    const project = draftToProject({
      reason: 'before-blank',
      savedAt: '2026-06-09T18:48:00.000Z',
      doc: fillOnly,
    });

    expect(project?.thumbnail).toBe(PROJECT_THUMBNAIL_FALLBACK);
  });
});

describe('project cloud merge state', () => {
  it('marks matching local and cloud projects as synced', () => {
    const local = savedProject('shared', '2026-06-28T10:00:00.000Z', 'local');
    const cloud = savedProject('shared', '2026-06-28T10:01:00.000Z', 'cloud');

    const [merged] = mergeProjects([local], [cloud]);

    expect(merged).toMatchObject({
      id: 'shared',
      name: 'Cloud shared',
      storage: 'synced',
      updatedAt: '2026-06-28T10:01:00.000Z',
    });
  });

  it('keeps the newest project data when cloud has an older copy', () => {
    const local = savedProject('shared', '2026-06-28T10:02:00.000Z', 'local');
    const cloud = savedProject('shared', '2026-06-28T10:01:00.000Z', 'cloud');

    const [merged] = mergeProjects([local], [cloud]);

    expect(merged).toMatchObject({
      id: 'shared',
      name: 'Local shared',
      storage: 'synced',
      updatedAt: '2026-06-28T10:02:00.000Z',
    });
  });

  it('treats cloud plus local as synced regardless of argument order', () => {
    expect(mergeProjectStorage('local', 'cloud')).toBe('synced');
    expect(mergeProjectStorage('cloud', 'local')).toBe('synced');
    expect(mergeProjectStorage('synced', 'local')).toBe('synced');
  });

  it('preserves cloud-only projects when local storage returns a fresh project list', () => {
    const local = savedProject('local-only', '2026-06-28T10:02:00.000Z', 'local');
    const cloud = savedProject('cloud-only', '2026-06-28T10:01:00.000Z', 'cloud');

    expect(mergeStoredProjectsWithCurrent([local], [cloud])).toMatchObject([
      { id: 'local-only', storage: 'local' },
      { id: 'cloud-only', storage: 'cloud' },
    ]);
  });
});

function savedProject(id: string, updatedAt: string, storage: 'local' | 'cloud') {
  return {
    id,
    name: `${storage === 'cloud' ? 'Cloud' : 'Local'} ${id}`,
    doc: fillOnly,
    thumbnail: PROJECT_THUMBNAIL_FALLBACK,
    createdAt: '2026-06-28T10:00:00.000Z',
    updatedAt,
    storage,
  };
}

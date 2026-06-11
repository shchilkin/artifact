import { describe, expect, it } from 'vitest';

import { fillOnly } from '../test-fixtures/render/fixtures';
import { PROJECT_THUMBNAIL_FALLBACK } from '../utils/projectLibrary';
import { draftToProject } from './useProjects';

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

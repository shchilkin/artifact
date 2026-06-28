import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { fillOnly } from '../test-fixtures/render/fixtures';
import { PROJECT_THUMBNAIL_FALLBACK, type ProjectStorageKind, type SavedProject } from '../utils/projectLibrary';
import { ProjectsList } from './ProjectsPanel';

describe('ProjectsList cloud storage affordances', () => {
  it('shows local/cloud/synced labels and upload action only for local projects', () => {
    const html = renderToStaticMarkup(
      <ProjectsList
        hasSavedItems
        projects={[
          project('local-project', 'Local Project', 'local'),
          project('cloud-project', 'Cloud Project', 'cloud'),
          project('synced-project', 'Synced Project', 'synced'),
        ]}
        activeProjectId={null}
        recoveryDraft={null}
        onDelete={vi.fn()}
        onDeleteRecoveryDraft={vi.fn()}
        onLoad={vi.fn()}
        onSaveToCloud={vi.fn()}
      />,
    );

    expect(html).toContain('LOCAL');
    expect(html).toContain('CLOUD');
    expect(html).toContain('SYNCED');
    expect(html).toContain('Save Local Project to cloud');
    expect(html).not.toContain('Save Cloud Project to cloud');
    expect(html).not.toContain('Save Synced Project to cloud');
  });
});

function project(id: string, name: string, storage: ProjectStorageKind): SavedProject {
  return {
    id,
    name,
    doc: fillOnly,
    thumbnail: PROJECT_THUMBNAIL_FALLBACK,
    createdAt: '2026-06-28T10:00:00.000Z',
    updatedAt: '2026-06-28T10:00:00.000Z',
    storage,
  };
}

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { ProjectCloudSyncState } from '../hooks/useProjects';
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

  it('shows in-flight and failed cloud sync states with clear actions', () => {
    const projectSyncStates: Record<string, ProjectCloudSyncState> = {
      'syncing-project': {
        phase: 'syncing',
        message: 'Uploading cloud copy',
        updatedAt: '2026-07-01T10:00:00.000Z',
      },
      'failed-project': {
        phase: 'failed',
        message: 'Cloud sync failed',
        updatedAt: '2026-07-01T10:01:00.000Z',
      },
      'large-project': {
        phase: 'too-large',
        message: 'Too large for cloud sync',
        updatedAt: '2026-07-01T10:02:00.000Z',
      },
    };

    const html = renderToStaticMarkup(
      <ProjectsList
        hasSavedItems
        projects={[
          project('syncing-project', 'Syncing Project', 'local'),
          project('failed-project', 'Failed Project', 'local'),
          project('large-project', 'Large Project', 'local'),
        ]}
        activeProjectId={null}
        projectSyncStates={projectSyncStates}
        recoveryDraft={null}
        onDelete={vi.fn()}
        onDeleteRecoveryDraft={vi.fn()}
        onLoad={vi.fn()}
        onSaveToCloud={vi.fn()}
      />,
    );

    expect(html).toContain('SYNCING');
    expect(html).toContain('Uploading cloud copy');
    expect(html).toContain('SYNC FAILED');
    expect(html).toContain('Cloud sync failed');
    expect(html).toContain('TOO LARGE');
    expect(html).toContain('Too large for cloud sync');
    expect(html).toContain('Retry cloud sync for Failed Project');
    expect(html).toContain('Retry cloud sync for Large Project');
    expect(html).toContain('disabled=""');
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

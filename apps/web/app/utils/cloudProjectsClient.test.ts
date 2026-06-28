import { describe, expect, it, vi } from 'vitest';

import { type CanvasDocument, makeImageLayer } from '../types/config';
import { listCloudProjects, prepareCloudSavedProject } from './cloudProjectsClient';
import { PROJECT_THUMBNAIL_FALLBACK, type SavedProject } from './projectLibrary';

describe('prepareCloudSavedProject', () => {
  it('hydrates local image assets into a portable cloud document', async () => {
    const doc: CanvasDocument = {
      global: { bg: '#101010', seed: 13, aspect: '1:1' },
      layers: [makeImageLayer('artifact-asset://cover-image', { id: 'image-layer' })],
      export: { format: 'png', scale: 1, target: 'cover' },
    };
    const project: SavedProject = {
      id: 'project-a',
      name: 'Cloud project',
      doc,
      thumbnail: PROJECT_THUMBNAIL_FALLBACK,
      createdAt: '2026-06-28T10:00:00.000Z',
      updatedAt: '2026-06-28T10:00:00.000Z',
    };
    const loadAssetDataUrl = vi.fn(async (src: string) =>
      src === 'artifact-asset://cover-image' ? 'data:image/png;base64,AAAA' : null,
    );

    const cloudProject = await prepareCloudSavedProject(project, { loadAssetDataUrl });

    expect(loadAssetDataUrl).toHaveBeenCalledWith('artifact-asset://cover-image');
    expect(cloudProject.doc.layers[0]).toMatchObject({
      id: 'image-layer',
      kind: 'image',
      src: 'data:image/png;base64,AAAA',
    });
    expect(cloudProject.storage).toBe(project.storage);
    expect(project.doc.layers[0]).toMatchObject({
      id: 'image-layer',
      kind: 'image',
      src: 'artifact-asset://cover-image',
    });
  });

  it('marks API project responses as cloud projects', async () => {
    const fetcher = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          projects: [
            {
              id: 'cloud-project',
              name: 'Cloud project',
              doc: {
                global: { bg: '#101010', seed: 13, aspect: '1:1' },
                layers: [],
                export: { format: 'png', scale: 1, target: 'cover' },
              },
              thumbnail: null,
              createdAt: '2026-06-28T10:00:00.000Z',
              updatedAt: '2026-06-28T10:00:00.000Z',
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });

    const [project] = await listCloudProjects({ fetcher });

    expect(project).toMatchObject({ id: 'cloud-project', storage: 'cloud' });
  });
});

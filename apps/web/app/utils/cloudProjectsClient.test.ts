import { describe, expect, it, vi } from 'vitest';

import { type CanvasDocument, makeImageLayer } from '../types/config';
import { listCloudProjects, prepareCloudSavedProject, saveCloudProject } from './cloudProjectsClient';
import { PROJECT_THUMBNAIL_FALLBACK, type SavedProject } from './projectLibrary';

describe('prepareCloudSavedProject', () => {
  it('uploads local image assets separately and keeps cloud project JSON lightweight', async () => {
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
    const fetcher = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          asset: {
            id: 'cloud-image',
            kind: 'image',
            uri: 'artifact-cloud-asset://image/cloud-image',
            mime: 'image/png',
            bytes: 3,
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });

    const cloudProject = await prepareCloudSavedProject(project, { loadAssetDataUrl, fetcher });

    expect(loadAssetDataUrl).toHaveBeenCalledWith('artifact-asset://cover-image');
    expect(fetcher).toHaveBeenCalledWith(
      '/api/project-assets',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('data:image/png;base64,AAAA'),
      }),
    );
    expect(cloudProject.doc.layers[0]).toMatchObject({
      id: 'image-layer',
      kind: 'image',
      src: 'artifact-cloud-asset://image/cloud-image',
    });
    expect(cloudProject.storage).toBe(project.storage);
    expect(project.doc.layers[0]).toMatchObject({
      id: 'image-layer',
      kind: 'image',
      src: 'artifact-asset://cover-image',
    });
  });

  it('keeps large portable image documents under the cloud project request limit', async () => {
    const largeImage = `data:image/png;base64,${'A'.repeat(2_850_000)}`;
    const doc: CanvasDocument = {
      global: { bg: '#101010', seed: 13, aspect: '1:1' },
      layers: [makeImageLayer(largeImage, { id: 'image-layer' })],
      export: { format: 'png', scale: 1, target: 'cover' },
    };
    const project: SavedProject = {
      id: 'large-project',
      name: 'Large cloud project',
      doc,
      thumbnail: PROJECT_THUMBNAIL_FALLBACK,
      createdAt: '2026-06-28T10:00:00.000Z',
      updatedAt: '2026-06-28T10:00:00.000Z',
    };
    const projectBodyBytes: number[] = [];
    const assetBodyBytes: number[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = input.toString();
      if (path === '/api/project-assets') {
        const body = init?.body?.toString() ?? '';
        assetBodyBytes.push(new TextEncoder().encode(body).byteLength);
        return new Response(
          JSON.stringify({
            asset: {
              id: 'cloud-image',
              kind: 'image',
              uri: 'artifact-cloud-asset://image/cloud-image',
              mime: 'image/png',
              bytes: largeImage.length,
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (path === '/api/projects') {
        const body = init?.body?.toString() ?? '';
        projectBodyBytes.push(new TextEncoder().encode(body).byteLength);
        expect(body).not.toContain('data:image/png;base64');
        const request = JSON.parse(body);
        return new Response(
          JSON.stringify({
            project: {
              id: request.id,
              name: request.name,
              doc: request.doc,
              thumbnail: request.thumbnail,
              createdAt: project.createdAt,
              updatedAt: project.updatedAt,
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    const cloudProject = await prepareCloudSavedProject(project, { fetcher });
    const savedProject = await saveCloudProject(cloudProject, { fetcher });

    expect(assetBodyBytes[0]).toBeGreaterThan(2_850_000);
    expect(projectBodyBytes[0]).toBeLessThan(5 * 1024 * 1024);
    expect(savedProject.doc.layers[0]).toMatchObject({
      id: 'image-layer',
      kind: 'image',
      src: 'artifact-cloud-asset://image/cloud-image',
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

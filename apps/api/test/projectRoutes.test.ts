import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import type { RequestUserResolution } from '../src/auth.js';
import { InMemoryApiStore } from '../src/db/memory.js';
import { handleProjectRequest, type ProjectRouteDeps } from '../src/routes/projects.js';

function createDeps(
  auth: RequestUserResolution = { authenticated: true, user: { id: 'user-1', email: 'me@example.com' } },
) {
  const store = new InMemoryApiStore();
  const deps: ProjectRouteDeps = {
    repositories: store.repositories(),
    resolveAuth: async () => auth,
    createId: () => 'project-1',
  };
  return { deps, store };
}

function jsonRequest(method: string, url: string, body?: unknown) {
  const stream = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
  return Object.assign(stream, { headers: {}, method, url });
}

const projectDoc = {
  schemaVersion: 2,
  global: { background: 'transparent', seed: 1, aspect: '1:1' },
  layers: [],
  export: { width: 1200, height: 1200, format: 'png' },
};

function projectDocWithCloudAsset(assetId: string) {
  return {
    ...projectDoc,
    layers: [{ id: 'image-layer', kind: 'image', src: `artifact-cloud-asset://image/${assetId}` }],
  };
}

async function createProjectAsset(store: InMemoryApiStore, id: string, userId = 'user-1') {
  return store.repositories().assets.create({
    id,
    userId,
    kind: 'project-image',
    storageKey: `generated/${id}.png`,
    mimeType: 'image/png',
    width: 1,
    height: 1,
    sizeBytes: 4,
    metadataJson: { projectAssetKind: 'image' },
  });
}

describe('project route handlers', () => {
  it('rejects cloud project access for anonymous users', async () => {
    const { deps } = createDeps({ authenticated: false, reason: 'missing_credentials' });

    await expect(handleProjectRequest(jsonRequest('GET', '/api/projects'), deps)).resolves.toMatchObject({
      status: 401,
      body: { code: 'unauthenticated' },
    });
  });

  it('saves and lists cloud projects for the authenticated user', async () => {
    const { deps, store } = createDeps();

    await expect(
      handleProjectRequest(
        jsonRequest('POST', '/api/projects', {
          name: 'Cloud cover',
          doc: projectDoc,
          thumbnail: 'data:image/png;base64,a',
        }),
        deps,
      ),
    ).resolves.toMatchObject({
      status: 200,
      body: {
        project: {
          id: 'project-1',
          name: 'Cloud cover',
          thumbnail: 'data:image/png;base64,a',
        },
      },
    });

    await expect(store.findById('user-1')).resolves.toMatchObject({ email: 'me@example.com' });
    await expect(handleProjectRequest(jsonRequest('GET', '/api/projects'), deps)).resolves.toMatchObject({
      status: 200,
      body: {
        projects: [{ id: 'project-1', name: 'Cloud cover' }],
      },
    });
  });

  it('updates an existing cloud project owned by the authenticated user', async () => {
    const { deps } = createDeps();
    await handleProjectRequest(
      jsonRequest('POST', '/api/projects', { id: 'project-1', name: 'First', doc: projectDoc }),
      deps,
    );

    await expect(
      handleProjectRequest(
        jsonRequest('POST', '/api/projects', { id: 'project-1', name: 'Updated', doc: projectDoc }),
        deps,
      ),
    ).resolves.toMatchObject({
      status: 200,
      body: { project: { id: 'project-1', name: 'Updated' } },
    });

    await expect(handleProjectRequest(jsonRequest('GET', '/api/projects'), deps)).resolves.toMatchObject({
      status: 200,
      body: { projects: [{ id: 'project-1', name: 'Updated' }] },
    });
  });

  it('soft-deletes project assets that are no longer referenced after an update', async () => {
    const { deps, store } = createDeps();
    await createProjectAsset(store, 'asset-old');

    await handleProjectRequest(
      jsonRequest('POST', '/api/projects', {
        id: 'project-1',
        name: 'First',
        doc: projectDocWithCloudAsset('asset-old'),
      }),
      deps,
    );
    await createProjectAsset(store, 'asset-new');

    await expect(
      handleProjectRequest(
        jsonRequest('POST', '/api/projects', {
          id: 'project-1',
          name: 'Updated',
          doc: projectDocWithCloudAsset('asset-new'),
        }),
        deps,
      ),
    ).resolves.toMatchObject({ status: 200 });

    await expect(store.findAssetByIdForUser('asset-old', 'user-1')).resolves.toMatchObject({
      deleted_at: expect.any(Date),
    });
    await expect(store.findAssetByIdForUser('asset-new', 'user-1')).resolves.toMatchObject({
      deleted_at: null,
    });
  });

  it('returns a conflict when another user owns the requested project id', async () => {
    const { deps, store } = createDeps();
    await store.repositories().projects.upsert({
      id: 'project-1',
      userId: 'user-2',
      name: 'Other user project',
      docJson: projectDoc,
      thumbnail: null,
    });

    await expect(
      handleProjectRequest(
        jsonRequest('POST', '/api/projects', { id: 'project-1', name: 'Collision', doc: projectDoc }),
        deps,
      ),
    ).resolves.toMatchObject({
      status: 409,
      body: { code: 'project_id_conflict' },
    });
  });

  it('deletes only projects owned by the authenticated user', async () => {
    const { deps, store } = createDeps();
    await handleProjectRequest(
      jsonRequest('POST', '/api/projects', { id: 'project-1', name: 'One', doc: projectDoc }),
      deps,
    );
    await store.repositories().users.upsertFromAuth({ id: 'user-2', email: 'them@example.com' });
    await store.repositories().projects.upsert({
      id: 'project-2',
      userId: 'user-2',
      name: 'Other user project',
      docJson: projectDoc,
      thumbnail: null,
    });

    await expect(handleProjectRequest(jsonRequest('DELETE', '/api/projects/project-1'), deps)).resolves.toMatchObject({
      status: 200,
      body: { ok: true },
    });
    await expect(handleProjectRequest(jsonRequest('DELETE', '/api/projects/project-2'), deps)).resolves.toMatchObject({
      status: 404,
      body: { code: 'not_found' },
    });
    await expect(handleProjectRequest(jsonRequest('DELETE', '/api/projects/project-1'), deps)).resolves.toMatchObject({
      status: 404,
      body: { code: 'not_found' },
    });
    await expect(store.repositories().projects.listForUser('user-2')).resolves.toMatchObject([
      { id: 'project-2', name: 'Other user project' },
    ]);
  });

  it('soft-deletes project assets when their cloud project is deleted', async () => {
    const { deps, store } = createDeps();
    await createProjectAsset(store, 'asset-1');
    await handleProjectRequest(
      jsonRequest('POST', '/api/projects', {
        id: 'project-1',
        name: 'One',
        doc: projectDocWithCloudAsset('asset-1'),
      }),
      deps,
    );

    await expect(store.findAssetByIdForUser('asset-1', 'user-1')).resolves.toMatchObject({ deleted_at: null });

    await expect(handleProjectRequest(jsonRequest('DELETE', '/api/projects/project-1'), deps)).resolves.toMatchObject({
      status: 200,
      body: { ok: true },
    });
    await expect(store.findAssetByIdForUser('asset-1', 'user-1')).resolves.toMatchObject({
      deleted_at: expect.any(Date),
    });
  });

  it('rejects cloud project saves without a document object', async () => {
    const { deps } = createDeps();

    await expect(
      handleProjectRequest(jsonRequest('POST', '/api/projects', { id: 'bad', name: 'Broken', doc: null }), deps),
    ).resolves.toMatchObject({
      status: 400,
      body: { code: 'invalid_request' },
    });
  });

  it('rejects project saves that exceed the sync body limit', async () => {
    const { deps } = createDeps();

    await expect(
      handleProjectRequest(
        jsonRequest('POST', '/api/projects', {
          id: 'too-large',
          name: 'Too large',
          doc: projectDoc,
          thumbnail: `data:image/png;base64,${'a'.repeat(5 * 1024 * 1024)}`,
        }),
        deps,
      ),
    ).resolves.toMatchObject({
      status: 413,
      body: { code: 'payload_too_large' },
    });
  });
});

import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import type { RequestUserResolution } from '../src/auth.js';
import { InMemoryApiStore } from '../src/db/memory.js';
import { handleProjectAssetRequest, type ProjectAssetRouteDeps } from '../src/routes/projectAssets.js';
import type { AssetStorage } from '../src/storage/index.js';

function createDeps(
  auth: RequestUserResolution = { authenticated: true, user: { id: 'user-1', email: 'me@example.com' } },
) {
  const store = new InMemoryApiStore();
  const storage: AssetStorage = {
    writeImage: vi.fn(async ({ assetId, bytes, mimeType }) => ({
      storageKey: `project-assets/${assetId}.bin`,
      mimeType,
      sizeBytes: bytes.byteLength,
    })),
    readImage: vi.fn(),
    deleteImage: vi.fn(),
  };
  const deps: ProjectAssetRouteDeps = {
    repositories: store.repositories(),
    storage,
    resolveAuth: async () => auth,
    createId: () => 'asset-1',
  };
  return { deps, store, storage };
}

function jsonRequest(method: string, url: string, body?: unknown) {
  const stream = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
  return Object.assign(stream, { headers: {}, method, url });
}

describe('project asset route handlers', () => {
  it('uploads project assets separately from cloud project JSON', async () => {
    const { deps, store, storage } = createDeps();

    await expect(
      handleProjectAssetRequest(
        jsonRequest('POST', '/api/project-assets', {
          kind: 'image',
          dataUrl: 'data:image/png;base64,AAAA',
          label: 'Cover',
        }),
        deps,
      ),
    ).resolves.toMatchObject({
      status: 200,
      body: {
        asset: {
          id: 'asset-1',
          kind: 'image',
          uri: 'artifact-cloud-asset://image/asset-1',
          mime: 'image/png',
        },
      },
    });
    expect(storage.writeImage).toHaveBeenCalledWith({
      assetId: 'asset-1',
      bytes: expect.any(Uint8Array),
      mimeType: 'image/png',
    });
    await expect(store.findAssetByIdForUser('asset-1', 'user-1')).resolves.toMatchObject({
      kind: 'project-image',
      storage_key: 'project-assets/asset-1.bin',
      metadata_json: { label: 'Cover', projectAssetKind: 'image' },
    });
  });

  it('requires auth before uploading project assets', async () => {
    const { deps } = createDeps({ authenticated: false, reason: 'missing_credentials' });

    await expect(
      handleProjectAssetRequest(
        jsonRequest('POST', '/api/project-assets', {
          kind: 'image',
          dataUrl: 'data:image/png;base64,AAAA',
        }),
        deps,
      ),
    ).resolves.toMatchObject({
      status: 401,
      body: { code: 'unauthenticated' },
    });
  });
});

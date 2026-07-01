import { describe, expect, it, vi } from 'vitest';
import type { RequestUserResolution } from '../src/auth.js';
import { InMemoryApiStore } from '../src/db/memory.js';
import { type AssetRouteDeps, handleAssetFileRequest } from '../src/routes/assets.js';
import type { AssetStorage } from '../src/storage/index.js';

function createDeps(auth: RequestUserResolution = { authenticated: true, user: { id: 'user-1' } }) {
  const store = new InMemoryApiStore();
  const storage: AssetStorage = {
    writeImage: vi.fn(),
    readImage: vi.fn(async (storageKey: string) =>
      storageKey === 'generated/asset-1.png' ? { bytes: new Uint8Array([1, 2, 3]), mimeType: 'image/png' } : null,
    ),
    deleteImage: vi.fn(),
  };
  const deps: AssetRouteDeps = {
    repositories: store.repositories(),
    storage,
    resolveAuth: async () => auth,
  };
  return { deps, storage, store };
}

describe('asset route handlers', () => {
  it('returns generated asset bytes for the owner', async () => {
    const { deps, storage, store } = createDeps();
    store.seedUser({ id: 'user-1', email: 'me@example.com', aiEnabled: true });
    await store.createAsset({
      id: 'asset-1',
      userId: 'user-1',
      kind: 'generated-image',
      storageKey: 'generated/asset-1.png',
      mimeType: 'image/png',
      width: 1024,
      height: 1024,
      sizeBytes: 3,
      metadataJson: {},
    });

    const response = await handleAssetFileRequest({ headers: {} }, 'asset-1', deps);

    expect(response).toMatchObject({
      status: 200,
      headers: {
        'cache-control': 'private, max-age=300',
        'content-length': '3',
        'content-type': 'image/png',
      },
    });
    expect('bytes' in response ? Array.from(response.bytes) : []).toEqual([1, 2, 3]);
    expect(storage.readImage).toHaveBeenCalledWith('generated/asset-1.png');
  });

  it('serves SVG assets with defensive download headers', async () => {
    const { deps, store, storage } = createDeps();
    store.seedUser({ id: 'user-1', email: 'me@example.com', aiEnabled: true });
    await store.createAsset({
      id: 'asset-svg',
      userId: 'user-1',
      kind: 'project-image',
      storageKey: 'generated/asset-svg.svg',
      mimeType: 'image/svg+xml',
      width: 1,
      height: 1,
      sizeBytes: 11,
      metadataJson: {},
    });
    vi.mocked(storage.readImage).mockResolvedValueOnce({
      bytes: new TextEncoder().encode('<svg></svg>'),
      mimeType: 'image/svg+xml',
    });

    const response = await handleAssetFileRequest({ headers: {} }, 'asset-svg', deps);

    expect(response).toMatchObject({
      status: 200,
      headers: {
        'content-disposition': 'attachment',
        'content-security-policy': "default-src 'none'; sandbox",
        'content-type': 'image/svg+xml',
        'x-content-type-options': 'nosniff',
      },
    });
  });

  it('rejects anonymous asset downloads', async () => {
    const { deps } = createDeps({ authenticated: false, reason: 'missing_credentials' });

    await expect(handleAssetFileRequest({ headers: {} }, 'asset-1', deps)).resolves.toMatchObject({
      status: 401,
      body: { code: 'unauthenticated' },
    });
  });

  it('returns not found when the asset is missing or belongs to another user', async () => {
    const { deps, store } = createDeps();
    store.seedUser({ id: 'user-1', email: 'me@example.com', aiEnabled: true });
    await store.createAsset({
      id: 'asset-1',
      userId: 'user-2',
      kind: 'generated-image',
      storageKey: 'generated/asset-1.png',
      mimeType: 'image/png',
      width: 1024,
      height: 1024,
      sizeBytes: 3,
      metadataJson: {},
    });

    await expect(handleAssetFileRequest({ headers: {} }, 'asset-1', deps)).resolves.toMatchObject({
      status: 404,
      body: { code: 'not_found' },
    });
  });

  it('returns a storage-specific error when the asset record exists but bytes are gone', async () => {
    const { deps, store } = createDeps();
    store.seedUser({ id: 'user-1', email: 'me@example.com', aiEnabled: true });
    await store.createAsset({
      id: 'asset-2',
      userId: 'user-1',
      kind: 'generated-image',
      storageKey: 'generated/missing.png',
      mimeType: 'image/png',
      width: 1024,
      height: 1024,
      sizeBytes: 3,
      metadataJson: {},
    });

    await expect(handleAssetFileRequest({ headers: {} }, 'asset-2', deps)).resolves.toMatchObject({
      status: 404,
      body: { code: 'asset_file_missing' },
    });
  });
});

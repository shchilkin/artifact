import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import type { RequestUserResolution } from '../src/auth.js';
import { InMemoryApiStore } from '../src/db/memory.js';
import { handleAssetRequest } from '../src/routes/assets.js';
import { handleProjectAssetRequest } from '../src/routes/projectAssets.js';
import { handleProjectRequest } from '../src/routes/projects.js';
import type { AssetStorage } from '../src/storage/index.js';

const auth: RequestUserResolution = {
  authenticated: true,
  user: { id: 'user-1', email: 'me@example.com' },
};

function createDeps() {
  const store = new InMemoryApiStore();
  const files = new Map<string, { bytes: Uint8Array; mimeType: string }>();
  const storage: AssetStorage = {
    writeImage: vi.fn(async ({ assetId, bytes, mimeType }) => {
      const storageKey = `project-assets/${assetId}.png`;
      files.set(storageKey, { bytes, mimeType });
      return {
        storageKey,
        mimeType,
        sizeBytes: bytes.byteLength,
      };
    }),
    readImage: vi.fn(async (storageKey) => files.get(storageKey) ?? null),
    deleteImage: vi.fn(),
  };
  const repositories = store.repositories();
  return {
    deps: {
      repositories,
      storage,
      resolveAuth: async () => auth,
      createId: idSequence('asset-'),
    },
    projectDeps: {
      repositories,
      resolveAuth: async () => auth,
      createId: () => 'project-1',
    },
    store,
    storage,
  };
}

function idSequence(prefix: string) {
  let index = 0;
  return () => `${prefix}${++index}`;
}

function jsonRequest(method: string, url: string, body?: unknown) {
  const stream = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
  return Object.assign(stream, { headers: {}, method, url });
}

function request(method: string, url: string) {
  return { headers: {}, method, url };
}

describe('cloud project asset sync integration', () => {
  it('stores a large project asset separately and saves a lightweight cloud project manifest', async () => {
    const { deps, projectDeps, storage } = createDeps();
    const largeImage = `data:image/png;base64,${'A'.repeat(2_850_000)}`;

    const assetResponse = await handleProjectAssetRequest(
      jsonRequest('POST', '/api/project-assets', {
        kind: 'image',
        dataUrl: largeImage,
        label: 'Large cover',
      }),
      deps,
    );

    expect(assetResponse).toMatchObject({
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

    const doc = {
      schemaVersion: 2,
      global: { background: 'transparent', seed: 1, aspect: '1:1' },
      layers: [
        {
          id: 'image-layer',
          kind: 'image',
          src: 'artifact-cloud-asset://image/asset-1',
        },
      ],
      export: { width: 1200, height: 1200, format: 'png' },
    };
    const manifestBody = {
      id: 'project-1',
      name: 'Large cloud project',
      doc,
      thumbnail: null,
    };

    expect(Buffer.byteLength(JSON.stringify(manifestBody))).toBeLessThan(5 * 1024 * 1024);

    await expect(
      handleProjectRequest(jsonRequest('POST', '/api/projects', manifestBody), projectDeps),
    ).resolves.toMatchObject({
      status: 200,
      body: {
        project: {
          id: 'project-1',
          doc,
        },
      },
    });

    await expect(handleProjectRequest(jsonRequest('GET', '/api/projects'), projectDeps)).resolves.toMatchObject({
      status: 200,
      body: {
        projects: [
          {
            id: 'project-1',
            doc,
          },
        ],
      },
    });

    const downloadResponse = await handleAssetRequest(request('GET', '/api/assets/asset-1/file'), deps);
    expect(downloadResponse).toMatchObject({
      status: 200,
      headers: {
        'cache-control': 'private, max-age=300',
        'content-type': 'image/png',
      },
    });
    expect('bytes' in downloadResponse! ? downloadResponse.bytes.byteLength : 0).toBeGreaterThan(2_000_000);
    expect(storage.writeImage).toHaveBeenCalledWith({
      assetId: 'asset-1',
      bytes: expect.any(Uint8Array),
      mimeType: 'image/png',
    });
  });
});

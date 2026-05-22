import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { LocalAssetStorage } from '../src/storage/index.js';

let tempDir: string | null = null;

afterEach(async () => {
  if (tempDir) await rm(tempDir, { recursive: true, force: true });
  tempDir = null;
});

describe('LocalAssetStorage', () => {
  it('writes and reads generated image bytes', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'artifact-api-storage-'));
    const storage = new LocalAssetStorage(tempDir);

    const written = await storage.writeImage({
      assetId: 'asset-1',
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: 'image/png',
    });
    const read = await storage.readImage(written.storageKey);

    expect(written).toEqual({
      storageKey: 'generated/asset-1.png',
      mimeType: 'image/png',
      sizeBytes: 3,
    });
    expect(read?.mimeType).toBe('image/png');
    expect(Array.from(read?.bytes ?? [])).toEqual([1, 2, 3]);
  });

  it('lists generated image storage keys', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'artifact-api-storage-'));
    const storage = new LocalAssetStorage(tempDir);

    await storage.writeImage({
      assetId: 'asset-b',
      bytes: new Uint8Array([2]),
      mimeType: 'image/png',
    });
    await storage.writeImage({
      assetId: 'asset-a',
      bytes: new Uint8Array([1]),
      mimeType: 'image/webp',
    });

    await expect(storage.listGeneratedImageKeys()).resolves.toEqual([
      'generated/asset-a.webp',
      'generated/asset-b.png',
    ]);
  });
});

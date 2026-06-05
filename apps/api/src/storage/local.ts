import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import type { AssetStorage, StoredAssetFile } from './types.js';

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/svg+xml': 'svg',
  'image/webp': 'webp',
};

function extensionForMime(mimeType: string) {
  return EXTENSIONS[mimeType] ?? 'bin';
}

export class LocalAssetStorage implements AssetStorage {
  constructor(private readonly rootDir: string) {}

  async writeImage(input: { assetId: string; bytes: Uint8Array; mimeType: string }): Promise<StoredAssetFile> {
    const storageKey = `generated/${input.assetId}.${extensionForMime(input.mimeType)}`;
    const filePath = join(this.rootDir, storageKey);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, input.bytes);
    return {
      storageKey,
      mimeType: input.mimeType,
      sizeBytes: input.bytes.byteLength,
    };
  }

  async readImage(storageKey: string): Promise<{ bytes: Uint8Array; mimeType: string } | null> {
    try {
      const bytes = await readFile(join(this.rootDir, storageKey));
      return { bytes, mimeType: mimeTypeFromStorageKey(storageKey) };
    } catch {
      return null;
    }
  }

  // fallow-ignore-next-line unused-class-member
  async deleteImage(storageKey: string): Promise<void> {
    await rm(join(this.rootDir, storageKey), { force: true });
  }

  async listGeneratedImageKeys(): Promise<string[]> {
    const generatedDir = join(this.rootDir, 'generated');
    const keys: string[] = [];
    await collectFiles(generatedDir, keys, this.rootDir);
    return keys.sort();
  }
}

async function collectFiles(dir: string, keys: string[], rootDir: string): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      await collectFiles(path, keys, rootDir);
    } else if (entry.isFile()) {
      keys.push(relative(rootDir, path).split(sep).join('/'));
    }
  }
}

function mimeTypeFromStorageKey(storageKey: string) {
  if (storageKey.endsWith('.jpg') || storageKey.endsWith('.jpeg')) return 'image/jpeg';
  if (storageKey.endsWith('.png')) return 'image/png';
  if (storageKey.endsWith('.svg')) return 'image/svg+xml';
  if (storageKey.endsWith('.webp')) return 'image/webp';
  return 'application/octet-stream';
}

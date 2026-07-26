import type { CanvasDocument } from '../types/config';
import { mapDocumentImageSources } from './documentSourceMapping';
import { openIndexedDatabase, requestToPromise, withIndexedDbStore } from './indexedDb';
import { blobToBase64DataUrl, dataUrlMime, estimateDataUrlBytes, randomStorageId } from './storagePrimitives';

const DB_NAME = 'artifact-local-assets';
const DB_VERSION = 1;
const IMAGE_STORE = 'images';
const ASSET_URI_PREFIX = 'artifact-asset://';

interface StoredImageAsset {
  id: string;
  dataUrl: string;
  mime: string;
  bytes: number;
  createdAt: string;
}

function openDatabase(): Promise<IDBDatabase> {
  return openIndexedDatabase({
    name: DB_NAME,
    version: DB_VERSION,
    openErrorMessage: 'Unable to open asset database',
    upgrade: (db) => {
      if (!db.objectStoreNames.contains(IMAGE_STORE)) db.createObjectStore(IMAGE_STORE, { keyPath: 'id' });
    },
  });
}

async function withImageStore<T>(
  mode: IDBTransactionMode,
  read: (store: IDBObjectStore) => Promise<T> | T,
): Promise<T> {
  return withIndexedDbStore(openDatabase, IMAGE_STORE, mode, read);
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  if (!blob.type.startsWith('image/')) throw new Error('Only image blobs can be stored as image assets');
  return blobToBase64DataUrl(blob);
}

export function isImageDataUrl(src: string) {
  return src.startsWith('data:image/');
}

export function isAssetUri(src: string) {
  return src.startsWith(ASSET_URI_PREFIX);
}

function assetIdFromUri(src: string) {
  return isAssetUri(src) ? src.slice(ASSET_URI_PREFIX.length) : null;
}

function assetUriFromId(id: string) {
  return `${ASSET_URI_PREFIX}${id}`;
}

export async function saveImageAsset(dataUrl: string): Promise<string> {
  if (!isImageDataUrl(dataUrl)) return dataUrl;

  const asset: StoredImageAsset = {
    id: randomStorageId(),
    dataUrl,
    mime: dataUrlMime(dataUrl),
    bytes: estimateDataUrlBytes(dataUrl),
    createdAt: new Date().toISOString(),
  };

  await withImageStore('readwrite', (store) => {
    store.put(asset);
  });
  return assetUriFromId(asset.id);
}

export async function saveImageBlobAsset(blob: Blob): Promise<string> {
  return saveImageAsset(await blobToDataUrl(blob));
}

async function loadImageAssetDataUrl(src: string): Promise<string | null> {
  const id = assetIdFromUri(src);
  if (!id) return src;

  const asset = await withImageStore('readonly', (store) =>
    requestToPromise<StoredImageAsset | undefined>(store.get(id)),
  );
  return asset?.dataUrl ?? null;
}

export async function resolveImageSource(src: string): Promise<string | null> {
  return isAssetUri(src) ? loadImageAssetDataUrl(src) : src;
}

export interface StoreDocumentImageAssetOptions {
  saveAssetDataUrl?: typeof saveImageAsset;
}

export async function storeDocumentImageAssets(
  doc: CanvasDocument,
  options: StoreDocumentImageAssetOptions = {},
): Promise<CanvasDocument> {
  const saveAssetDataUrl = options.saveAssetDataUrl ?? saveImageAsset;
  const storedSrcByDataUrl = new Map<string, string>();
  return mapDocumentImageSources(doc, async (source) => {
    if (!isImageDataUrl(source)) return source;
    const cached = storedSrcByDataUrl.get(source);
    if (cached) return cached;
    const stored = await saveAssetDataUrl(source);
    storedSrcByDataUrl.set(source, stored);
    return stored;
  });
}

export interface HydrateDocumentImageAssetOptions {
  loadAssetDataUrl?: typeof loadImageAssetDataUrl;
}

export async function hydrateDocumentImageAssets(
  doc: CanvasDocument,
  options: HydrateDocumentImageAssetOptions = {},
): Promise<CanvasDocument> {
  const loadAssetDataUrl = options.loadAssetDataUrl ?? loadImageAssetDataUrl;
  const loadedSrcByAsset = new Map<string, string | null>();
  return mapDocumentImageSources(doc, async (source) => {
    if (!isAssetUri(source)) return source;
    if (loadedSrcByAsset.has(source)) return loadedSrcByAsset.get(source) ?? source;
    const loaded = await loadAssetDataUrl(source);
    loadedSrcByAsset.set(source, loaded);
    return loaded ?? source;
  });
}

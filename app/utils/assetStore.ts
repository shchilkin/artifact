import type { CanvasDocument, ImageLayer, Layer } from '../types/config';

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

function hasIndexedDb() {
  return typeof indexedDB !== 'undefined';
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
  });
}

function openDatabase(): Promise<IDBDatabase> {
  if (!hasIndexedDb()) return Promise.reject(new Error('IndexedDB is unavailable'));

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IMAGE_STORE)) db.createObjectStore(IMAGE_STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Unable to open asset database'));
  });
}

async function withImageStore<T>(
  mode: IDBTransactionMode,
  read: (store: IDBObjectStore) => Promise<T> | T,
): Promise<T> {
  const db = await openDatabase();
  try {
    const transaction = db.transaction(IMAGE_STORE, mode);
    const done = transactionDone(transaction);
    const store = transaction.objectStore(IMAGE_STORE);
    const result = await read(store);
    await done;
    return result;
  } finally {
    db.close();
  }
}

function randomId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function dataUrlMime(dataUrl: string) {
  return /^data:([^;,]+)[;,]/.exec(dataUrl)?.[1] ?? 'application/octet-stream';
}

function estimateDataUrlBytes(dataUrl: string) {
  const comma = dataUrl.indexOf(',');
  if (comma === -1) return dataUrl.length;
  return Math.round((dataUrl.length - comma - 1) * 0.75);
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  if (!blob.type.startsWith('image/')) throw new Error('Only image blobs can be stored as image assets');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.slice(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return `data:${blob.type};base64,${btoa(binary)}`;
}

export function isImageDataUrl(src: string) {
  return src.startsWith('data:image/');
}

export function isAssetUri(src: string) {
  return src.startsWith(ASSET_URI_PREFIX);
}

export function assetIdFromUri(src: string) {
  return isAssetUri(src) ? src.slice(ASSET_URI_PREFIX.length) : null;
}

export function assetUriFromId(id: string) {
  return `${ASSET_URI_PREFIX}${id}`;
}

export async function saveImageAsset(dataUrl: string): Promise<string> {
  if (!isImageDataUrl(dataUrl)) return dataUrl;

  const asset: StoredImageAsset = {
    id: randomId(),
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

export async function loadImageAssetDataUrl(src: string): Promise<string | null> {
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

export async function storeDocumentImageAssets(doc: CanvasDocument): Promise<CanvasDocument> {
  let changed = false;
  const layers: Layer[] = [];

  for (const layer of doc.layers) {
    if (layer.kind !== 'image' || !isImageDataUrl(layer.src)) {
      layers.push(layer);
      continue;
    }

    const src = await saveImageAsset(layer.src);
    changed ||= src !== layer.src;
    layers.push({ ...layer, src } satisfies ImageLayer);
  }

  return changed ? { ...doc, layers } : doc;
}

export interface HydrateDocumentImageAssetOptions {
  loadAssetDataUrl?: typeof loadImageAssetDataUrl;
}

export async function hydrateDocumentImageAssets(
  doc: CanvasDocument,
  options: HydrateDocumentImageAssetOptions = {},
): Promise<CanvasDocument> {
  let changed = false;
  const layers: Layer[] = [];
  const loadAssetDataUrl = options.loadAssetDataUrl ?? loadImageAssetDataUrl;

  for (const layer of doc.layers) {
    if (layer.kind !== 'image' || !isAssetUri(layer.src)) {
      layers.push(layer);
      continue;
    }

    const src = await loadAssetDataUrl(layer.src);
    if (src) {
      changed = true;
      layers.push({ ...layer, src } satisfies ImageLayer);
    } else {
      layers.push(layer);
    }
  }

  return changed ? { ...doc, layers } : doc;
}

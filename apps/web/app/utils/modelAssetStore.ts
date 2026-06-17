import type { CanvasDocument, ModelLayer, PortableModelAsset } from '../types/config';
import { openIndexedDatabase, requestToPromise, withIndexedDbStore } from './indexedDb';
import { estimateDataUrlBytes, randomStorageId } from './storagePrimitives';

const DB_NAME = 'artifact-local-model-assets';
const DB_VERSION = 1;
const MODEL_STORE = 'models';
const MODEL_URI_PREFIX = 'artifact-model://';
const GLB_MIME = 'model/gltf-binary';
const GLB_FILE_RE = /\.glb$/i;

export type StoredModelAsset = PortableModelAsset;

function openDatabase(): Promise<IDBDatabase> {
  return openIndexedDatabase({
    name: DB_NAME,
    version: DB_VERSION,
    openErrorMessage: 'Unable to open model asset database',
    upgrade: (db) => {
      if (!db.objectStoreNames.contains(MODEL_STORE)) db.createObjectStore(MODEL_STORE, { keyPath: 'id' });
    },
  });
}

async function withModelStore<T>(
  mode: IDBTransactionMode,
  read: (store: IDBObjectStore) => Promise<T> | T,
): Promise<T> {
  return withIndexedDbStore(openDatabase, MODEL_STORE, mode, read);
}

function dataUrlMime(dataUrl: string) {
  return /^data:([^;,]+)[;,]/.exec(dataUrl)?.[1] ?? GLB_MIME;
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.slice(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return `data:${blob.type || GLB_MIME};base64,${btoa(binary)}`;
}

export function isSupportedModelFile(file: File) {
  return file.type === GLB_MIME || GLB_FILE_RE.test(file.name);
}

export function isModelDataUrl(src: string) {
  return src.startsWith(`data:${GLB_MIME}`) || src.startsWith('data:application/octet-stream');
}

export function isModelUri(src: string) {
  return src.startsWith(MODEL_URI_PREFIX);
}

function modelIdFromUri(src: string) {
  return isModelUri(src) ? src.slice(MODEL_URI_PREFIX.length) : null;
}

export function modelUriFromId(id: string) {
  return `${MODEL_URI_PREFIX}${id}`;
}

async function saveModelAsset(asset: Omit<PortableModelAsset, 'id' | 'createdAt'>): Promise<StoredModelAsset> {
  const stored: StoredModelAsset = {
    ...asset,
    id: randomStorageId(),
    createdAt: new Date().toISOString(),
  };
  await withModelStore('readwrite', (store) => {
    store.put(stored);
  });
  return stored;
}

async function saveModelDataUrlAsset(dataUrl: string, label = 'Imported model'): Promise<StoredModelAsset> {
  return saveModelAsset({
    dataUrl,
    mime: dataUrlMime(dataUrl),
    bytes: estimateDataUrlBytes(dataUrl),
    label,
  });
}

export async function saveModelFileAsset(file: File): Promise<StoredModelAsset> {
  return saveModelDataUrlAsset(await blobToDataUrl(file), file.name || 'Imported model');
}

async function loadModelAsset(src: string): Promise<StoredModelAsset | null> {
  const id = modelIdFromUri(src);
  if (!id) return null;
  const asset = await withModelStore('readonly', (store) =>
    requestToPromise<StoredModelAsset | undefined>(store.get(id)),
  );
  return asset ?? null;
}

export async function resolveModelSource(src: string): Promise<string | null> {
  if (!isModelUri(src)) return src;
  return (await loadModelAsset(src))?.dataUrl ?? null;
}

export interface StoreDocumentModelAssetOptions {
  saveModelDataUrl?: typeof saveModelDataUrlAsset;
}

export async function storeDocumentModelAssets(
  doc: CanvasDocument,
  options: StoreDocumentModelAssetOptions = {},
): Promise<CanvasDocument> {
  const saveModelDataUrl = options.saveModelDataUrl ?? saveModelDataUrlAsset;
  const storedSrcByDataUrl = new Map<string, string>();
  return mapDocumentModelSources(doc, async (source, layer) => {
    if (!isModelDataUrl(source)) return source;
    const cached = storedSrcByDataUrl.get(source);
    if (cached) return cached;
    const stored = await saveModelDataUrl(source, layer.modelName);
    const storedRef = modelUriFromId(stored.id);
    storedSrcByDataUrl.set(source, storedRef);
    return storedRef;
  });
}

export interface HydrateDocumentModelAssetOptions {
  loadModelAsset?: typeof loadModelAsset;
}

export async function hydrateDocumentModelAssets(
  doc: CanvasDocument,
  options: HydrateDocumentModelAssetOptions = {},
): Promise<CanvasDocument> {
  const loadAsset = options.loadModelAsset ?? loadModelAsset;
  const loadedSrcByModel = new Map<string, StoredModelAsset | null>();
  let changed = false;
  const layers = await Promise.all(
    doc.layers.map(async (layer) => {
      if (layer.kind !== 'model' || !isModelUri(layer.modelSrc)) return layer;
      if (!loadedSrcByModel.has(layer.modelSrc)) loadedSrcByModel.set(layer.modelSrc, await loadAsset(layer.modelSrc));
      const loaded = loadedSrcByModel.get(layer.modelSrc);
      if (!loaded) return layer;
      changed = true;
      return {
        ...layer,
        modelSrc: loaded.dataUrl,
        modelName: loaded.label,
        modelMime: loaded.mime,
        modelBytes: loaded.bytes,
      } satisfies ModelLayer;
    }),
  );
  const existingAssets = doc.modelAssets ?? [];
  const hydratedAssets = Array.from(loadedSrcByModel.values()).filter((asset): asset is StoredModelAsset =>
    Boolean(asset),
  );
  const assetsById = new Map([...existingAssets, ...hydratedAssets].map((asset) => [asset.id, asset]));
  const modelAssets = Array.from(assetsById.values());
  return changed || modelAssets.length !== existingAssets.length
    ? { ...doc, layers, ...(modelAssets.length > 0 ? { modelAssets } : {}) }
    : doc;
}

export interface StorePortableModelAssetOptions {
  saveModelAsset?: typeof saveModelAsset;
}

export async function storePortableModelAssets(
  doc: CanvasDocument,
  options: StorePortableModelAssetOptions = {},
): Promise<CanvasDocument> {
  const saveAsset = options.saveModelAsset ?? saveModelAsset;
  if (!doc.modelAssets?.length) return doc;
  const refsByDataUrl = new Map<string, string>();
  for (const asset of doc.modelAssets) {
    const stored = await saveAsset({
      dataUrl: asset.dataUrl,
      mime: asset.mime,
      bytes: asset.bytes,
      label: asset.label,
    });
    refsByDataUrl.set(asset.dataUrl, modelUriFromId(stored.id));
  }
  const storedDoc = await mapDocumentModelSources(doc, async (source) => refsByDataUrl.get(source) ?? source);
  return stripDocumentModelAssets(storedDoc);
}

export function stripDocumentModelAssets(doc: CanvasDocument): CanvasDocument {
  if (!doc.modelAssets) return doc;
  const { modelAssets, ...rest } = doc;
  void modelAssets;
  return rest;
}

async function mapDocumentModelSources(
  doc: CanvasDocument,
  mapSource: (source: string, layer: ModelLayer) => Promise<string>,
): Promise<CanvasDocument> {
  let changed = false;
  const layers = await Promise.all(
    doc.layers.map(async (layer) => {
      if (layer.kind !== 'model') return layer;
      const modelSrc = await mapSource(layer.modelSrc, layer);
      changed ||= modelSrc !== layer.modelSrc;
      return modelSrc === layer.modelSrc ? layer : ({ ...layer, modelSrc } satisfies ModelLayer);
    }),
  );
  return changed ? { ...doc, layers } : doc;
}

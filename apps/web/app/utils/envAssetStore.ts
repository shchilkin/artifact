import type { CanvasDocument, GraphEnvironmentNode, GraphScene3DNode, PortableEnvironmentAsset } from '../types/config';
import { openIndexedDatabase, requestToPromise, withIndexedDbStore } from './indexedDb';
import { estimateDataUrlBytes, randomStorageId } from './storagePrimitives';

const DB_NAME = 'artifact-local-environment-assets';
const DB_VERSION = 1;
const ENV_STORE = 'environments';
const ENV_URI_PREFIX = 'artifact-env://';
const EXR_MIME = 'image/x-exr';
const HDR_MIME = 'image/vnd.radiance';
const ENV_FILE_RE = /\.(exr|hdr)$/i;

export type StoredEnvironmentAsset = PortableEnvironmentAsset;

function openDatabase(): Promise<IDBDatabase> {
  return openIndexedDatabase({
    name: DB_NAME,
    version: DB_VERSION,
    openErrorMessage: 'Unable to open environment asset database',
    upgrade: (db) => {
      if (!db.objectStoreNames.contains(ENV_STORE)) db.createObjectStore(ENV_STORE, { keyPath: 'id' });
    },
  });
}

async function withEnvironmentStore<T>(
  mode: IDBTransactionMode,
  read: (store: IDBObjectStore) => Promise<T> | T,
): Promise<T> {
  return withIndexedDbStore(openDatabase, ENV_STORE, mode, read);
}

function dataUrlMime(dataUrl: string) {
  return /^data:([^;,]+)[;,]/.exec(dataUrl)?.[1] ?? EXR_MIME;
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.slice(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return `data:${blob.type || EXR_MIME};base64,${btoa(binary)}`;
}

export function isSupportedEnvironmentFile(file: File) {
  return file.type === EXR_MIME || file.type === HDR_MIME || ENV_FILE_RE.test(file.name);
}

export function isEnvironmentDataUrl(src: string) {
  return (
    src.startsWith(`data:${EXR_MIME}`) ||
    src.startsWith(`data:${HDR_MIME}`) ||
    src.startsWith('data:application/octet-stream')
  );
}

export function isEnvironmentUri(src: string) {
  return src.startsWith(ENV_URI_PREFIX);
}

function environmentIdFromUri(src: string) {
  return isEnvironmentUri(src) ? src.slice(ENV_URI_PREFIX.length) : null;
}

export function environmentUriFromId(id: string) {
  return `${ENV_URI_PREFIX}${id}`;
}

async function saveEnvironmentAsset(
  asset: Omit<PortableEnvironmentAsset, 'id' | 'createdAt'>,
): Promise<StoredEnvironmentAsset> {
  const stored: StoredEnvironmentAsset = {
    ...asset,
    id: randomStorageId(),
    createdAt: new Date().toISOString(),
  };
  await withEnvironmentStore('readwrite', (store) => {
    store.put(stored);
  });
  return stored;
}

async function saveEnvironmentDataUrlAsset(
  dataUrl: string,
  label = 'Imported environment',
): Promise<StoredEnvironmentAsset> {
  return saveEnvironmentAsset({
    dataUrl,
    mime: dataUrlMime(dataUrl),
    bytes: estimateDataUrlBytes(dataUrl),
    label,
  });
}

export async function saveEnvironmentFileAsset(file: File): Promise<StoredEnvironmentAsset> {
  return saveEnvironmentDataUrlAsset(await blobToDataUrl(file), file.name || 'Imported environment');
}

async function loadEnvironmentAsset(src: string): Promise<StoredEnvironmentAsset | null> {
  const id = environmentIdFromUri(src);
  if (!id) return null;
  const asset = await withEnvironmentStore('readonly', (store) =>
    requestToPromise<StoredEnvironmentAsset | undefined>(store.get(id)),
  );
  return asset ?? null;
}

export async function resolveEnvironmentSource(src: string): Promise<string | null> {
  if (!isEnvironmentUri(src)) return src;
  return (await loadEnvironmentAsset(src))?.dataUrl ?? null;
}

export interface StoreDocumentEnvironmentAssetOptions {
  saveEnvironmentDataUrl?: typeof saveEnvironmentDataUrlAsset;
}

export async function storeDocumentEnvironmentAssets(
  doc: CanvasDocument,
  options: StoreDocumentEnvironmentAssetOptions = {},
): Promise<CanvasDocument> {
  const saveEnvironmentDataUrl = options.saveEnvironmentDataUrl ?? saveEnvironmentDataUrlAsset;
  const storedSrcByDataUrl = new Map<string, string>();
  return mapDocumentEnvironmentSources(doc, async (source, node) => {
    if (!isEnvironmentDataUrl(source)) return source;
    const cached = storedSrcByDataUrl.get(source);
    if (cached) return cached;
    const stored = await saveEnvironmentDataUrl(source, node.environmentName || 'Imported environment');
    const storedRef = environmentUriFromId(stored.id);
    storedSrcByDataUrl.set(source, storedRef);
    return storedRef;
  });
}

export interface HydrateDocumentEnvironmentAssetOptions {
  loadEnvironmentAsset?: typeof loadEnvironmentAsset;
}

export async function hydrateDocumentEnvironmentAssets(
  doc: CanvasDocument,
  options: HydrateDocumentEnvironmentAssetOptions = {},
): Promise<CanvasDocument> {
  const loadAsset = options.loadEnvironmentAsset ?? loadEnvironmentAsset;
  const loadedSrcByEnvironment = new Map<string, StoredEnvironmentAsset | null>();
  let changed = false;
  const graph = doc.graph;
  if (!graph?.environmentNodes?.length && !graph?.scene3dNodes?.length) return doc;
  const environmentNodes = await Promise.all(
    (graph.environmentNodes ?? []).map(async (node) => {
      if (!isEnvironmentUri(node.environmentSrc)) return node;
      if (!loadedSrcByEnvironment.has(node.environmentSrc)) {
        loadedSrcByEnvironment.set(node.environmentSrc, await loadAsset(node.environmentSrc));
      }
      const loaded = loadedSrcByEnvironment.get(node.environmentSrc);
      if (!loaded) return node;
      changed = true;
      return {
        ...node,
        environmentSrc: loaded.dataUrl,
        environmentName: loaded.label,
        environmentMime: loaded.mime,
        environmentBytes: loaded.bytes,
      } satisfies GraphEnvironmentNode;
    }),
  );
  const scene3dNodes = await Promise.all(
    (graph.scene3dNodes ?? []).map(async (node) => {
      if (!isEnvironmentUri(node.environmentSrc)) return node;
      if (!loadedSrcByEnvironment.has(node.environmentSrc)) {
        loadedSrcByEnvironment.set(node.environmentSrc, await loadAsset(node.environmentSrc));
      }
      const loaded = loadedSrcByEnvironment.get(node.environmentSrc);
      if (!loaded) return node;
      changed = true;
      return {
        ...node,
        environmentSrc: loaded.dataUrl,
        environmentName: loaded.label,
        environmentMime: loaded.mime,
        environmentBytes: loaded.bytes,
      } satisfies GraphScene3DNode;
    }),
  );
  const existingAssets = doc.envAssets ?? [];
  const hydratedAssets = Array.from(loadedSrcByEnvironment.values()).filter((asset): asset is StoredEnvironmentAsset =>
    Boolean(asset),
  );
  const assetsById = new Map([...existingAssets, ...hydratedAssets].map((asset) => [asset.id, asset]));
  const envAssets = Array.from(assetsById.values());
  return changed || envAssets.length !== existingAssets.length
    ? { ...doc, graph: { ...graph, environmentNodes, scene3dNodes }, ...(envAssets.length > 0 ? { envAssets } : {}) }
    : doc;
}

export interface StorePortableEnvironmentAssetOptions {
  saveEnvironmentAsset?: typeof saveEnvironmentAsset;
}

export async function storePortableEnvironmentAssets(
  doc: CanvasDocument,
  options: StorePortableEnvironmentAssetOptions = {},
): Promise<CanvasDocument> {
  const saveAsset = options.saveEnvironmentAsset ?? saveEnvironmentAsset;
  if (!doc.envAssets?.length) return doc;
  const refsByDataUrl = new Map<string, string>();
  for (const asset of doc.envAssets) {
    const stored = await saveAsset({
      dataUrl: asset.dataUrl,
      mime: asset.mime,
      bytes: asset.bytes,
      label: asset.label,
    });
    refsByDataUrl.set(asset.dataUrl, environmentUriFromId(stored.id));
  }
  const storedDoc = await mapDocumentEnvironmentSources(doc, async (source) => refsByDataUrl.get(source) ?? source);
  return stripDocumentEnvironmentAssets(storedDoc);
}

export function stripDocumentEnvironmentAssets(doc: CanvasDocument): CanvasDocument {
  if (!doc.envAssets) return doc;
  const { envAssets, ...rest } = doc;
  void envAssets;
  return rest;
}

async function mapDocumentEnvironmentSources(
  doc: CanvasDocument,
  mapSource: (source: string, node: GraphEnvironmentNode | GraphScene3DNode) => Promise<string>,
): Promise<CanvasDocument> {
  const graph = doc.graph;
  if (!graph?.environmentNodes?.length && !graph?.scene3dNodes?.length) return doc;
  let changed = false;
  const environmentNodes = await Promise.all(
    (graph.environmentNodes ?? []).map(async (node) => {
      if (!node.environmentSrc) return node;
      const environmentSrc = await mapSource(node.environmentSrc, node);
      changed ||= environmentSrc !== node.environmentSrc;
      return environmentSrc === node.environmentSrc
        ? node
        : ({ ...node, environmentSrc } satisfies GraphEnvironmentNode);
    }),
  );
  const scene3dNodes = await Promise.all(
    (graph.scene3dNodes ?? []).map(async (node) => {
      if (!node.environmentSrc) return node;
      const environmentSrc = await mapSource(node.environmentSrc, node);
      changed ||= environmentSrc !== node.environmentSrc;
      return environmentSrc === node.environmentSrc ? node : ({ ...node, environmentSrc } satisfies GraphScene3DNode);
    }),
  );
  return changed ? { ...doc, graph: { ...graph, environmentNodes, scene3dNodes } } : doc;
}

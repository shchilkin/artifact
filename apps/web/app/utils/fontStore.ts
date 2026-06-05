import type { CanvasDocument, PortableFontAsset } from '../types/config';
import {
  createGoogleFontAssetMetadata,
  createGoogleFontRequest,
  parseGoogleFontFaces,
  pickGoogleFontFace,
} from './googleFonts';
import { openIndexedDatabase, requestToPromise, withIndexedDbStore } from './indexedDb';
import { estimateDataUrlBytes, randomStorageId } from './storagePrimitives';

const DB_NAME = 'artifact-local-fonts';
const DB_VERSION = 1;
const FONT_STORE = 'fonts';
const FONT_URI_PREFIX = 'artifact-font://';
const FONT_FILE_RE = /\.(otf|ttf|woff2?)$/i;
const SUPPORTED_FONT_MIME = new Set([
  'font/otf',
  'font/ttf',
  'font/woff',
  'font/woff2',
  'application/font-woff',
  'application/font-woff2',
  'application/vnd.ms-fontobject',
  'application/x-font-otf',
  'application/x-font-ttf',
  'application/x-font-woff',
  'application/x-font-woff2',
]);

export interface ImportedFontAsset extends PortableFontAsset {
  sourceName?: string;
}

const metadataCache = new Map<string, ImportedFontAsset>();
const loadedFontFaces = new Set<string>();

function openDatabase(): Promise<IDBDatabase> {
  return openIndexedDatabase({
    name: DB_NAME,
    version: DB_VERSION,
    openErrorMessage: 'Unable to open font database',
    upgrade: (db) => {
      if (!db.objectStoreNames.contains(FONT_STORE)) db.createObjectStore(FONT_STORE, { keyPath: 'id' });
    },
  });
}

async function withFontStore<T>(mode: IDBTransactionMode, read: (store: IDBObjectStore) => Promise<T> | T): Promise<T> {
  return withIndexedDbStore(openDatabase, FONT_STORE, mode, read);
}

function extensionMime(name: string) {
  const extension = name.toLowerCase().split('.').pop();
  if (extension === 'woff2') return 'font/woff2';
  if (extension === 'woff') return 'font/woff';
  if (extension === 'otf') return 'font/otf';
  if (extension === 'ttf') return 'font/ttf';
  return 'application/octet-stream';
}

const FONT_LABEL_NOISE = new Set([
  'variablefont',
  'wght',
  'wdth',
  'opsz',
  'ital',
  'slnt',
  'thin',
  'extralight',
  'ultralight',
  'light',
  'regular',
  'medium',
  'semibold',
  'demibold',
  'bold',
  'extrabold',
  'ultrabold',
  'black',
  'heavy',
  'italic',
  'oblique',
]);

export function normalizeImportedFontLabel(name: string) {
  const cleaned =
    name
      .replace(FONT_FILE_RE, '')
      .replaceAll(/variablefont/gi, ' ')
      .replaceAll(/([a-z])([A-Z])/g, '$1 $2')
      .replaceAll(/[_-]+/g, ' ')
      .replaceAll(/\s+/g, ' ')
      .trim() || 'Imported Font';
  const tokens = cleaned.split(' ');
  const familyTokens = tokens.filter((token) => {
    const normalized = token.toLowerCase().replaceAll(/[^a-z0-9]+/g, '');
    if (/^\d+pt$/.test(normalized)) return false;
    return !FONT_LABEL_NOISE.has(normalized);
  });
  return familyTokens.length > 0 ? familyTokens.join(' ') : cleaned;
}

function familyForId(id: string) {
  return `Artifact Imported ${id.replaceAll(/[^a-zA-Z0-9]+/g, ' ').trim()}`;
}

function fileToDataUrl(file: File): Promise<string> {
  return blobToDataUrl(file);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(typeof event.target?.result === 'string' ? event.target.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('Could not read font file'));
    reader.readAsDataURL(blob);
  });
}

export function isFontUri(font: string): font is `artifact-font://${string}` {
  return font.startsWith(FONT_URI_PREFIX);
}

export function fontIdFromUri(font: string) {
  return isFontUri(font) ? font.slice(FONT_URI_PREFIX.length) : null;
}

export function fontUriFromId(id: string) {
  return `${FONT_URI_PREFIX}${id}` as const;
}

function isSupportedFontFile(file: File) {
  return FONT_FILE_RE.test(file.name) || SUPPORTED_FONT_MIME.has(file.type);
}

export async function saveImportedFontFile(file: File): Promise<ImportedFontAsset> {
  if (!isSupportedFontFile(file)) throw new Error('Unsupported font file');
  const id = randomStorageId();
  const dataUrl = await fileToDataUrl(file);
  const asset: ImportedFontAsset = {
    id,
    dataUrl,
    mime: file.type || extensionMime(file.name),
    bytes: file.size || estimateDataUrlBytes(dataUrl),
    label: normalizeImportedFontLabel(file.name),
    family: familyForId(id),
    createdAt: new Date().toISOString(),
    source: 'local-file',
    sourceName: file.name,
    embeddingPolicy: 'user-confirmed-required',
  };
  await saveImportedFontAsset(asset);
  return asset;
}

export async function saveGoogleFontFamily(input: string): Promise<ImportedFontAsset> {
  const request = createGoogleFontRequest(input);
  if (!request) throw new Error('Unsupported Google Fonts request');

  const cssResponse = await fetch(request.cssUrl);
  if (!cssResponse.ok) throw new Error('Could not load Google Fonts stylesheet');
  const face = pickGoogleFontFace(parseGoogleFontFaces(await cssResponse.text()));
  if (!face) throw new Error('Could not find a Google Fonts face');

  const fontResponse = await fetch(face.fontUrl);
  if (!fontResponse.ok) throw new Error('Could not download Google font file');
  const fontBlob = await fontResponse.blob();
  const id = `google-${request.family
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}-${randomStorageId()}`;
  const asset = createGoogleFontAssetMetadata({
    id,
    family: request.family,
    request,
    face,
    dataUrl: await blobToDataUrl(fontBlob),
    bytes: fontBlob.size,
  });

  await saveImportedFontAsset(asset);
  return asset;
}

async function saveImportedFontAsset(asset: ImportedFontAsset | PortableFontAsset): Promise<ImportedFontAsset> {
  const stored: ImportedFontAsset = {
    sourceName: asset.label,
    ...asset,
    family: asset.family || familyForId(asset.id),
    label: normalizeImportedFontLabel(
      asset.source === 'google-fonts' ? asset.label : asset.sourceName || asset.label || 'Imported Font',
    ),
    bytes: asset.bytes || estimateDataUrlBytes(asset.dataUrl),
    mime: asset.mime || 'application/octet-stream',
    createdAt: asset.createdAt || new Date().toISOString(),
    source: asset.source || 'local-file',
    embeddingPolicy: asset.embeddingPolicy || 'user-confirmed-required',
  };
  await withFontStore('readwrite', (store) => {
    store.put(stored);
  });
  metadataCache.set(stored.id, stored);
  return stored;
}

export async function loadImportedFontAsset(font: string): Promise<ImportedFontAsset | null> {
  const id = fontIdFromUri(font);
  if (!id) return null;
  const cached = metadataCache.get(id);
  if (cached) return cached;
  const asset = await withFontStore('readonly', (store) =>
    requestToPromise<ImportedFontAsset | undefined>(store.get(id)),
  );
  if (asset) metadataCache.set(id, asset);
  return asset ?? null;
}

export async function listImportedFonts(): Promise<ImportedFontAsset[]> {
  const fonts = await withFontStore('readonly', (store) =>
    'getAll' in store ? requestToPromise<ImportedFontAsset[]>(store.getAll()) : Promise.resolve([]),
  );
  for (const font of fonts) metadataCache.set(font.id, font);
  return fonts.sort((a, b) => a.label.localeCompare(b.label));
}

export function getCachedImportedFont(font: string): ImportedFontAsset | null {
  const id = fontIdFromUri(font);
  return id ? (metadataCache.get(id) ?? null) : null;
}

export async function ensureImportedFontLoaded(font: string): Promise<ImportedFontAsset | null> {
  const asset = await loadImportedFontAsset(font);
  if (!asset) return null;
  if (loadedFontFaces.has(asset.id)) return asset;
  if (typeof FontFace === 'undefined' || typeof document === 'undefined' || !('fonts' in document)) return asset;

  try {
    const face = new FontFace(asset.family, `url(${asset.dataUrl})`);
    await face.load();
    document.fonts.add(face);
    loadedFontFaces.add(asset.id);
  } catch {
    // Imported font rendering should degrade to the fallback stack instead of
    // blocking preview/export.
  }
  return asset;
}

export function collectDocumentFontRefs(doc: CanvasDocument): string[] {
  return Array.from(new Set(doc.layers.filter((layer) => layer.kind === 'text').map((layer) => layer.font)));
}

export interface HydrateDocumentFontAssetOptions {
  loadFontAsset?: typeof loadImportedFontAsset;
}

export async function hydrateDocumentFontAssets(
  doc: CanvasDocument,
  options: HydrateDocumentFontAssetOptions = {},
): Promise<CanvasDocument> {
  const loadFontAsset = options.loadFontAsset ?? loadImportedFontAsset;
  const fontAssets: PortableFontAsset[] = [];
  for (const font of collectDocumentFontRefs(doc)) {
    if (!isFontUri(font)) continue;
    const asset = await loadFontAsset(font);
    if (asset) {
      const { id, dataUrl, mime, bytes, label, family, createdAt } = asset;
      const { source, sourceName, sourceUrl, license, embeddingPolicy } = asset;
      fontAssets.push({
        id,
        dataUrl,
        mime,
        bytes,
        label,
        family,
        createdAt,
        ...(source ? { source } : {}),
        ...(sourceName ? { sourceName } : {}),
        ...(sourceUrl ? { sourceUrl } : {}),
        ...(license ? { license } : {}),
        ...(embeddingPolicy ? { embeddingPolicy } : {}),
      });
    }
  }
  if (fontAssets.length === 0) return doc.fontAssets ? stripDocumentFontAssets(doc) : doc;
  return { ...doc, fontAssets };
}

export interface StoreDocumentFontAssetOptions {
  saveFontAsset?: typeof saveImportedFontAsset;
}

export async function storeDocumentFontAssets(
  doc: CanvasDocument,
  options: StoreDocumentFontAssetOptions = {},
): Promise<CanvasDocument> {
  if (!doc.fontAssets?.length) return doc.fontAssets ? stripDocumentFontAssets(doc) : doc;
  const saveFontAsset = options.saveFontAsset ?? saveImportedFontAsset;
  await Promise.all(doc.fontAssets.map((asset) => saveFontAsset(asset)));
  return stripDocumentFontAssets(doc);
}

export function stripDocumentFontAssets(doc: CanvasDocument): CanvasDocument {
  if (!doc.fontAssets) return doc;
  const rest = { ...doc };
  delete rest.fontAssets;
  return rest;
}

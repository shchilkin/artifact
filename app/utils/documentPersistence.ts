import {
  ASPECT_SIZES,
  type AspectRatio,
  type CanvasDocument,
  type CanvasGraph,
  cloneDocument,
  DEFAULT_DOCUMENT,
  DEFAULT_EXPORT,
  DEFAULT_GLOBAL,
  type Layer,
  type SourceType,
} from '../types/config';

export const DOC_KEY = 'doc';

export interface InitialDocumentSources {
  search?: string;
  storageValue?: string | null;
}

export interface DocumentStorage {
  getItem?(key: string): string | null;
  setItem(key: string, value: string): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isValidAspect(value: unknown): value is AspectRatio {
  return typeof value === 'string' && value in ASPECT_SIZES;
}

function normalizeGraph(value: unknown): CanvasGraph | undefined {
  if (!isRecord(value)) return undefined;
  return {
    edges: Array.isArray(value.edges) ? (value.edges as CanvasGraph['edges']) : [],
    positions: isRecord(value.positions) ? (value.positions as CanvasGraph['positions']) : {},
    mergeNodes: Array.isArray(value.mergeNodes) ? (value.mergeNodes as CanvasGraph['mergeNodes']) : [],
    colorNodes: Array.isArray(value.colorNodes) ? (value.colorNodes as CanvasGraph['colorNodes']) : [],
  };
}

export function normalizeDocument(raw: unknown): CanvasDocument {
  const doc = isRecord(raw) ? raw : {};
  const global = isRecord(doc.global) ? doc.global : {};
  const exportConfig = isRecord(doc.export) ? doc.export : {};
  const aspect = isValidAspect(global.aspect) ? global.aspect : DEFAULT_GLOBAL.aspect;
  const layers = Array.isArray(doc.layers)
    ? (doc.layers
        .filter(isRecord)
        .map((layer) =>
          layer.kind === 'source' && typeof layer.sourceType === 'string'
            ? { ...layer, kind: layer.sourceType as SourceType }
            : layer,
        ) as Layer[])
    : [];

  return {
    ...(doc as Partial<CanvasDocument>),
    global: { ...DEFAULT_GLOBAL, ...global, aspect },
    layers,
    export: { ...DEFAULT_EXPORT, ...exportConfig } as CanvasDocument['export'],
    graph: normalizeGraph(doc.graph),
  };
}

function parseDocumentJson(value: string | null | undefined): CanvasDocument | null {
  if (!value) return null;
  try {
    return normalizeDocument(JSON.parse(value));
  } catch {
    return null;
  }
}

export function serializeDocument(doc: CanvasDocument) {
  return JSON.stringify(doc);
}

export function getInitialDocumentFromSources({ search = '', storageValue = null }: InitialDocumentSources) {
  const docParam = new URLSearchParams(search).get('doc');
  return parseDocumentJson(docParam) ?? parseDocumentJson(storageValue) ?? cloneDocument(DEFAULT_DOCUMENT);
}

export function getInitialDocument(): CanvasDocument {
  let storageValue: string | null = null;
  try {
    storageValue = localStorage.getItem(DOC_KEY);
  } catch {
    // ignore inaccessible storage
  }

  return getInitialDocumentFromSources({
    search: typeof window === 'undefined' ? '' : window.location.search,
    storageValue,
  });
}

export function saveDocumentToStorage(doc: CanvasDocument, storage: DocumentStorage = localStorage) {
  try {
    storage.setItem(DOC_KEY, serializeDocument(doc));
    return true;
  } catch {
    return false;
  }
}

export function createDocumentShareUrl(origin: string, doc: CanvasDocument, pathname = '/app') {
  const params = new URLSearchParams();
  params.set('doc', serializeDocument(doc));
  return `${origin}${pathname}?${params.toString()}`;
}

export function removeDocParamFromUrl(href: string) {
  const url = new URL(href);
  url.searchParams.delete('doc');
  return url.toString();
}

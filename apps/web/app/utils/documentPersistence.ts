import {
  ASPECT_SIZES,
  type AspectRatio,
  type CanvasDocument,
  type CanvasGraph,
  cloneDocument,
  DEFAULT_DOCUMENT,
  DEFAULT_EFFECT_LAYER_PROPS,
  DEFAULT_EXPORT,
  DEFAULT_GLOBAL,
  DOCUMENT_SCHEMA_VERSION,
  type EffectLayer,
  type Layer,
  makeEmojiLayer,
  makeSourceLayer,
  type PortableFontAsset,
  SOURCE_TYPES,
  type SourceType,
} from '../types/config';
import { shouldSplitEffectLayer, splitEffectPatchIntoPresetLayers } from './effectLayerMigration';

export const DOC_KEY = 'doc';
export const PRE_BLANK_DRAFT_KEY = 'artifact-pre-blank-draft-v1';
export const ARTIFACT_FILE_EXTENSION = '.artifact.json';
export const ARTIFACT_FILE_MIME = 'application/json';

export interface InitialDocumentSources {
  search?: string;
  storageValue?: string | null;
}

export interface DocumentStorage {
  getItem?(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export interface PreBlankDraft {
  doc: CanvasDocument;
  savedAt: string;
  reason: 'before-blank';
}

let pendingPreBlankDraft: PreBlankDraft | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isValidAspect(value: unknown): value is AspectRatio {
  return typeof value === 'string' && value in ASPECT_SIZES;
}

function normalizePrimitiveViewStates(value: unknown): CanvasGraph['primitiveViewStates'] {
  if (!isRecord(value)) return undefined;
  const entries = Object.entries(value).flatMap(([id, state]) => {
    if (!isRecord(state)) return [];
    const rotationX = Number(state.rotationX);
    const rotationY = Number(state.rotationY);
    const zoom = Number(state.zoom);
    const panX = Number(state.panX);
    const panY = Number(state.panY);
    if (![rotationX, rotationY, zoom, panX, panY].every(Number.isFinite)) return [];
    return [
      [
        id,
        {
          rotationX,
          rotationY,
          zoom,
          panX,
          panY,
          locked: state.locked === true,
        },
      ],
    ] as const;
  });
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function normalizeGraph(value: unknown): CanvasGraph | undefined {
  if (!isRecord(value)) return undefined;
  return {
    edges: Array.isArray(value.edges) ? (value.edges as CanvasGraph['edges']) : [],
    positions: isRecord(value.positions) ? (value.positions as CanvasGraph['positions']) : {},
    mergeNodes: Array.isArray(value.mergeNodes) ? (value.mergeNodes as CanvasGraph['mergeNodes']) : [],
    colorNodes: Array.isArray(value.colorNodes) ? (value.colorNodes as CanvasGraph['colorNodes']) : [],
    repeatNodes: Array.isArray(value.repeatNodes)
      ? (value.repeatNodes as CanvasGraph['repeatNodes']).map((node) => ({ seedOffset: 0, ...node }))
      : [],
    areas: Array.isArray(value.areas) ? (value.areas as CanvasGraph['areas']) : [],
    primitiveViewStates: normalizePrimitiveViewStates(value.primitiveViewStates),
  };
}

function normalizePortableFontAssets(value: unknown): PortableFontAsset[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const assets = value.flatMap((item) => {
    if (!isRecord(item)) return [];
    const id = typeof item.id === 'string' ? item.id : '';
    const dataUrl = typeof item.dataUrl === 'string' ? item.dataUrl : '';
    if (!id || !dataUrl.startsWith('data:')) return [];
    return [
      {
        id,
        dataUrl,
        mime: typeof item.mime === 'string' ? item.mime : 'application/octet-stream',
        bytes: Number.isFinite(Number(item.bytes)) ? Number(item.bytes) : 0,
        label: typeof item.label === 'string' ? item.label : 'Imported Font',
        family: typeof item.family === 'string' ? item.family : `Artifact Imported ${id}`,
        createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date(0).toISOString(),
        ...(item.source === 'local-file' || item.source === 'google-fonts' ? { source: item.source } : {}),
        ...(typeof item.sourceName === 'string' ? { sourceName: item.sourceName } : {}),
        ...(typeof item.sourceUrl === 'string' ? { sourceUrl: item.sourceUrl } : {}),
        ...(isRecord(item.license) && typeof item.license.name === 'string'
          ? {
              license: {
                name: item.license.name,
                ...(typeof item.license.url === 'string' ? { url: item.license.url } : {}),
                ...(typeof item.license.allowsEmbedding === 'boolean'
                  ? { allowsEmbedding: item.license.allowsEmbedding }
                  : {}),
              },
            }
          : {}),
        ...(item.embeddingPolicy === 'user-confirmed-required' || item.embeddingPolicy === 'open-license-embeddable'
          ? { embeddingPolicy: item.embeddingPolicy }
          : {}),
      },
    ];
  });
  return assets.length > 0 ? assets : undefined;
}

export function normalizeDocument(raw: unknown): CanvasDocument {
  const doc = isRecord(raw) ? raw : {};
  const global = isRecord(doc.global) ? doc.global : {};
  const exportConfig = isRecord(doc.export) ? doc.export : {};
  const aspect = isValidAspect(global.aspect) ? global.aspect : DEFAULT_GLOBAL.aspect;
  const layers = Array.isArray(doc.layers)
    ? (doc.layers.filter(isRecord).flatMap((layer) => {
        const normalizedLayer =
          layer.kind === 'source' && typeof layer.sourceType === 'string'
            ? { ...layer, kind: layer.sourceType as SourceType }
            : layer;
        const layerWithDefaults =
          normalizedLayer.kind === 'effect'
            ? ({ ...DEFAULT_EFFECT_LAYER_PROPS, ...normalizedLayer } as Partial<EffectLayer>)
            : SOURCE_TYPES.includes(normalizedLayer.kind as SourceType)
              ? { ...makeSourceLayer(normalizedLayer.kind as SourceType), ...normalizedLayer }
              : normalizedLayer.kind === 'emoji'
                ? { ...makeEmojiLayer(), ...normalizedLayer }
                : normalizedLayer;

        if (layerWithDefaults.kind === 'effect' && shouldSplitEffectLayer(layerWithDefaults as Partial<EffectLayer>)) {
          return splitEffectPatchIntoPresetLayers(layerWithDefaults as Partial<EffectLayer>, {
            idPrefix: String(layerWithDefaults.id ?? 'effect'),
          });
        }

        return [layerWithDefaults as Layer];
      }) as Layer[])
    : [];

  const fontAssets = normalizePortableFontAssets(doc.fontAssets);
  const documentFields = { ...(doc as Partial<CanvasDocument>) };
  delete documentFields.fontAssets;
  return {
    ...documentFields,
    schemaVersion: DOCUMENT_SCHEMA_VERSION,
    global: { ...DEFAULT_GLOBAL, ...global, aspect },
    layers,
    export: { ...DEFAULT_EXPORT, ...exportConfig } as CanvasDocument['export'],
    graph: normalizeGraph(doc.graph),
    ...(fontAssets ? { fontAssets } : {}),
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

export function serializeArtifactDocument(doc: CanvasDocument) {
  return `${JSON.stringify(doc, null, 2)}\n`;
}

export function createBlankDocument({
  aspect = DEFAULT_GLOBAL.aspect,
  seed = DEFAULT_GLOBAL.seed,
}: Partial<Pick<CanvasDocument['global'], 'aspect' | 'seed'>> = {}): CanvasDocument {
  return {
    schemaVersion: DOCUMENT_SCHEMA_VERSION,
    global: { ...DEFAULT_GLOBAL, bg: 'transparent', aspect, seed },
    layers: [],
    export: { ...DEFAULT_EXPORT },
  };
}

export function isBlankDocument(doc: CanvasDocument) {
  const graph = doc.graph;
  const graphIsEmpty =
    !graph ||
    (graph.edges.length === 0 &&
      graph.mergeNodes.length === 0 &&
      (graph.colorNodes ?? []).length === 0 &&
      (graph.repeatNodes ?? []).length === 0 &&
      (graph.areas ?? []).length === 0 &&
      Object.keys(graph.positions).every((id) => id === '__export__'));

  return doc.layers.length === 0 && doc.global.bg === 'transparent' && graphIsEmpty;
}

export function parseArtifactDocument(value: string | null | undefined): CanvasDocument | null {
  return parseDocumentJson(value);
}

export function takePendingPreBlankDraft(): PreBlankDraft | null {
  const draft = pendingPreBlankDraft;
  pendingPreBlankDraft = null;
  return draft;
}

function parsePreBlankDraft(value: string | null | undefined): PreBlankDraft | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<PreBlankDraft>;
    if (parsed.reason !== 'before-blank' || typeof parsed.savedAt !== 'string') return null;
    return { reason: 'before-blank', savedAt: parsed.savedAt, doc: normalizeDocument(parsed.doc) };
  } catch {
    return null;
  }
}

export function loadPreBlankDraft(storage: Pick<DocumentStorage, 'getItem'>): PreBlankDraft | null {
  try {
    return parsePreBlankDraft(storage.getItem?.(PRE_BLANK_DRAFT_KEY));
  } catch {
    return null;
  }
}

export function savePreBlankDraft(
  doc: CanvasDocument,
  storage: Pick<DocumentStorage, 'setItem'> = localStorage,
  date = new Date(),
) {
  if (isBlankDocument(doc)) return true;
  try {
    storage.setItem(PRE_BLANK_DRAFT_KEY, JSON.stringify({ reason: 'before-blank', savedAt: date.toISOString(), doc }));
    return true;
  } catch {
    return false;
  }
}

export function deletePreBlankDraft(storage: Pick<DocumentStorage, 'removeItem'> = localStorage) {
  try {
    storage.removeItem?.(PRE_BLANK_DRAFT_KEY);
    return true;
  } catch {
    return false;
  }
}

export function createArtifactFileName(doc: CanvasDocument, date = new Date()) {
  const seed = Number.isFinite(doc.global.seed) ? doc.global.seed : 'untitled';
  const stamp = date.toISOString().slice(0, 10);
  return `artifact-${seed}-${stamp}${ARTIFACT_FILE_EXTENSION}`;
}

export function getInitialDocumentFromSources({ search = '', storageValue = null }: InitialDocumentSources) {
  const params = new URLSearchParams(search);
  if (params.get('new') === 'blank' || params.get('blank') === '1') return createBlankDocument();

  const docParam = params.get('doc');
  return parseDocumentJson(docParam) ?? parseDocumentJson(storageValue) ?? cloneDocument(DEFAULT_DOCUMENT);
}

export function getInitialDocument(): CanvasDocument {
  let storageValue: string | null = null;
  try {
    storageValue = localStorage.getItem(DOC_KEY);
  } catch {
    // ignore inaccessible storage
  }

  const search = typeof window === 'undefined' ? '' : window.location.search;
  const params = new URLSearchParams(search);
  const startsBlank = params.get('new') === 'blank' || params.get('blank') === '1';
  if (startsBlank) {
    const storedDoc = parseArtifactDocument(storageValue);
    if (storedDoc && !isBlankDocument(storedDoc)) {
      pendingPreBlankDraft = { reason: 'before-blank', savedAt: new Date().toISOString(), doc: storedDoc };
    }
  }

  return getInitialDocumentFromSources({
    search,
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
  url.searchParams.delete('new');
  url.searchParams.delete('blank');
  return url.toString();
}

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
  type EffectEntry,
  type Layer,
  makeDocument,
  makeEmojiLayer,
  makeFillLayer,
  makeSourceLayer,
  type PortableEnvironmentAsset,
  type PortableFontAsset,
  type PortableModelAsset,
  type PrimitiveLayer,
  SCENE3D_DEFAULTS,
  type Scene3DSettings,
  SOURCE_TYPES,
  type SourceType,
  TEXT_TYPOGRAPHY_DEFAULTS,
} from '../types/config';
import { type EffectParamSpec, effectSpec, isEffectId } from '../types/effectSchema';
import { serializeDocumentForLink } from './documentLink';
import { migrateDocument } from './migrations';
import { hasGraphNodes } from './nodeGraph';
import { clampMaterialFractions, graphNodeModel, isGraphNodeKind } from './nodeKinds';

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
  thumbnail?: string;
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

function normalizeGraphNodes(value: unknown): CanvasGraph['nodes'] {
  if (!isRecord(value)) return {};
  const nodes: CanvasGraph['nodes'] = {};
  for (const [id, stored] of Object.entries(value)) {
    if (!isRecord(stored) || !isGraphNodeKind(stored.kind)) continue;
    const { hidden, ...fields } = stored;
    const node = graphNodeModel(stored.kind).normalize({ ...fields, id });
    nodes[id] = hidden === true ? { ...node, hidden: true } : node;
  }
  return nodes;
}

function normalizeGraph(value: unknown): CanvasGraph | undefined {
  if (!isRecord(value)) return undefined;
  return {
    edges: Array.isArray(value.edges) ? (value.edges as CanvasGraph['edges']) : [],
    positions: isRecord(value.positions) ? (value.positions as CanvasGraph['positions']) : {},
    nodes: normalizeGraphNodes(value.nodes),
    areas: Array.isArray(value.areas) ? (value.areas as NonNullable<CanvasGraph['areas']>) : [],
    primitiveViewStates: normalizePrimitiveViewStates(value.primitiveViewStates),
  };
}

function normalizePortableFontAssets(value: unknown): PortableFontAsset[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const assets = value.flatMap((item) => {
    const asset = normalizePortableFontAsset(item);
    return asset ? [asset] : [];
  });
  return assets.length > 0 ? assets : undefined;
}

function normalizePortableModelAssets(value: unknown): PortableModelAsset[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const assets = value.flatMap((item) => {
    const asset = normalizePortableModelAsset(item);
    return asset ? [asset] : [];
  });
  return assets.length > 0 ? assets : undefined;
}

function normalizePortableEnvironmentAssets(value: unknown): PortableEnvironmentAsset[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const assets = value.flatMap((item) => {
    const asset = normalizePortableEnvironmentAsset(item);
    return asset ? [asset] : [];
  });
  return assets.length > 0 ? assets : undefined;
}

function normalizePortableEnvironmentAsset(item: unknown): PortableEnvironmentAsset | null {
  if (!isRecord(item)) return null;
  const id = stringField(item.id);
  const dataUrl = stringField(item.dataUrl);
  if (!id || !dataUrl?.startsWith('data:')) return null;
  return {
    id,
    dataUrl,
    mime: stringField(item.mime) ?? 'image/x-exr',
    bytes: finiteNumberField(item.bytes),
    label: stringField(item.label) ?? 'Imported environment',
    createdAt: stringField(item.createdAt) ?? new Date(0).toISOString(),
  };
}

function normalizePortableModelAsset(item: unknown): PortableModelAsset | null {
  if (!isRecord(item)) return null;
  const id = stringField(item.id);
  const dataUrl = stringField(item.dataUrl);
  if (!id || !dataUrl?.startsWith('data:')) return null;
  return {
    id,
    dataUrl,
    mime: stringField(item.mime) ?? 'model/gltf-binary',
    bytes: finiteNumberField(item.bytes),
    label: stringField(item.label) ?? 'Imported model',
    createdAt: stringField(item.createdAt) ?? new Date(0).toISOString(),
  };
}

function normalizePortableFontAsset(item: unknown): PortableFontAsset | null {
  if (!isRecord(item)) return null;
  const id = stringField(item.id);
  const dataUrl = stringField(item.dataUrl);
  if (!id || !dataUrl?.startsWith('data:')) return null;
  return {
    id,
    dataUrl,
    mime: stringField(item.mime) ?? 'application/octet-stream',
    bytes: finiteNumberField(item.bytes),
    label: stringField(item.label) ?? 'Imported Font',
    family: stringField(item.family) ?? `Artifact Imported ${id}`,
    createdAt: stringField(item.createdAt) ?? new Date(0).toISOString(),
    ...fontAssetSourceFields(item),
    ...fontAssetLicenseField(item.license),
    ...fontAssetEmbeddingPolicyField(item.embeddingPolicy),
  };
}

function stringField(value: unknown) {
  return typeof value === 'string' ? value : undefined;
}

function finiteNumberField(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function fontAssetSourceFields(item: Record<string, unknown>): Partial<PortableFontAsset> {
  return {
    ...(item.source === 'local-file' || item.source === 'google-fonts' ? { source: item.source } : {}),
    ...(typeof item.sourceName === 'string' ? { sourceName: item.sourceName } : {}),
    ...(typeof item.sourceUrl === 'string' ? { sourceUrl: item.sourceUrl } : {}),
  };
}

function fontAssetLicenseField(license: unknown): Pick<PortableFontAsset, 'license'> | Record<string, never> {
  if (!isRecord(license) || typeof license.name !== 'string') return {};
  return {
    license: {
      name: license.name,
      ...(typeof license.url === 'string' ? { url: license.url } : {}),
      ...(typeof license.allowsEmbedding === 'boolean' ? { allowsEmbedding: license.allowsEmbedding } : {}),
    },
  };
}

function fontAssetEmbeddingPolicyField(
  embeddingPolicy: unknown,
): Pick<PortableFontAsset, 'embeddingPolicy'> | Record<string, never> {
  return embeddingPolicy === 'user-confirmed-required' || embeddingPolicy === 'open-license-embeddable'
    ? { embeddingPolicy }
    : {};
}

function normalizeEffectParam(param: EffectParamSpec, value: unknown): number | string {
  if (param.type === 'number') return typeof value === 'number' && Number.isFinite(value) ? value : param.default;
  if (param.type === 'choice') {
    return param.options.some((option) => option.value === value) ? (value as string) : param.default;
  }
  return typeof value === 'string' ? value : param.default;
}

/** A stored stack entry with exactly its effect's parameters, or null when its effect is unknown. */
function normalizeEffectEntry(stored: unknown, layerId: string, index: number): EffectEntry | null {
  if (!isRecord(stored) || typeof stored.effect !== 'string' || !isEffectId(stored.effect)) return null;
  const { effect } = stored;
  const storedParams = isRecord(stored.params) ? stored.params : {};
  return {
    id: typeof stored.id === 'string' && stored.id ? stored.id : `${layerId}-${effect}-${index}`,
    effect,
    enabled: stored.enabled !== false,
    params: Object.fromEntries(
      Object.entries(effectSpec(effect).params).map(([key, param]) => [
        key,
        normalizeEffectParam(param, storedParams[key]),
      ]),
    ),
  };
}

function normalizeEffectLayer(layer: Record<string, unknown>): Record<string, unknown> {
  const layerId = typeof layer.id === 'string' ? layer.id : 'effect';
  const effects = Array.isArray(layer.effects)
    ? layer.effects.flatMap((entry, index) => normalizeEffectEntry(entry, layerId, index) ?? [])
    : [];
  const mix = typeof layer.mix === 'number' && Number.isFinite(layer.mix) ? Math.min(100, Math.max(0, layer.mix)) : 100;
  const appliesTo = layer.appliesTo === 'layerBelow' ? 'layerBelow' : 'all';
  return { ...DEFAULT_EFFECT_LAYER_PROPS, ...layer, effects, mix, appliesTo };
}

/** Fields added to a kind since documents were first saved, with the value that keeps their old look. */
const LAYER_FIELD_DEFAULTS: Partial<Record<Layer['kind'], () => Partial<Layer>>> = {
  emoji: () => makeEmojiLayer(),
  text: () => ({ ...TEXT_TYPOGRAPHY_DEFAULTS }),
  fill: () => {
    const { fillMode, colorB, angle } = makeFillLayer();
    return { fillMode, colorB, angle };
  },
};

/** A 3D layer's scene lighting with defaults for missing settings, or nothing when the layer has none. */
function normalizeSceneField(scene: unknown): { scene?: Scene3DSettings } {
  return isRecord(scene) ? { scene: { ...SCENE3D_DEFAULTS, ...scene } as Scene3DSettings } : {};
}

function normalizeLayer(layer: Record<string, unknown>): Layer {
  const kindDefaults = LAYER_FIELD_DEFAULTS[layer.kind as Layer['kind']];
  const withDefaults =
    layer.kind === 'effect'
      ? normalizeEffectLayer(layer)
      : SOURCE_TYPES.includes(layer.kind as SourceType)
        ? { ...makeSourceLayer(layer.kind as SourceType), ...layer, ...normalizeSceneField(layer.scene) }
        : kindDefaults
          ? { ...kindDefaults(), ...layer }
          : layer;
  return (
    withDefaults.kind === 'primitive' ? clampMaterialFractions(withDefaults as Partial<PrimitiveLayer>) : withDefaults
  ) as Layer;
}

/**
 * Validate a stored or imported document and fill defaults for fields added since it was saved. Legacy formats are
 * upgraded first by the one-shot steps in `./migrations`; this function only handles current-schema shapes.
 */
export function normalizeDocument(raw: unknown): CanvasDocument {
  const doc = migrateDocument(isRecord(raw) ? raw : {});
  const global = isRecord(doc.global) ? doc.global : {};
  const exportConfig = isRecord(doc.export) ? doc.export : {};
  const aspect = isValidAspect(global.aspect) ? global.aspect : DEFAULT_GLOBAL.aspect;
  const layers = Array.isArray(doc.layers) ? doc.layers.filter(isRecord).map(normalizeLayer) : [];

  const fontAssets = normalizePortableFontAssets(doc.fontAssets);
  const modelAssets = normalizePortableModelAssets(doc.modelAssets);
  const envAssets = normalizePortableEnvironmentAssets(doc.envAssets);
  const documentFields = { ...(doc as Partial<CanvasDocument>) };
  delete documentFields.fontAssets;
  delete documentFields.modelAssets;
  delete documentFields.envAssets;
  // Migrations give every stored document a graph; a malformed current-schema document without one gets the
  // graph of its layer stack, like any document built in code.
  return makeDocument({
    ...documentFields,
    schemaVersion: DOCUMENT_SCHEMA_VERSION,
    global: { ...DEFAULT_GLOBAL, ...global, aspect },
    layers,
    export: { ...DEFAULT_EXPORT, ...exportConfig } as CanvasDocument['export'],
    graph: normalizeGraph(doc.graph),
    ...(fontAssets ? { fontAssets } : {}),
    ...(modelAssets ? { modelAssets } : {}),
    ...(envAssets ? { envAssets } : {}),
  });
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
  return makeDocument({
    schemaVersion: DOCUMENT_SCHEMA_VERSION,
    global: { ...DEFAULT_GLOBAL, bg: 'transparent', aspect, seed },
    layers: [],
    export: { ...DEFAULT_EXPORT },
  });
}

export function isBlankDocument(doc: CanvasDocument) {
  const graph = doc.graph;
  const graphIsEmpty =
    !graph ||
    (graph.edges.length === 0 &&
      !hasGraphNodes(graph) &&
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
    return {
      reason: 'before-blank',
      savedAt: parsed.savedAt,
      doc: normalizeDocument(parsed.doc),
      ...(typeof parsed.thumbnail === 'string' ? { thumbnail: parsed.thumbnail } : {}),
    };
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

export function createArtifactFileName(doc: CanvasDocument, date = new Date()) {
  const seed = Number.isFinite(doc.global.seed) ? doc.global.seed : 'untitled';
  const stamp = date.toISOString().slice(0, 10);
  return `artifact-${seed}-${stamp}${ARTIFACT_FILE_EXTENSION}`;
}

/** Query value that marks a `?doc` link opened from the docs pages. */
const DOCS_LINK_SOURCE = 'docs';

/** How the editor's initial document relates to a `?doc` link, for the load notice. */
export type DocumentLinkStatus =
  | { kind: 'none' }
  | { kind: 'opened'; source: 'docs' | 'link' }
  | { kind: 'unreadable'; fallback: 'stored' | 'default' };

export interface InitialDocumentState {
  doc: CanvasDocument;
  linkStatus: DocumentLinkStatus;
}

/** Picks the opening document and reports how it relates to a `?doc` link, parsing each source once. */
export function resolveInitialDocumentFromSources({
  search = '',
  storageValue = null,
}: InitialDocumentSources): InitialDocumentState {
  const params = new URLSearchParams(search);
  if (params.get('new') === 'blank' || params.get('blank') === '1') {
    return { doc: createBlankDocument(), linkStatus: { kind: 'none' } };
  }

  const docParam = params.get('doc');
  const linkedDoc = parseDocumentJson(docParam);
  if (linkedDoc) {
    return {
      doc: linkedDoc,
      linkStatus: { kind: 'opened', source: params.get('from') === DOCS_LINK_SOURCE ? 'docs' : 'link' },
    };
  }

  const storedDoc = parseDocumentJson(storageValue);
  return {
    doc: storedDoc ?? cloneDocument(DEFAULT_DOCUMENT),
    linkStatus:
      docParam === null ? { kind: 'none' } : { kind: 'unreadable', fallback: storedDoc ? 'stored' : 'default' },
  };
}

function readStoredDocumentValue() {
  try {
    return localStorage.getItem(DOC_KEY);
  } catch {
    return null;
  }
}

export function getInitialDocumentState(): InitialDocumentState {
  const storageValue = readStoredDocumentValue();

  const search = typeof window === 'undefined' ? '' : window.location.search;
  const params = new URLSearchParams(search);
  const startsBlank = params.get('new') === 'blank' || params.get('blank') === '1';
  if (startsBlank) {
    const storedDoc = parseArtifactDocument(storageValue);
    if (storedDoc && !isBlankDocument(storedDoc)) {
      pendingPreBlankDraft = {
        reason: 'before-blank',
        savedAt: new Date().toISOString(),
        doc: storedDoc,
      };
    }
  }

  return resolveInitialDocumentFromSources({
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
  params.set('doc', serializeDocumentForLink(doc));
  return `${origin}${pathname}?${params.toString()}`;
}

export function removeDocParamFromUrl(href: string) {
  const url = new URL(href);
  url.searchParams.delete('doc');
  url.searchParams.delete('from');
  url.searchParams.delete('new');
  url.searchParams.delete('blank');
  return url.toString();
}

import type { CanvasDocument, PortableFontAsset, TextLayer } from '../types/config';
import { DOCUMENT_SCHEMA_VERSION } from '../types/config';
import { getBundledFontRegistryItem, isBundledFontName } from '../types/typography';
import {
  type HydrateDocumentImageAssetOptions,
  hydrateDocumentImageAssets,
  isAssetUri,
  type StoreDocumentImageAssetOptions,
} from './assetStore';
import { inspectDocumentDependencies, storePortableDocumentAssets } from './documentAssets';
import { normalizeDocument } from './documentPersistence';
import {
  fontIdFromUri,
  type HydrateDocumentFontAssetOptions,
  hydrateDocumentFontAssets,
  isFontUri,
  loadImportedFontAsset,
  type StoreDocumentFontAssetOptions,
  stripDocumentFontAssets,
} from './fontStore';

export const ARTIFACT_PROJECT_PACKAGE_KIND = 'artifact-project-package';
const ARTIFACT_PROJECT_PACKAGE_VERSION = 1;
export const ARTIFACT_PROJECT_PACKAGE_EXTENSION = '.artifact';
export const ARTIFACT_PROJECT_PACKAGE_MIME = 'application/vnd.artifact.project+json';

export type ProjectPackageFontEmbeddingMode = 'metadata-only' | 'license-aware' | 'explicit-font-files';

export interface ProjectPackageFontMetadata {
  id: string;
  label: string;
  family: string;
  mime?: string;
  bytes?: number;
  createdAt?: string;
  source?: PortableFontAsset['source'];
  sourceName?: string;
  sourceUrl?: string;
  license?: PortableFontAsset['license'];
  embeddingPolicy?: PortableFontAsset['embeddingPolicy'];
}

export interface ProjectPackageFontInventoryItem {
  ref: string;
  kind: 'bundled' | 'imported' | 'unknown';
  layerIds: string[];
  textContents: string[];
  label: string;
  family: string;
  asset?: ProjectPackageFontMetadata;
  embedding: 'bundled-registry' | 'metadata-only' | 'embedded-file' | 'missing-metadata';
  recovery: 'registry-font' | 'editable-text-replace-font';
}

export interface ProjectPackageImageInventory {
  importedRefs: string[];
  embeddedPayloads: number;
  remainingLocalRefs: string[];
}

export interface ProjectPackageManifest {
  kind: typeof ARTIFACT_PROJECT_PACKAGE_KIND;
  version: typeof ARTIFACT_PROJECT_PACKAGE_VERSION;
  createdAt: string;
  documentSchemaVersion: number;
  fontEmbeddingMode: ProjectPackageFontEmbeddingMode;
  rasterExportPolicy: 'pixel-only-no-font-files';
  editableTextPolicy: 'original-text-plus-font-metadata';
  visualFallbackPolicy: 'raster-snapshot-preferred-svg-outlines-explicit-only';
  images: ProjectPackageImageInventory;
  fonts: ProjectPackageFontInventoryItem[];
  hasGraphExportTarget: boolean;
  missingGraphExportTarget: boolean;
}

export interface ArtifactProjectPackage {
  artifactPackage: 'project';
  manifest: ProjectPackageManifest;
  document: CanvasDocument;
}

export interface PrepareArtifactProjectPackageOptions
  extends HydrateDocumentImageAssetOptions,
    HydrateDocumentFontAssetOptions {
  includeFontFiles?: boolean;
  fontEmbeddingMode?: ProjectPackageFontEmbeddingMode;
  now?: Date;
}

export interface ImportArtifactProjectPackageOptions
  extends StoreDocumentImageAssetOptions,
    StoreDocumentFontAssetOptions {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}

function imageSources(doc: CanvasDocument) {
  return doc.layers.flatMap((layer) =>
    layer.kind === 'image' ? [layer.src, ...(layer.aiGenerationHistory?.map((variant) => variant.src) ?? [])] : [],
  );
}

function textLayersByFont(doc: CanvasDocument) {
  const refs = new Map<string, TextLayer[]>();
  for (const layer of doc.layers) {
    if (layer.kind !== 'text') continue;
    refs.set(layer.font, [...(refs.get(layer.font) ?? []), layer]);
  }
  return refs;
}

function metadataFromFontAsset(asset: PortableFontAsset): ProjectPackageFontMetadata {
  return {
    id: asset.id,
    label: asset.label,
    family: asset.family,
    mime: asset.mime,
    bytes: asset.bytes,
    createdAt: asset.createdAt,
    source: asset.source,
    sourceName: asset.sourceName,
    sourceUrl: asset.sourceUrl,
    license: asset.license,
    embeddingPolicy: asset.embeddingPolicy,
  };
}

function fontAssetMap(assets: readonly PortableFontAsset[] = []) {
  return new Map(assets.map((asset) => [asset.id, metadataFromFontAsset(asset)]));
}

async function collectFontMetadata(
  doc: CanvasDocument,
  loadFontAsset: PrepareArtifactProjectPackageOptions['loadFontAsset'],
) {
  const assets = fontAssetMap(doc.fontAssets);
  if (!loadFontAsset) return assets;

  for (const font of textLayersByFont(doc).keys()) {
    if (!isFontUri(font)) continue;
    const id = fontIdFromUri(font);
    if (!id || assets.has(id)) continue;
    const asset = await loadFontAsset(font);
    if (asset) assets.set(id, metadataFromFontAsset(asset));
  }
  return assets;
}

async function hydrateLicenseAwareFontAssets(
  doc: CanvasDocument,
  options: PrepareArtifactProjectPackageOptions,
): Promise<CanvasDocument> {
  const fontAssets: PortableFontAsset[] = [];
  const loadFontAsset = options.loadFontAsset ?? loadImportedFontAsset;
  for (const font of textLayersByFont(doc).keys()) {
    if (!isFontUri(font)) continue;
    const asset = await loadFontAsset(font);
    if (asset?.embeddingPolicy === 'open-license-embeddable') fontAssets.push(asset);
  }
  return fontAssets.length > 0 ? { ...doc, fontAssets } : stripDocumentFontAssets(doc);
}

function buildFontInventory(
  doc: CanvasDocument,
  metadataById: Map<string, ProjectPackageFontMetadata>,
  mode: ProjectPackageFontEmbeddingMode,
): ProjectPackageFontInventoryItem[] {
  return Array.from(textLayersByFont(doc).entries()).map(([font, layers]) =>
    fontInventoryItem(font, layers, metadataById, mode),
  );
}

function fontInventoryItem(
  font: string,
  layers: TextLayer[],
  metadataById: Map<string, ProjectPackageFontMetadata>,
  mode: ProjectPackageFontEmbeddingMode,
): ProjectPackageFontInventoryItem {
  const layerIds = layers.map((layer) => layer.id);
  const textContents = unique(layers.map((layer) => layer.content));
  if (isBundledFontName(font)) return bundledFontInventoryItem(font, layerIds, textContents);
  if (isFontUri(font)) return importedFontInventoryItem(font, layerIds, textContents, metadataById, mode);
  return unknownFontInventoryItem(font, layerIds, textContents);
}

function bundledFontInventoryItem(
  font: string,
  layerIds: string[],
  textContents: string[],
): ProjectPackageFontInventoryItem {
  const item = getBundledFontRegistryItem(font);
  return {
    ref: font,
    kind: 'bundled',
    layerIds,
    textContents,
    label: item.label,
    family: item.family,
    embedding: 'bundled-registry',
    recovery: 'registry-font',
  };
}

function importedFontInventoryItem(
  font: string,
  layerIds: string[],
  textContents: string[],
  metadataById: Map<string, ProjectPackageFontMetadata>,
  mode: ProjectPackageFontEmbeddingMode,
): ProjectPackageFontInventoryItem {
  const asset = importedFontMetadata(font, metadataById);
  return {
    ref: font,
    kind: 'imported',
    layerIds,
    textContents,
    label: importedFontLabel(asset),
    family: importedFontFamily(asset, font),
    asset,
    embedding: importedFontEmbedding(asset, mode),
    recovery: 'editable-text-replace-font',
  };
}

function importedFontMetadata(font: string, metadataById: Map<string, ProjectPackageFontMetadata>) {
  const id = fontIdFromUri(font);
  return id ? metadataById.get(id) : undefined;
}

function importedFontLabel(asset: ProjectPackageFontMetadata | undefined) {
  return asset?.label ?? 'Missing imported font';
}

function importedFontFamily(asset: ProjectPackageFontMetadata | undefined, font: string) {
  return asset?.family ?? font;
}

function importedFontEmbedding(
  asset: ProjectPackageFontMetadata | undefined,
  mode: ProjectPackageFontEmbeddingMode,
): ProjectPackageFontInventoryItem['embedding'] {
  if (!asset) return 'missing-metadata';
  return importedFontEmbedsFile(asset, mode) ? 'embedded-file' : 'metadata-only';
}

function importedFontEmbedsFile(asset: ProjectPackageFontMetadata, mode: ProjectPackageFontEmbeddingMode) {
  return (
    mode === 'explicit-font-files' || (mode === 'license-aware' && asset.embeddingPolicy === 'open-license-embeddable')
  );
}

function unknownFontInventoryItem(
  font: string,
  layerIds: string[],
  textContents: string[],
): ProjectPackageFontInventoryItem {
  return {
    ref: font,
    kind: 'unknown',
    layerIds,
    textContents,
    label: font,
    family: font,
    embedding: 'missing-metadata',
    recovery: 'editable-text-replace-font',
  };
}

export function buildArtifactProjectPackageManifest(
  sourceDoc: CanvasDocument,
  packageDoc: CanvasDocument,
  metadataById: Map<string, ProjectPackageFontMetadata> = new Map(),
  { mode = 'metadata-only', now = new Date() }: { mode?: ProjectPackageFontEmbeddingMode; now?: Date } = {},
): ProjectPackageManifest {
  const sourceInventory = inspectDocumentDependencies(sourceDoc);
  const packageInventory = inspectDocumentDependencies(packageDoc);
  const packagedImageSources = imageSources(packageDoc);

  return {
    kind: ARTIFACT_PROJECT_PACKAGE_KIND,
    version: ARTIFACT_PROJECT_PACKAGE_VERSION,
    createdAt: now.toISOString(),
    documentSchemaVersion: DOCUMENT_SCHEMA_VERSION,
    fontEmbeddingMode: mode,
    rasterExportPolicy: 'pixel-only-no-font-files',
    editableTextPolicy: 'original-text-plus-font-metadata',
    visualFallbackPolicy: 'raster-snapshot-preferred-svg-outlines-explicit-only',
    images: {
      importedRefs: sourceInventory.importedImageRefs,
      embeddedPayloads: packageInventory.portableImagePayloads.length,
      remainingLocalRefs: packagedImageSources.filter(isAssetUri),
    },
    fonts: buildFontInventory(sourceDoc, metadataById, mode),
    hasGraphExportTarget: sourceInventory.hasGraphExportTarget,
    missingGraphExportTarget: sourceInventory.missingGraphExportTarget,
  };
}

export async function prepareArtifactProjectPackage(
  doc: CanvasDocument,
  options: PrepareArtifactProjectPackageOptions = {},
): Promise<ArtifactProjectPackage> {
  const mode: ProjectPackageFontEmbeddingMode =
    options.fontEmbeddingMode ?? (options.includeFontFiles ? 'explicit-font-files' : 'license-aware');
  const metadataById = await collectFontMetadata(doc, options.loadFontAsset ?? loadImportedFontAsset);
  const imagePortableDoc = await hydrateDocumentImageAssets(doc, options);
  const packageDoc =
    mode === 'explicit-font-files'
      ? await hydrateDocumentFontAssets(imagePortableDoc, options)
      : mode === 'license-aware'
        ? await hydrateLicenseAwareFontAssets(imagePortableDoc, options)
        : stripDocumentFontAssets(imagePortableDoc);

  return {
    artifactPackage: 'project',
    manifest: buildArtifactProjectPackageManifest(doc, packageDoc, metadataById, {
      mode,
      now: options.now,
    }),
    document: packageDoc,
  };
}

export function serializeArtifactProjectPackage(projectPackage: ArtifactProjectPackage) {
  return `${JSON.stringify(projectPackage, null, 2)}\n`;
}

export function parseArtifactProjectPackage(value: string | null | undefined): ArtifactProjectPackage | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!isRecord(parsed) || parsed.artifactPackage !== 'project' || !isRecord(parsed.manifest)) return null;
    if (parsed.manifest.kind !== ARTIFACT_PROJECT_PACKAGE_KIND) return null;
    return {
      artifactPackage: 'project',
      manifest: parsed.manifest as ProjectPackageManifest,
      document: normalizeDocument(parsed.document),
    };
  } catch {
    return null;
  }
}

export function isArtifactProjectPackageFile(file: File) {
  return file.name.endsWith(ARTIFACT_PROJECT_PACKAGE_EXTENSION) || file.type === ARTIFACT_PROJECT_PACKAGE_MIME;
}

export async function importArtifactProjectPackage(
  projectPackage: ArtifactProjectPackage,
  options: ImportArtifactProjectPackageOptions = {},
): Promise<CanvasDocument> {
  return storePortableDocumentAssets(projectPackage.document, options);
}

export function createArtifactProjectPackageFileName(doc: CanvasDocument) {
  const seed = doc.global.seed.toString(36);
  return `artifact-project-${seed}${ARTIFACT_PROJECT_PACKAGE_EXTENSION}`;
}

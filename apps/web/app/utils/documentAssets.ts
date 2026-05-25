import type { CanvasDocument, ImageLayer } from '../types/config';
import {
  type HydrateDocumentImageAssetOptions,
  hydrateDocumentImageAssets,
  isAssetUri,
  isImageDataUrl,
  type StoreDocumentImageAssetOptions,
  storeDocumentImageAssets,
} from './assetStore';
import {
  type HydrateDocumentFontAssetOptions,
  hydrateDocumentFontAssets,
  isFontUri,
  type StoreDocumentFontAssetOptions,
  storeDocumentFontAssets,
  stripDocumentFontAssets,
} from './fontStore';
import { EXPORT_NODE_ID } from './nodeGraph';

export interface DocumentDependencyInventory {
  importedImageRefs: string[];
  importedFontRefs: string[];
  portableImagePayloads: string[];
  portableFontAssetIds: string[];
  missingGraphExportTarget: boolean;
  hasGraphExportTarget: boolean;
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}

function imageSourcesForLayer(layer: ImageLayer) {
  return [layer.src, ...(layer.aiGenerationHistory?.map((variant) => variant.src) ?? [])].filter(Boolean);
}

export function collectDocumentImageSources(doc: CanvasDocument): string[] {
  return doc.layers.flatMap((layer) => (layer.kind === 'image' ? imageSourcesForLayer(layer) : []));
}

export function inspectDocumentDependencies(doc: CanvasDocument): DocumentDependencyInventory {
  const imageSources = collectDocumentImageSources(doc);
  const graphExportInput =
    doc.graph?.edges.some((edge) => edge.toId === EXPORT_NODE_ID && edge.toPort === 'in') ?? false;
  const hasGraphExportTarget = doc.graph ? graphExportInput : true;

  return {
    importedImageRefs: unique(imageSources.filter(isAssetUri)),
    importedFontRefs: unique(
      doc.layers.filter((layer) => layer.kind === 'text' && isFontUri(layer.font)).map((layer) => layer.font),
    ),
    portableImagePayloads: unique(imageSources.filter(isImageDataUrl)),
    portableFontAssetIds: unique(doc.fontAssets?.map((asset) => asset.id) ?? []),
    hasGraphExportTarget,
    missingGraphExportTarget: Boolean(doc.graph && !hasGraphExportTarget),
  };
}

export function hasPortableDocumentPayloads(doc: CanvasDocument) {
  const inventory = inspectDocumentDependencies(doc);
  return inventory.portableImagePayloads.length > 0 || inventory.portableFontAssetIds.length > 0;
}

export interface PreparePortableDocumentOptions
  extends HydrateDocumentImageAssetOptions,
    HydrateDocumentFontAssetOptions {}

export async function preparePortableDocument(
  doc: CanvasDocument,
  options: PreparePortableDocumentOptions = {},
): Promise<CanvasDocument> {
  return hydrateDocumentFontAssets(await hydrateDocumentImageAssets(doc, options), options);
}

export interface StorePortableDocumentAssetOptions
  extends StoreDocumentImageAssetOptions,
    StoreDocumentFontAssetOptions {}

export async function storePortableDocumentAssets(
  doc: CanvasDocument,
  options: StorePortableDocumentAssetOptions = {},
): Promise<CanvasDocument> {
  let storedDoc = doc;
  try {
    storedDoc = await storeDocumentImageAssets(storedDoc, options);
  } catch {
    // Image data URLs remain renderable if local asset storage is unavailable.
  }
  try {
    return await storeDocumentFontAssets(storedDoc, options);
  } catch {
    // Font payloads are portable import data only; keep the font ref and let
    // the renderer/UI fall back when the local font cannot be stored.
    return stripDocumentFontAssets(storedDoc);
  }
}

export function stripPortableDocumentAssets(doc: CanvasDocument): CanvasDocument {
  return stripDocumentFontAssets(doc);
}

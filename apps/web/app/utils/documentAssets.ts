import {
  type CanvasDocument,
  type GraphMaterialNode,
  type GraphScene3DNode,
  type ImageLayer,
  MATERIAL_TEXTURE_SOURCE_FIELDS,
  type ModelLayer,
} from '../types/config';
import {
  type HydrateDocumentImageAssetOptions,
  hydrateDocumentImageAssets,
  isAssetUri,
  isImageDataUrl,
  type StoreDocumentImageAssetOptions,
  storeDocumentImageAssets,
} from './assetStore';
import {
  type HydrateDocumentEnvironmentAssetOptions,
  hydrateDocumentEnvironmentAssets,
  isEnvironmentDataUrl,
  isEnvironmentUri,
  type StoreDocumentEnvironmentAssetOptions,
  type StorePortableEnvironmentAssetOptions,
  storeDocumentEnvironmentAssets,
  storePortableEnvironmentAssets,
  stripDocumentEnvironmentAssets,
} from './envAssetStore';
import {
  type HydrateDocumentFontAssetOptions,
  hydrateDocumentFontAssets,
  isFontUri,
  type StoreDocumentFontAssetOptions,
  storeDocumentFontAssets,
  stripDocumentFontAssets,
} from './fontStore';
import {
  type HydrateDocumentModelAssetOptions,
  hydrateDocumentModelAssets,
  isModelDataUrl,
  isModelUri,
  type StoreDocumentModelAssetOptions,
  type StorePortableModelAssetOptions,
  storeDocumentModelAssets,
  storePortableModelAssets,
  stripDocumentModelAssets,
} from './modelAssetStore';
import { EXPORT_NODE_ID } from './nodeGraph';

export interface DocumentDependencyInventory {
  importedImageRefs: string[];
  importedFontRefs: string[];
  importedModelRefs: string[];
  importedEnvironmentRefs: string[];
  portableImagePayloads: string[];
  portableFontAssetIds: string[];
  portableModelAssetIds: string[];
  portableEnvironmentAssetIds: string[];
  missingGraphExportTarget: boolean;
  hasGraphExportTarget: boolean;
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}

function imageSourcesForLayer(layer: ImageLayer) {
  return [layer.src, ...(layer.aiGenerationHistory?.map((variant) => variant.src) ?? [])].filter(Boolean);
}

function imageSourcesForMaterialNode(node: GraphMaterialNode) {
  return MATERIAL_TEXTURE_SOURCE_FIELDS.map((field) => node[field]).filter((source): source is string =>
    Boolean(source),
  );
}

function collectDocumentImageSources(doc: CanvasDocument): string[] {
  return [
    ...doc.layers.flatMap((layer) => (layer.kind === 'image' ? imageSourcesForLayer(layer) : [])),
    ...(doc.graph?.materialNodes ?? []).flatMap(imageSourcesForMaterialNode),
  ];
}

function collectDocumentModelSources(doc: CanvasDocument): string[] {
  return doc.layers.flatMap((layer) => (layer.kind === 'model' ? [layer.modelSrc] : []));
}

function collectDocumentEnvironmentSources(doc: CanvasDocument): string[] {
  return [
    ...(doc.graph?.environmentNodes ?? []).flatMap((node) => (node.environmentSrc ? [node.environmentSrc] : [])),
    ...(doc.graph?.scene3dNodes ?? []).flatMap((node) => (node.environmentSrc ? [node.environmentSrc] : [])),
  ];
}

export function inspectDocumentDependencies(doc: CanvasDocument): DocumentDependencyInventory {
  const imageSources = collectDocumentImageSources(doc);
  const modelSources = collectDocumentModelSources(doc);
  const environmentSources = collectDocumentEnvironmentSources(doc);
  const graphExportInput =
    doc.graph?.edges.some((edge) => edge.toId === EXPORT_NODE_ID && edge.toPort === 'in') ?? false;
  const hasGraphExportTarget = doc.graph ? graphExportInput : true;

  return {
    importedImageRefs: unique(imageSources.filter(isAssetUri)),
    importedFontRefs: unique(
      doc.layers.filter((layer) => layer.kind === 'text' && isFontUri(layer.font)).map((layer) => layer.font),
    ),
    importedModelRefs: unique(modelSources.filter(isModelUri)),
    importedEnvironmentRefs: unique(environmentSources.filter(isEnvironmentUri)),
    portableImagePayloads: unique(imageSources.filter(isImageDataUrl)),
    portableFontAssetIds: unique(doc.fontAssets?.map((asset) => asset.id) ?? []),
    portableModelAssetIds: unique(doc.modelAssets?.map((asset) => asset.id) ?? []),
    portableEnvironmentAssetIds: unique(doc.envAssets?.map((asset) => asset.id) ?? []),
    hasGraphExportTarget,
    missingGraphExportTarget: Boolean(doc.graph && !hasGraphExportTarget),
  };
}

export function hasPortableDocumentPayloads(doc: CanvasDocument) {
  const inventory = inspectDocumentDependencies(doc);
  return (
    inventory.portableImagePayloads.length > 0 ||
    inventory.portableFontAssetIds.length > 0 ||
    inventory.portableModelAssetIds.length > 0 ||
    inventory.portableEnvironmentAssetIds.length > 0 ||
    doc.layers.some((layer): layer is ModelLayer => layer.kind === 'model' && isModelDataUrl(layer.modelSrc)) ||
    (doc.graph?.environmentNodes ?? []).some((node) =>
      Boolean(node.environmentSrc && isEnvironmentDataUrl(node.environmentSrc)),
    ) ||
    (doc.graph?.scene3dNodes ?? []).some((node): node is GraphScene3DNode =>
      Boolean(node.environmentSrc && isEnvironmentDataUrl(node.environmentSrc)),
    )
  );
}

export interface PreparePortableDocumentOptions
  extends HydrateDocumentImageAssetOptions,
    HydrateDocumentFontAssetOptions,
    HydrateDocumentModelAssetOptions,
    HydrateDocumentEnvironmentAssetOptions {}

export async function preparePortableDocument(
  doc: CanvasDocument,
  options: PreparePortableDocumentOptions = {},
): Promise<CanvasDocument> {
  return hydrateDocumentEnvironmentAssets(
    await hydrateDocumentModelAssets(
      await hydrateDocumentFontAssets(await hydrateDocumentImageAssets(doc, options), options),
      options,
    ),
    options,
  );
}

export interface StorePortableDocumentAssetOptions
  extends StoreDocumentImageAssetOptions,
    StoreDocumentFontAssetOptions,
    StoreDocumentModelAssetOptions,
    StorePortableModelAssetOptions,
    StoreDocumentEnvironmentAssetOptions,
    StorePortableEnvironmentAssetOptions {}

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
    storedDoc = await storeDocumentFontAssets(storedDoc, options);
  } catch {
    // Font payloads are portable import data only; keep the font ref and let
    // the renderer/UI fall back when the local font cannot be stored.
    storedDoc = stripDocumentFontAssets(storedDoc);
  }
  try {
    storedDoc = await storeDocumentModelAssets(storedDoc, options);
    storedDoc = await storePortableModelAssets(storedDoc, options);
  } catch {
    storedDoc = stripDocumentModelAssets(storedDoc);
  }
  try {
    storedDoc = await storeDocumentEnvironmentAssets(storedDoc, options);
    return await storePortableEnvironmentAssets(storedDoc, options);
  } catch {
    return stripDocumentEnvironmentAssets(storedDoc);
  }
}

export function stripPortableDocumentAssets(doc: CanvasDocument): CanvasDocument {
  return stripDocumentEnvironmentAssets(stripDocumentModelAssets(stripDocumentFontAssets(doc)));
}

import type { CanvasDocument, PortableFontAsset } from '../types/config';
import { MATERIAL_TEXTURE_SOURCE_FIELDS } from '../types/config';
import { apiErrorFields, fetchApiResponse, readApiJson } from './apiClient';
import {
  type PreparePortableDocumentOptions,
  preparePortableDocument,
  storePortableDocumentAssets,
  stripPortableDocumentAssets,
} from './documentAssets';
import {
  mapDocumentEnvironmentSources,
  mapDocumentImageSources,
  mapDocumentModelSources,
} from './documentSourceMapping';
import { fontUriFromId, isFontUri } from './fontStore';
import { blobToBase64DataUrl, dataUrlMime, estimateDataUrlBytes } from './storagePrimitives';

const CLOUD_ASSET_URI_PREFIX = 'artifact-cloud-asset://';
const CLOUD_ASSET_KINDS = new Set(['image', 'font', 'model', 'environment']);

type CloudProjectAssetKind = 'image' | 'font' | 'model' | 'environment';

interface CloudProjectAssetClientOptions extends PreparePortableDocumentOptions {
  baseUrl?: string;
  bearerToken?: string | null;
  fetcher?: typeof fetch;
  signal?: AbortSignal;
}

interface UploadedCloudAsset {
  id: string;
  kind: CloudProjectAssetKind;
  uri: string;
  mime: string;
  bytes: number;
}

interface UploadCloudAssetInput {
  kind: CloudProjectAssetKind;
  dataUrl: string;
  mime?: string;
  label?: string;
}

function isUploadedCloudAsset(value: unknown): value is UploadedCloudAsset {
  if (!value || typeof value !== 'object') return false;
  const asset = value as Partial<UploadedCloudAsset>;
  return (
    typeof asset.id === 'string' &&
    typeof asset.kind === 'string' &&
    typeof asset.uri === 'string' &&
    typeof asset.mime === 'string' &&
    typeof asset.bytes === 'number'
  );
}

function isCloudAssetUri(value: string): boolean {
  return value.startsWith(CLOUD_ASSET_URI_PREFIX);
}

function cloudAssetUri(kind: CloudProjectAssetKind, id: string) {
  return `${CLOUD_ASSET_URI_PREFIX}${kind}/${id}`;
}

function parseCloudAssetUri(value: string): { kind: CloudProjectAssetKind; id: string } | null {
  if (!isCloudAssetUri(value)) return null;
  const [kind, id] = value.slice(CLOUD_ASSET_URI_PREFIX.length).split('/');
  if (!kind || !id || !CLOUD_ASSET_KINDS.has(kind)) return null;
  return { kind: kind as CloudProjectAssetKind, id };
}

function hasCloudAssetRefs(doc: CanvasDocument): boolean {
  return collectDocumentSources(doc).some(isCloudAssetUri);
}

export async function prepareCloudProjectDocument(
  doc: CanvasDocument,
  options: CloudProjectAssetClientOptions = {},
): Promise<CanvasDocument> {
  const portableDoc = await preparePortableDocument(doc, options);
  const uploader = createCloudAssetUploader(options);
  const fontAssetsByUri = new Map(
    (portableDoc.fontAssets ?? []).map((asset) => [fontUriFromId(asset.id), asset] as const),
  );
  const modelLabelsByDataUrl = new Map((portableDoc.modelAssets ?? []).map((asset) => [asset.dataUrl, asset.label]));
  const environmentLabelsByDataUrl = new Map(
    (portableDoc.envAssets ?? []).map((asset) => [asset.dataUrl, asset.label]),
  );

  let cloudDoc = await mapDocumentImageSources(portableDoc, (source) =>
    source.startsWith('data:image/')
      ? uploader.upload({ kind: 'image', dataUrl: source, label: 'Project image' })
      : Promise.resolve(source),
  );
  cloudDoc = await mapDocumentFontSources(cloudDoc, async (font) => {
    const asset = fontAssetsByUri.get(font);
    if (!asset) return font;
    return uploader.upload({
      kind: 'font',
      dataUrl: asset.dataUrl,
      mime: asset.mime,
      label: asset.label,
    });
  });
  cloudDoc = await mapDocumentModelSources(cloudDoc, (source, layer) =>
    isModelDataUrl(source)
      ? uploader.upload({
          kind: 'model',
          dataUrl: source,
          mime: layer.modelMime,
          label: layer.modelName || modelLabelsByDataUrl.get(source) || 'Project model',
        })
      : Promise.resolve(source),
  );
  cloudDoc = await mapDocumentEnvironmentSources(cloudDoc, (source, node) =>
    isEnvironmentDataUrl(source)
      ? uploader.upload({
          kind: 'environment',
          dataUrl: source,
          mime: node.environmentMime,
          label: node.environmentName || environmentLabelsByDataUrl.get(source) || 'Project environment',
        })
      : Promise.resolve(source),
  );
  return stripPortableDocumentAssets(cloudDoc);
}

export async function hydrateCloudProjectDocument(
  doc: CanvasDocument,
  options: CloudProjectAssetClientOptions = {},
): Promise<CanvasDocument> {
  if (!hasCloudAssetRefs(doc)) return doc;
  const downloader = createCloudAssetDownloader(options);
  const fontAssets: PortableFontAsset[] = [];

  let hydratedDoc = await mapDocumentImageSources(doc, async (source) => {
    const cloud = parseCloudAssetUri(source);
    if (!cloud || cloud.kind !== 'image') return source;
    return downloader.downloadOrKeepRef(source, cloud);
  });
  hydratedDoc = await mapDocumentFontSources(hydratedDoc, async (font) => {
    const cloud = parseCloudAssetUri(font);
    if (!cloud || cloud.kind !== 'font') return font;
    const dataUrl = await downloader.downloadOrKeepRef(font, cloud);
    if (dataUrl === font) return font;
    fontAssets.push({
      id: cloud.id,
      dataUrl,
      mime: dataUrlMime(dataUrl),
      bytes: estimateDataUrlBytes(dataUrl),
      label: 'Cloud font',
      family: `Artifact Cloud ${cloud.id.replaceAll(/[^a-zA-Z0-9]+/g, ' ')}`,
      createdAt: new Date().toISOString(),
      source: 'local-file',
      embeddingPolicy: 'user-confirmed-required',
    });
    return fontUriFromId(cloud.id);
  });
  hydratedDoc = await mapDocumentModelSources(hydratedDoc, async (source) => {
    const cloud = parseCloudAssetUri(source);
    if (!cloud || cloud.kind !== 'model') return source;
    return downloader.downloadOrKeepRef(source, cloud);
  });
  hydratedDoc = await mapDocumentEnvironmentSources(hydratedDoc, async (source) => {
    const cloud = parseCloudAssetUri(source);
    if (!cloud || cloud.kind !== 'environment') return source;
    return downloader.downloadOrKeepRef(source, cloud);
  });

  return storePortableDocumentAssets({
    ...hydratedDoc,
    ...(fontAssets.length ? { fontAssets: [...(hydratedDoc.fontAssets ?? []), ...fontAssets] } : {}),
  });
}

function createCloudAssetUploader(options: CloudProjectAssetClientOptions) {
  const cache = new Map<string, Promise<string>>();
  return {
    upload(input: UploadCloudAssetInput) {
      const key = `${input.kind}:${input.dataUrl}`;
      const cached = cache.get(key);
      if (cached) return cached;
      const promise = uploadCloudAsset(input, options).then(
        (asset) => asset.uri || cloudAssetUri(input.kind, asset.id),
      );
      cache.set(key, promise);
      return promise;
    },
  };
}

function createCloudAssetDownloader(options: CloudProjectAssetClientOptions) {
  const cache = new Map<string, Promise<string>>();
  const download = (asset: { kind: CloudProjectAssetKind; id: string }) => {
    const cached = cache.get(asset.id);
    if (cached) return cached;
    const promise = downloadCloudAssetDataUrl(asset.id, options);
    cache.set(asset.id, promise);
    return promise;
  };
  return {
    download,
    async downloadOrKeepRef(source: string, asset: { kind: CloudProjectAssetKind; id: string }) {
      try {
        return await download(asset);
      } catch {
        return source;
      }
    },
  };
}

async function uploadCloudAsset(
  input: UploadCloudAssetInput,
  options: CloudProjectAssetClientOptions,
): Promise<UploadedCloudAsset> {
  const body = await requestJson(
    '/api/project-assets',
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
    options,
  );
  const asset = body && typeof body === 'object' ? (body as Record<string, unknown>).asset : null;
  if (!asset || typeof asset !== 'object') throw new Error('Cloud asset API returned an invalid asset.');
  if (!isUploadedCloudAsset(asset)) throw new Error('Cloud asset API returned an incomplete asset.');
  return asset;
}

async function downloadCloudAssetDataUrl(id: string, options: CloudProjectAssetClientOptions): Promise<string> {
  const response = await fetchApiResponse(`/api/assets/${encodeURIComponent(id)}/file`, {}, options);
  if (!response.ok) throw new Error('Cloud project asset could not be downloaded.');
  return blobToBase64DataUrl(await response.blob());
}

async function requestJson(path: string, init: RequestInit, options: CloudProjectAssetClientOptions): Promise<unknown> {
  const response = await fetchApiResponse(path, init, options);
  const body = await readApiJson(response);
  if (!response.ok) {
    throw new Error(apiErrorFields(body, 'Cloud asset request failed.').message);
  }
  return body;
}

function isModelDataUrl(src: string) {
  return src.startsWith('data:model/gltf-binary') || src.startsWith('data:application/octet-stream');
}

function isEnvironmentDataUrl(src: string) {
  return (
    src.startsWith('data:image/x-exr') ||
    src.startsWith('data:image/vnd.radiance') ||
    src.startsWith('data:application/octet-stream')
  );
}

function collectDocumentSources(doc: CanvasDocument): string[] {
  return [
    ...doc.layers.flatMap((layer) => {
      if (layer.kind === 'image')
        return [layer.src, ...(layer.aiGenerationHistory?.map((variant) => variant.src) ?? [])];
      if (layer.kind === 'text') return [layer.font];
      if (layer.kind === 'model') return [layer.modelSrc];
      return [];
    }),
    ...(doc.graph?.materialNodes ?? []).flatMap((node) =>
      MATERIAL_TEXTURE_SOURCE_FIELDS.map((field) => node[field]).filter((source): source is string => Boolean(source)),
    ),
    ...(doc.graph?.environmentNodes ?? []).flatMap((node) => (node.environmentSrc ? [node.environmentSrc] : [])),
    ...(doc.graph?.scene3dNodes ?? []).flatMap((node) => (node.environmentSrc ? [node.environmentSrc] : [])),
  ];
}

async function mapDocumentFontSources(
  doc: CanvasDocument,
  mapSource: (source: string) => Promise<string>,
): Promise<CanvasDocument> {
  let changed = false;
  const layers = await Promise.all(
    doc.layers.map(async (layer) => {
      if (layer.kind !== 'text' || (!isFontUri(layer.font) && !isCloudAssetUri(layer.font))) return layer;
      const font = await mapSource(layer.font);
      changed ||= font !== layer.font;
      return font === layer.font ? layer : { ...layer, font };
    }),
  );
  return changed ? { ...doc, layers } : doc;
}

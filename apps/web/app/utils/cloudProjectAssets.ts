import type {
  CanvasDocument,
  GraphEnvironmentNode,
  GraphMaterialNode,
  GraphScene3DNode,
  ImageLayer,
  Layer,
  ModelLayer,
  PortableFontAsset,
} from '../types/config';
import { MATERIAL_TEXTURE_SOURCE_FIELDS } from '../types/config';
import {
  type PreparePortableDocumentOptions,
  preparePortableDocument,
  storePortableDocumentAssets,
  stripPortableDocumentAssets,
} from './documentAssets';
import { fontUriFromId, isFontUri } from './fontStore';
import { estimateDataUrlBytes } from './storagePrimitives';

const CLOUD_ASSET_URI_PREFIX = 'artifact-cloud-asset://';
const CLOUD_ASSET_KINDS = new Set(['image', 'font', 'model', 'environment']);

export type CloudProjectAssetKind = 'image' | 'font' | 'model' | 'environment';

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

function endpoint(baseUrl: string | undefined, path: string) {
  return `${baseUrl?.replace(/\/$/, '') ?? ''}${path}`;
}

export function isCloudAssetUri(value: string): boolean {
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

export function hasCloudAssetRefs(doc: CanvasDocument): boolean {
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
  const value = asset as Partial<UploadedCloudAsset>;
  if (
    typeof value.id !== 'string' ||
    typeof value.kind !== 'string' ||
    typeof value.uri !== 'string' ||
    typeof value.mime !== 'string' ||
    typeof value.bytes !== 'number'
  ) {
    throw new Error('Cloud asset API returned an incomplete asset.');
  }
  return value as UploadedCloudAsset;
}

async function downloadCloudAssetDataUrl(id: string, options: CloudProjectAssetClientOptions): Promise<string> {
  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher(endpoint(options.baseUrl, `/api/assets/${encodeURIComponent(id)}/file`), {
    credentials: 'include',
    headers: {
      ...(options.bearerToken ? { authorization: `Bearer ${options.bearerToken}` } : {}),
    },
    signal: options.signal,
  });
  if (!response.ok) throw new Error('Cloud project asset could not be downloaded.');
  return blobToDataUrl(await response.blob());
}

async function requestJson(path: string, init: RequestInit, options: CloudProjectAssetClientOptions): Promise<unknown> {
  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher(endpoint(options.baseUrl, path), {
    credentials: 'include',
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(options.bearerToken ? { authorization: `Bearer ${options.bearerToken}` } : {}),
      ...init.headers,
    },
    signal: options.signal,
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const errorBody = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
    throw new Error(typeof errorBody.message === 'string' ? errorBody.message : 'Cloud asset request failed.');
  }
  return body;
}

function dataUrlMime(dataUrl: string) {
  return /^data:([^;,]+)[;,]/.exec(dataUrl)?.[1] ?? 'application/octet-stream';
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

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(typeof event.target?.result === 'string' ? event.target.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('Could not read cloud asset'));
    reader.readAsDataURL(blob);
  });
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

async function mapDocumentImageSources(
  doc: CanvasDocument,
  mapSource: (source: string) => Promise<string>,
): Promise<CanvasDocument> {
  let changed = false;
  const layers: Layer[] = [];
  for (const layer of doc.layers) {
    if (layer.kind !== 'image') {
      layers.push(layer);
      continue;
    }
    const src = await mapSource(layer.src);
    const aiGenerationHistory = layer.aiGenerationHistory?.length
      ? await Promise.all(
          layer.aiGenerationHistory.map(async (variant) => {
            const variantSrc = await mapSource(variant.src);
            return variantSrc === variant.src ? variant : { ...variant, src: variantSrc };
          }),
        )
      : layer.aiGenerationHistory;
    changed ||=
      src !== layer.src ||
      Boolean(aiGenerationHistory?.some((variant, index) => variant.src !== layer.aiGenerationHistory?.[index]?.src));
    layers.push({ ...layer, src, aiGenerationHistory } satisfies ImageLayer);
  }

  let graph = doc.graph;
  if (graph?.materialNodes?.length) {
    let graphChanged = false;
    const materialNodes: GraphMaterialNode[] = [];
    for (const node of graph.materialNodes) {
      const nextNode = { ...node };
      for (const field of MATERIAL_TEXTURE_SOURCE_FIELDS) {
        const source = nextNode[field];
        if (!source) continue;
        const mapped = await mapSource(source);
        if (mapped !== source) {
          nextNode[field] = mapped;
          graphChanged = true;
        }
      }
      materialNodes.push(nextNode);
    }
    if (graphChanged) {
      changed = true;
      graph = { ...graph, materialNodes };
    }
  }

  return changed ? { ...doc, layers, graph } : doc;
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

import type { AiGenerationJob } from '../types/aiGeneration';
import { isAssetUri, isImageDataUrl, saveImageAsset, saveImageBlobAsset } from './assetStore';

export interface StoreAiGeneratedAssetOptions {
  baseUrl?: string;
  fetcher?: typeof fetch;
  signal?: AbortSignal;
  saveDataUrlAsset?: typeof saveImageAsset;
  saveBlobAsset?: typeof saveImageBlobAsset;
}

function assetEndpoint(baseUrl: string | undefined, uri: string) {
  if (!baseUrl || /^https?:\/\//i.test(uri) || uri.startsWith('data:') || uri.startsWith('artifact-asset://'))
    return uri;
  return `${baseUrl.replace(/\/$/, '')}${uri.startsWith('/') ? uri : `/${uri}`}`;
}

export function getAiGeneratedAssetUri(job: AiGenerationJob): string {
  if (job.status !== 'succeeded' || !job.asset?.uri) {
    throw new Error('Generation job has no completed image asset.');
  }
  return job.asset.uri;
}

export async function storeAiGeneratedAssetSource(
  job: AiGenerationJob,
  options: StoreAiGeneratedAssetOptions = {},
): Promise<string> {
  const uri = getAiGeneratedAssetUri(job);
  if (isAssetUri(uri)) return uri;
  if (isImageDataUrl(uri)) return (options.saveDataUrlAsset ?? saveImageAsset)(uri);

  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher(assetEndpoint(options.baseUrl, uri), {
    credentials: 'include',
    signal: options.signal,
  });
  if (!response.ok) throw new Error('Could not download generated image asset.');
  return (options.saveBlobAsset ?? saveImageBlobAsset)(await response.blob());
}

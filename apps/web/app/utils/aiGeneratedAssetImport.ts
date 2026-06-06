import type { AiGenerationJob } from '../types/aiGeneration';
import { isAssetUri, isImageDataUrl, saveImageAsset, saveImageBlobAsset } from './assetStore';

export interface StoreAiGeneratedAssetOptions {
  baseUrl?: string;
  devToken?: string;
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

function getAiGeneratedAssetUri(job: AiGenerationJob): string {
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
    headers: options.devToken ? { authorization: `Bearer ${options.devToken}` } : undefined,
    signal: options.signal,
  });
  if (!response.ok) throw new Error(await generatedAssetDownloadError(response));
  return (options.saveBlobAsset ?? saveImageBlobAsset)(await response.blob());
}

async function generatedAssetDownloadError(response: Response) {
  const fallback = `Could not download generated image asset. HTTP ${response.status}`;
  try {
    const body = (await response.clone().json()) as { code?: unknown; message?: unknown };
    const message = typeof body.message === 'string' ? body.message : undefined;
    const code = typeof body.code === 'string' ? body.code : undefined;
    return [fallback, code, message].filter(Boolean).join(' - ');
  } catch {
    return fallback;
  }
}

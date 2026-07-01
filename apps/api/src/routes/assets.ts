import type { RequestLike, RequestUserResolution } from '../auth.js';
import type { AiErrorResponse } from '../contracts.js';
import type { ApiRepositories } from '../db/repositories.js';
import { type ApiResponse, binary, errorJson } from '../http.js';
import { logInfo, logWarn } from '../logger.js';
import type { AssetStorage } from '../storage/index.js';

export interface AssetRouteRequest extends RequestLike {
  method?: string;
  url?: string;
}

export interface AssetRouteDeps {
  repositories: ApiRepositories;
  storage: AssetStorage;
  resolveAuth(request: RequestLike): Promise<RequestUserResolution>;
}

export async function handleAssetRequest(
  request: AssetRouteRequest,
  deps: AssetRouteDeps,
): Promise<ApiResponse<AiErrorResponse> | null> {
  const method = request.method ?? 'GET';
  const pathname = new URL(request.url ?? '/', 'http://artifact.local').pathname;
  const match = /^\/api\/assets\/([^/]+)\/file$/.exec(pathname);

  if (!match?.[1] || method !== 'GET') return null;

  return handleAssetFileRequest(request, decodeURIComponent(match[1]), deps);
}

export async function handleAssetFileRequest(
  request: RequestLike,
  assetId: string,
  deps: AssetRouteDeps,
): Promise<ApiResponse<AiErrorResponse>> {
  const auth = await deps.resolveAuth(request);
  if (!auth.authenticated) {
    logWarn('asset.download_denied', { assetId, reason: 'unauthenticated' });
    return errorJson(401, 'unauthenticated', 'Sign in before downloading generated assets.');
  }

  const asset = await deps.repositories.assets.findByIdForUser(assetId, auth.user.id);
  if (!asset || asset.deleted_at) {
    logWarn('asset.download_denied', { assetId, userId: auth.user.id, reason: 'not_found' });
    return errorJson(404, 'not_found', 'Generated asset not found.');
  }

  const file = await deps.storage.readImage(asset.storage_key);
  if (!file) {
    logWarn('asset.download_denied', { assetId, userId: auth.user.id, reason: 'asset_file_missing' });
    return errorJson(404, 'asset_file_missing', 'Generated asset file is missing from storage.');
  }

  logInfo('asset.download_succeeded', {
    assetId,
    userId: auth.user.id,
    mimeType: asset.mime_type,
    sizeBytes: file.bytes.byteLength,
  });
  return binary(200, file.bytes, assetDownloadHeaders(asset.mime_type, file.bytes.byteLength));
}

function assetDownloadHeaders(mimeType: string, byteLength: number) {
  const headers: Record<string, string> = {
    'cache-control': 'private, max-age=300',
    'content-length': String(byteLength),
    'content-type': mimeType,
  };
  if (mimeType === 'image/svg+xml') {
    headers['content-disposition'] = 'attachment';
    headers['content-security-policy'] = "default-src 'none'; sandbox";
    headers['x-content-type-options'] = 'nosniff';
  }
  return headers;
}

import type { RequestLike, RequestUserResolution } from '../auth.js';
import type { AiErrorResponse } from '../contracts.js';
import type { ApiRepositories } from '../db/repositories.js';
import { type ApiResponse, binary, errorJson } from '../http.js';
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
  if (!auth.authenticated) return errorJson(401, 'unauthenticated', 'Sign in before downloading generated assets.');

  const asset = await deps.repositories.assets.findByIdForUser(assetId, auth.user.id);
  if (!asset || asset.deleted_at) return errorJson(404, 'not_found', 'Generated asset not found.');

  const file = await deps.storage.readImage(asset.storage_key);
  if (!file) return errorJson(404, 'asset_file_missing', 'Generated asset file is missing from storage.');

  return binary(200, file.bytes, {
    'cache-control': 'private, max-age=300',
    'content-length': String(file.bytes.byteLength),
    'content-type': asset.mime_type,
  });
}

import { createHash, randomUUID } from 'node:crypto';
import type { RequestLike, RequestUserResolution } from '../auth.js';
import type { AiErrorResponse } from '../contracts.js';
import type { ApiRepositories } from '../db/repositories.js';
import { type ApiResponse, errorJson, json, RequestBodyTooLargeError, readJsonBody } from '../http.js';
import { logInfo, logWarn } from '../logger.js';
import type { AssetStorage } from '../storage/index.js';

const MAX_PROJECT_ASSET_BODY_BYTES = 32 * 1024 * 1024;
const CLOUD_ASSET_KINDS = new Set(['image', 'font', 'model', 'environment']);
const FALLBACK_MIME = 'application/octet-stream';
const ALLOWED_PROJECT_ASSET_MIME_TYPES: Record<string, Set<string>> = {
  image: new Set(['image/jpeg', 'image/png', 'image/svg+xml', 'image/webp']),
  font: new Set([
    'application/font-woff',
    'application/font-woff2',
    'application/vnd.ms-fontobject',
    'font/otf',
    'font/ttf',
    'font/woff',
    'font/woff2',
  ]),
  model: new Set(['application/octet-stream', 'model/gltf-binary', 'model/gltf+json']),
  environment: new Set(['application/octet-stream', 'image/vnd.radiance', 'image/x-exr']),
};

export interface ProjectAssetRouteRequest extends RequestLike, AsyncIterable<Buffer> {
  method?: string;
  url?: string;
}

export interface ProjectAssetRouteDeps {
  repositories: ApiRepositories;
  storage: AssetStorage;
  resolveAuth(request: RequestLike): Promise<RequestUserResolution>;
  createId?: () => string;
}

interface UploadProjectAssetRequest {
  kind?: unknown;
  dataUrl?: unknown;
  mime?: unknown;
  label?: unknown;
}

export interface ProjectAssetResponse {
  id: string;
  kind: string;
  uri: string;
  mime: string;
  bytes: number;
}

export async function handleProjectAssetRequest(
  request: ProjectAssetRouteRequest,
  deps: ProjectAssetRouteDeps,
): Promise<ApiResponse<{ asset: ProjectAssetResponse } | AiErrorResponse> | null> {
  const method = request.method ?? 'GET';
  const pathname = new URL(request.url ?? '/', 'http://artifact.local').pathname;
  if (method !== 'POST' || pathname !== '/api/project-assets') return null;

  const auth = await deps.resolveAuth(request);
  if (!auth.authenticated) {
    logWarn('project_asset.upload_denied', { reason: auth.reason });
    return errorJson(401, 'unauthenticated', 'Sign in before syncing project assets.');
  }

  const user = await deps.repositories.users.upsertFromAuth({ id: auth.user.id, email: auth.user.email });
  if (user.disabled_at) return errorJson(403, 'account_disabled', 'This account is disabled.');

  const body = await readUploadBody(request);
  if (!body.ok) return body.response;

  const sizeBytes = body.value.bytes.byteLength;
  const sha256 = createHash('sha256').update(body.value.bytes).digest('hex');
  const existing = await deps.repositories.assets.findProjectAssetByFingerprintForUser({
    userId: user.id,
    kind: `project-${body.value.kind}`,
    mimeType: body.value.mime,
    sizeBytes,
    sha256,
  });
  if (existing) {
    logInfo('project_asset.reused', {
      assetId: existing.id,
      userId: user.id,
      kind: body.value.kind,
      sizeBytes: existing.size_bytes,
    });
    return json(200, {
      asset: {
        id: existing.id,
        kind: body.value.kind,
        uri: `artifact-cloud-asset://${body.value.kind}/${existing.id}`,
        mime: existing.mime_type,
        bytes: existing.size_bytes,
      },
    });
  }

  const assetId = deps.createId?.() ?? randomUUID();
  const stored = await deps.storage.writeImage({
    assetId,
    bytes: body.value.bytes,
    mimeType: body.value.mime,
  });
  const asset = await deps.repositories.assets.create({
    id: assetId,
    userId: user.id,
    kind: `project-${body.value.kind}`,
    storageKey: stored.storageKey,
    mimeType: body.value.mime,
    width: 1,
    height: 1,
    sizeBytes: body.value.bytes.byteLength,
    metadataJson: {
      label: body.value.label,
      projectAssetKind: body.value.kind,
      sha256,
    },
  });

  logInfo('project_asset.uploaded', {
    assetId,
    userId: user.id,
    kind: body.value.kind,
    sizeBytes: asset.size_bytes,
  });
  return json(200, {
    asset: {
      id: asset.id,
      kind: body.value.kind,
      uri: `artifact-cloud-asset://${body.value.kind}/${asset.id}`,
      mime: asset.mime_type,
      bytes: asset.size_bytes,
    },
  });
}

async function readUploadBody(
  request: ProjectAssetRouteRequest,
): Promise<
  | { ok: true; value: { kind: string; dataUrl: string; bytes: Uint8Array; mime: string; label: string } }
  | { ok: false; response: ApiResponse<AiErrorResponse> }
> {
  try {
    const body = await readJsonBody<UploadProjectAssetRequest>(request, { maxBytes: MAX_PROJECT_ASSET_BODY_BYTES });
    const normalized = normalizeUploadBody(body);
    return normalized.ok ? normalized : { ok: false, response: errorJson(400, 'invalid_request', normalized.message) };
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return { ok: false, response: errorJson(413, 'payload_too_large', 'Project asset is too large to sync.') };
    }
    return { ok: false, response: errorJson(400, 'invalid_json', 'Request body must be valid JSON.') };
  }
}

function normalizeUploadBody(
  body: UploadProjectAssetRequest,
):
  | { ok: true; value: { kind: string; dataUrl: string; bytes: Uint8Array; mime: string; label: string } }
  | { ok: false; message: string } {
  if (typeof body.kind !== 'string' || !CLOUD_ASSET_KINDS.has(body.kind)) {
    return { ok: false, message: 'Project asset kind is not supported.' };
  }
  if (typeof body.dataUrl !== 'string') return { ok: false, message: 'Project asset payload is required.' };
  const parsed = parseDataUrl(body.dataUrl);
  if (!parsed) return { ok: false, message: 'Project asset payload must be a data URL.' };
  const mime = normalizeMime(body.kind, parsed.mime, body.mime);
  if (!mime.ok) return mime;
  const label = typeof body.label === 'string' && body.label.trim() ? body.label.trim().slice(0, 160) : 'Project asset';
  return {
    ok: true,
    value: {
      kind: body.kind,
      dataUrl: body.dataUrl,
      bytes: parsed.bytes,
      mime: mime.value,
      label,
    },
  };
}

function normalizeMime(
  kind: string,
  parsedMime: string,
  declaredMime: unknown,
): { ok: true; value: string } | { ok: false; message: string } {
  const parsed = parsedMime.trim().toLowerCase() || FALLBACK_MIME;
  const declared = typeof declaredMime === 'string' && declaredMime.trim() ? declaredMime.trim().toLowerCase() : null;
  if (declared && parsed !== FALLBACK_MIME && declared !== parsed) {
    return { ok: false, message: 'Project asset MIME does not match its payload.' };
  }
  const mime = parsed === FALLBACK_MIME && declared ? declared : parsed;
  const allowed = ALLOWED_PROJECT_ASSET_MIME_TYPES[kind];
  if (!allowed?.has(mime)) {
    return { ok: false, message: 'Project asset MIME is not supported for this asset kind.' };
  }
  return { ok: true, value: mime };
}

function parseDataUrl(dataUrl: string): { mime: string; bytes: Uint8Array } | null {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl);
  if (!match) return null;
  const mime = match[1] || FALLBACK_MIME;
  const payload = match[3] ?? '';
  const bytes = match[2] ? Buffer.from(payload, 'base64') : Buffer.from(decodeURIComponent(payload), 'utf8');
  return { mime, bytes };
}

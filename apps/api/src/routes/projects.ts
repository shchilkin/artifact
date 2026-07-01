import { randomUUID } from 'node:crypto';
import type { RequestLike, RequestUserResolution } from '../auth.js';
import { isCloudProjectOwnershipConflictError } from '../db/errors.js';
import type { ApiRepositories } from '../db/repositories.js';
import type { CloudProjectRow, JsonObject } from '../db/types.js';
import { errorJson, type JsonResponse, json, RequestBodyTooLargeError, readJsonBody } from '../http.js';
import { logInfo, logWarn } from '../logger.js';
import { collectCloudProjectAssetIds } from '../projectAssetRefs.js';

const MAX_PROJECT_BODY_BYTES = 5 * 1024 * 1024;

export interface ProjectRouteRequest extends RequestLike, AsyncIterable<Buffer> {
  method?: string;
  url?: string;
}

export interface ProjectRouteDeps {
  repositories: ApiRepositories;
  resolveAuth(request: RequestLike): Promise<RequestUserResolution>;
  createId?: () => string;
}

export interface CloudProjectResponse {
  id: string;
  name: string;
  doc: JsonObject;
  thumbnail: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SaveCloudProjectRequest {
  id?: unknown;
  name?: unknown;
  doc?: unknown;
  thumbnail?: unknown;
}

export async function handleProjectRequest(
  request: ProjectRouteRequest,
  deps: ProjectRouteDeps,
): Promise<JsonResponse<
  | { projects: CloudProjectResponse[] }
  | { project: CloudProjectResponse }
  | { ok: true }
  | { code: string; message: string }
> | null> {
  const method = request.method ?? 'GET';
  const pathname = new URL(request.url ?? '/', 'http://artifact.local').pathname;

  if (method === 'GET' && pathname === '/api/projects') return handleListProjects(request, deps);
  if (method === 'POST' && pathname === '/api/projects') return handleSaveProject(request, deps);

  const deleteProjectId = deleteProjectIdFromPath(pathname);
  if (method === 'DELETE' && deleteProjectId) return handleDeleteProject(request, deleteProjectId, deps);

  return null;
}

async function handleListProjects(request: ProjectRouteRequest, deps: ProjectRouteDeps) {
  const auth = await requireAuth(request, deps);
  if (!auth.authenticated) return auth.response;
  const projects = await deps.repositories.projects.listForUser(auth.user.id);
  return json(200, { projects: projects.map(projectResponse) });
}

async function handleSaveProject(request: ProjectRouteRequest, deps: ProjectRouteDeps) {
  const auth = await requireAuth(request, deps);
  if (!auth.authenticated) return auth.response;

  const body = await readSaveProjectBody(request);
  if (!body.ok) return body.response;

  const projectId = body.value.id ?? deps.createId?.() ?? randomUUID();
  const project = await upsertProjectForUser(projectId, auth.user.id, body.value, deps);
  if ('status' in project) return project;

  await reconcileProjectAssetsBestEffort(auth.user.id, deps.repositories, 'save');

  logInfo('cloud_project.saved', { projectId: project.id, userId: auth.user.id });
  return json(200, { project: projectResponse(project) });
}

async function upsertProjectForUser(
  id: string,
  userId: string,
  value: { name: string; doc: JsonObject; thumbnail?: string | null },
  deps: ProjectRouteDeps,
) {
  try {
    return await deps.repositories.projects.upsert({
      id,
      userId,
      name: value.name,
      docJson: value.doc,
      thumbnail: value.thumbnail,
    });
  } catch (error) {
    if (isCloudProjectOwnershipConflictError(error)) {
      return errorJson(409, 'project_id_conflict', 'Cloud project id belongs to another account.');
    }
    throw error;
  }
}

async function handleDeleteProject(request: ProjectRouteRequest, projectId: string, deps: ProjectRouteDeps) {
  const auth = await requireAuth(request, deps);
  if (!auth.authenticated) return auth.response;

  const deleted = await deps.repositories.projects.deleteForUser(projectId, auth.user.id);
  if (!deleted) return errorJson(404, 'not_found', 'Cloud project not found.');

  await reconcileProjectAssetsBestEffort(auth.user.id, deps.repositories, 'delete');

  logInfo('cloud_project.deleted', { projectId, userId: auth.user.id });
  return json(200, { ok: true as const });
}

async function reconcileProjectAssetsForUser(userId: string, repositories: ApiRepositories) {
  const [projects, assets] = await Promise.all([
    repositories.projects.listForUser(userId),
    repositories.assets.listProjectAssetsForUser(userId),
  ]);
  if (!assets.length) return;

  const referencedIds = new Set<string>();
  for (const project of projects) {
    for (const id of collectCloudProjectAssetIds(project.doc_json)) referencedIds.add(id);
  }

  const staleIds = assets.filter((asset) => !referencedIds.has(asset.id)).map((asset) => asset.id);
  if (!staleIds.length) return;

  const deleted = await repositories.assets.softDeleteManyForUser(staleIds, userId, new Date());
  if (deleted.length) logInfo('cloud_project_assets.reconciled', { userId, deletedAssetCount: deleted.length });
}

async function reconcileProjectAssetsBestEffort(
  userId: string,
  repositories: ApiRepositories,
  operation: 'delete' | 'save',
) {
  try {
    await reconcileProjectAssetsForUser(userId, repositories);
  } catch (error) {
    logWarn('cloud_project_assets.reconcile_failed', {
      userId,
      operation,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function requireAuth(request: ProjectRouteRequest, deps: ProjectRouteDeps) {
  const auth = await deps.resolveAuth(request);
  if (!auth.authenticated) {
    logWarn('cloud_project.auth_required', { reason: auth.reason });
    return {
      authenticated: false as const,
      response: errorJson(401, 'unauthenticated', 'Sign in before syncing projects.'),
    };
  }

  const user = await deps.repositories.users.upsertFromAuth({ id: auth.user.id, email: auth.user.email });
  if (user.disabled_at) {
    return {
      authenticated: false as const,
      response: errorJson(403, 'account_disabled', 'This account is disabled.'),
    };
  }

  return { authenticated: true as const, user };
}

async function readSaveProjectBody(
  request: ProjectRouteRequest,
): Promise<
  | { ok: true; value: { id?: string; name: string; doc: JsonObject; thumbnail?: string | null } }
  | { ok: false; response: JsonResponse<{ code: string; message: string }> }
> {
  try {
    const body = await readJsonBody<SaveCloudProjectRequest>(request, { maxBytes: MAX_PROJECT_BODY_BYTES });
    const normalized = normalizeSaveProjectBody(body);
    return normalized.ok ? normalized : { ok: false, response: errorJson(400, 'invalid_request', normalized.message) };
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return { ok: false, response: errorJson(413, 'payload_too_large', 'Project is too large to sync.') };
    }
    return { ok: false, response: errorJson(400, 'invalid_json', 'Request body must be valid JSON.') };
  }
}

function normalizeSaveProjectBody(
  body: SaveCloudProjectRequest,
):
  | { ok: true; value: { id?: string; name: string; doc: JsonObject; thumbnail?: string | null } }
  | { ok: false; message: string } {
  const id = typeof body.id === 'string' && body.id ? body.id : undefined;
  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 120) : 'Untitled project';
  if (!isJsonObject(body.doc)) return { ok: false, message: 'Project document must be a JSON object.' };
  const thumbnail = typeof body.thumbnail === 'string' && body.thumbnail ? body.thumbnail : null;
  return { ok: true, value: { ...(id ? { id } : {}), name, doc: body.doc, thumbnail } };
}

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function projectResponse(row: CloudProjectRow): CloudProjectResponse {
  return {
    id: row.id,
    name: row.name,
    doc: row.doc_json,
    thumbnail: row.thumbnail,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function deleteProjectIdFromPath(pathname: string) {
  const match = /^\/api\/projects\/([^/]+)$/.exec(pathname);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

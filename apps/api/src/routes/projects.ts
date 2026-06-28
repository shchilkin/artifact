import { randomUUID } from 'node:crypto';
import type { RequestLike, RequestUserResolution } from '../auth.js';
import type { ApiRepositories } from '../db/repositories.js';
import type { CloudProjectRow, JsonObject } from '../db/types.js';
import { errorJson, type JsonResponse, json, readJsonBody } from '../http.js';
import { logInfo, logWarn } from '../logger.js';

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

  const project = await deps.repositories.projects.upsert({
    id: body.value.id ?? deps.createId?.() ?? randomUUID(),
    userId: auth.user.id,
    name: body.value.name,
    docJson: body.value.doc,
    thumbnail: body.value.thumbnail,
  });

  logInfo('cloud_project.saved', { projectId: project.id, userId: auth.user.id });
  return json(200, { project: projectResponse(project) });
}

async function handleDeleteProject(request: ProjectRouteRequest, projectId: string, deps: ProjectRouteDeps) {
  const auth = await requireAuth(request, deps);
  if (!auth.authenticated) return auth.response;

  const deleted = await deps.repositories.projects.deleteForUser(projectId, auth.user.id);
  if (!deleted) return errorJson(404, 'not_found', 'Cloud project not found.');

  logInfo('cloud_project.deleted', { projectId, userId: auth.user.id });
  return json(200, { ok: true as const });
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
    const body = await readJsonBody<SaveCloudProjectRequest>(request);
    const normalized = normalizeSaveProjectBody(body);
    return normalized.ok ? normalized : { ok: false, response: errorJson(400, 'invalid_request', normalized.message) };
  } catch {
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

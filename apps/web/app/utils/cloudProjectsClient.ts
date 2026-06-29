import type { CanvasDocument } from '../types/config';
import { hydrateCloudProjectDocument, prepareCloudProjectDocument } from './cloudProjectAssets';
import type { PreparePortableDocumentOptions } from './documentAssets';
import { normalizeDocument } from './documentPersistence';
import { PROJECT_THUMBNAIL_FALLBACK, type SavedProject } from './projectLibrary';

export class CloudProjectsApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'CloudProjectsApiError';
    this.status = status;
    this.code = code;
  }
}

interface CloudProjectResponse {
  id: string;
  name: string;
  doc: CanvasDocument;
  thumbnail: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CloudProjectsClientOptions extends PreparePortableDocumentOptions {
  baseUrl?: string;
  bearerToken?: string | null;
  fetcher?: typeof fetch;
  signal?: AbortSignal;
}

function endpoint(baseUrl: string | undefined, path: string) {
  return `${baseUrl?.replace(/\/$/, '') ?? ''}${path}`;
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new CloudProjectsApiError('Cloud projects API returned invalid JSON.', response.status, 'invalid_json');
  }
}

async function requestJson(path: string, init: RequestInit, options: CloudProjectsClientOptions): Promise<unknown> {
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
  const body = await readJsonResponse(response);
  if (!response.ok) {
    const errorBody = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
    const message = typeof errorBody.message === 'string' ? errorBody.message : 'Cloud project request failed.';
    const code = typeof errorBody.code === 'string' ? errorBody.code : undefined;
    throw new CloudProjectsApiError(message, response.status, code);
  }
  return body;
}

function parseProject(value: unknown): SavedProject {
  if (!value || typeof value !== 'object') {
    throw new CloudProjectsApiError('Cloud projects API returned an invalid project.', 0, 'invalid_response');
  }
  const project = value as Partial<CloudProjectResponse>;
  if (
    typeof project.id !== 'string' ||
    typeof project.name !== 'string' ||
    typeof project.createdAt !== 'string' ||
    typeof project.updatedAt !== 'string' ||
    !project.doc ||
    typeof project.doc !== 'object'
  ) {
    throw new CloudProjectsApiError('Cloud projects API returned an incomplete project.', 0, 'invalid_response');
  }
  return {
    id: project.id,
    name: project.name,
    doc: normalizeDocument(project.doc),
    thumbnail: typeof project.thumbnail === 'string' ? project.thumbnail : PROJECT_THUMBNAIL_FALLBACK,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    storage: 'cloud',
  };
}

export async function listCloudProjects(options: CloudProjectsClientOptions = {}): Promise<SavedProject[]> {
  const body = await requestJson('/api/projects', { method: 'GET' }, options);
  const projects = body && typeof body === 'object' ? (body as Record<string, unknown>).projects : null;
  if (!Array.isArray(projects)) {
    throw new CloudProjectsApiError('Cloud projects API returned an invalid project list.', 0, 'invalid_response');
  }
  return projects.map(parseProject);
}

export async function saveCloudProject(
  project: SavedProject,
  options: CloudProjectsClientOptions = {},
): Promise<SavedProject> {
  const body = await requestJson(
    '/api/projects',
    {
      method: 'POST',
      body: JSON.stringify({
        id: project.id,
        name: project.name,
        doc: project.doc,
        thumbnail: project.thumbnail,
      }),
    },
    options,
  );
  const saved = body && typeof body === 'object' ? (body as Record<string, unknown>).project : null;
  return parseProject(saved);
}

export async function deleteCloudProject(id: string, options: CloudProjectsClientOptions = {}): Promise<void> {
  await requestJson(`/api/projects/${encodeURIComponent(id)}`, { method: 'DELETE' }, options);
}

export async function prepareCloudSavedProject(
  project: SavedProject,
  options: CloudProjectsClientOptions = {},
): Promise<SavedProject> {
  return {
    ...project,
    doc: await prepareCloudProjectDocument(project.doc, options),
  };
}

export async function hydrateCloudSavedProject(
  project: SavedProject,
  options: CloudProjectsClientOptions = {},
): Promise<SavedProject> {
  return {
    ...project,
    doc: normalizeDocument(await hydrateCloudProjectDocument(project.doc, options)),
  };
}

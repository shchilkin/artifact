import {
  type AiGenerationAccessState,
  type AiGenerationJob,
  type AiGenerationJobStatus,
  type AiGenerationProvider,
  type CreateAiGenerationRequest,
  isAiGenerationJobStatus,
  isAiGenerationProvider,
} from '../types/aiGeneration';

export class AiGenerationApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'AiGenerationApiError';
    this.status = status;
    this.code = code;
  }
}

export interface AiGenerationClientOptions {
  baseUrl?: string;
  fetcher?: typeof fetch;
  signal?: AbortSignal;
}

function endpoint(baseUrl: string | undefined, path: string) {
  return `${baseUrl?.replace(/\/$/, '') ?? ''}${path}`;
}

function ensureObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AiGenerationApiError('Generation API returned an invalid response.', 0, 'invalid_response');
  }
  return value as Record<string, unknown>;
}

function ensureString(value: unknown, field: string) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new AiGenerationApiError(`Generation API response is missing ${field}.`, 0, 'invalid_response');
  }
  return value;
}

function ensureProvider(value: unknown): AiGenerationProvider {
  if (!isAiGenerationProvider(value)) {
    throw new AiGenerationApiError('Generation API returned an unknown provider.', 0, 'invalid_response');
  }
  return value;
}

function ensureStatus(value: unknown): AiGenerationJobStatus {
  if (!isAiGenerationJobStatus(value)) {
    throw new AiGenerationApiError('Generation API returned an unknown job status.', 0, 'invalid_response');
  }
  return value;
}

export function parseAiGenerationJob(value: unknown): AiGenerationJob {
  const job = ensureObject(value);
  return {
    ...(job as unknown as AiGenerationJob),
    id: ensureString(job.id, 'id'),
    status: ensureStatus(job.status),
    provider: ensureProvider(job.provider),
    model: ensureString(job.model, 'model'),
    prompt: ensureString(job.prompt, 'prompt'),
    createdAt: ensureString(job.createdAt, 'createdAt'),
  };
}

export function parseAiGenerationAccessState(value: unknown): AiGenerationAccessState {
  const access = ensureObject(value);
  if (typeof access.authenticated !== 'boolean' || typeof access.enabled !== 'boolean') {
    throw new AiGenerationApiError('Generation API returned an invalid access state.', 0, 'invalid_response');
  }
  if (Array.isArray(access.providers)) {
    for (const provider of access.providers) ensureProvider(provider);
  }
  return access as unknown as AiGenerationAccessState;
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new AiGenerationApiError('Generation API returned invalid JSON.', response.status, 'invalid_json');
  }
}

async function requestJson(path: string, init: RequestInit, options: AiGenerationClientOptions): Promise<unknown> {
  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher(endpoint(options.baseUrl, path), {
    credentials: 'include',
    ...init,
    headers: {
      'content-type': 'application/json',
      ...init.headers,
    },
    signal: options.signal,
  });
  const body = await readJsonResponse(response);
  if (!response.ok) {
    const errorBody = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
    const message = typeof errorBody.message === 'string' ? errorBody.message : 'Generation request failed.';
    const code = typeof errorBody.code === 'string' ? errorBody.code : undefined;
    throw new AiGenerationApiError(message, response.status, code);
  }
  return body;
}

export async function createAiGenerationJob(
  request: CreateAiGenerationRequest,
  options: AiGenerationClientOptions = {},
): Promise<AiGenerationJob> {
  const body = await requestJson(
    '/api/ai/generations',
    {
      method: 'POST',
      body: JSON.stringify(request),
    },
    options,
  );
  return parseAiGenerationJob(body);
}

export async function getAiGenerationAccess(options: AiGenerationClientOptions = {}): Promise<AiGenerationAccessState> {
  const body = await requestJson(
    '/api/ai/access',
    {
      method: 'GET',
    },
    options,
  );
  return parseAiGenerationAccessState(body);
}

export async function getAiGenerationJob(
  id: string,
  options: AiGenerationClientOptions = {},
): Promise<AiGenerationJob> {
  const body = await requestJson(
    `/api/ai/generations/${encodeURIComponent(id)}`,
    {
      method: 'GET',
    },
    options,
  );
  return parseAiGenerationJob(body);
}

export async function cancelAiGenerationJob(
  id: string,
  options: AiGenerationClientOptions = {},
): Promise<AiGenerationJob> {
  const body = await requestJson(
    `/api/ai/generations/${encodeURIComponent(id)}/cancel`,
    {
      method: 'POST',
    },
    options,
  );
  return parseAiGenerationJob(body);
}

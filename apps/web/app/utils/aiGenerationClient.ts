import { normalizeShaderInstance, validateShaderCode, validateShaderInstance } from '@artifact/shared';
import {
  type AiGenerationAccessState,
  type AiGenerationJob,
  type AiGenerationJobStatus,
  type AiGenerationProvider,
  type AiShaderCompilerDiagnostic,
  type AiShaderGenerationResponse,
  type AiShaderRequestResponse,
  type AiShaderSource,
  type AiShaderValidationResponse,
  type CreateAiGenerationRequest,
  type CreateAiShaderRequest,
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

export function createAiIdempotencyKey(prefix = 'ai') {
  return (
    globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  );
}

export interface AiGenerationClientOptions {
  baseUrl?: string;
  devToken?: string;
  bearerToken?: string;
  fetcher?: typeof fetch;
  signal?: AbortSignal;
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
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

function ensureShaderSource(value: unknown): AiShaderSource {
  if (value !== 'openai' && value !== 'localFallback') {
    throw new AiGenerationApiError('Generation API returned an unknown shader source.', 0, 'invalid_response');
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

export function parseAiShaderGenerationResponse(value: unknown): AiShaderGenerationResponse {
  const { response, requestId, candidateRevision } = parseShaderResponseEnvelope(value);
  if (response.status !== 'generated' && response.status !== 'accepted') {
    throw new AiGenerationApiError('Generation API returned an invalid shader status.', 0, 'invalid_response');
  }
  if (
    response.attempt !== 'initial' &&
    response.attempt !== 'repair' &&
    response.attempt !== 'refine' &&
    response.attempt !== 'refineRepair' &&
    response.attempt !== 'localFallback'
  ) {
    throw new AiGenerationApiError('Generation API returned an invalid shader attempt.', 0, 'invalid_response');
  }
  const prompt = ensureString(response.prompt, 'prompt');
  const source = ensureShaderSource(response.source);
  const validationErrors = validateShaderInstance(response.instance);
  const codeIssues =
    response.instance && typeof response.instance === 'object' && 'definition' in response.instance
      ? validateShaderCode(String((response.instance as { definition?: { code?: unknown } }).definition?.code ?? ''))
      : [];
  if (validationErrors.length > 0 || codeIssues.length > 0) {
    throw new AiGenerationApiError('Generation API returned an invalid shader.', 0, 'invalid_shader');
  }
  const instance = normalizeShaderInstance(response.instance);
  if (!instance) throw new AiGenerationApiError('Generation API returned an invalid shader.', 0, 'invalid_shader');
  const model = typeof response.model === 'string' && response.model.length > 0 ? response.model : undefined;
  const warnings = Array.isArray(response.warnings)
    ? response.warnings.filter((warning): warning is string => typeof warning === 'string')
    : undefined;
  return {
    requestId,
    candidateRevision,
    status: response.status,
    attempt: response.attempt,
    prompt,
    instance: {
      ...instance,
      definition: {
        ...instance.definition,
        provenance: instance.definition.provenance ?? {
          source,
          prompt,
          ...(model ? { model } : {}),
          requestId,
          attempt: response.attempt,
        },
      },
    },
    source,
    ...(model ? { model } : {}),
    ...(warnings?.length ? { warnings } : {}),
  };
}

function parseAiShaderRequestResponse(value: unknown): AiShaderRequestResponse {
  const { response, requestId, candidateRevision } = parseShaderResponseEnvelope(value);
  if (response.status === 'generated' || response.status === 'accepted') {
    return parseAiShaderGenerationResponse(response);
  }
  if (response.status === 'failed') {
    return {
      requestId,
      candidateRevision,
      status: 'failed',
      code: ensureString(response.code, 'code'),
      message: ensureString(response.message, 'message'),
    };
  }
  if (response.status !== 'pending' && response.status !== 'repairing' && response.status !== 'client_rejected') {
    throw new AiGenerationApiError('Generation API returned an invalid shader status.', 0, 'invalid_response');
  }
  return { requestId, candidateRevision, status: response.status };
}

export function parseAiShaderValidationResponse(value: unknown): AiShaderValidationResponse {
  const { response, requestId, candidateRevision } = parseShaderResponseEnvelope(value);
  if (response.status !== 'accepted' && response.status !== 'client_rejected' && response.status !== 'failed') {
    throw new AiGenerationApiError('Generation API returned an invalid validation status.', 0, 'invalid_response');
  }
  if (typeof response.repairAvailable !== 'boolean') {
    throw new AiGenerationApiError('Generation API returned an invalid repair status.', 0, 'invalid_response');
  }
  return {
    requestId,
    candidateRevision,
    status: response.status,
    repairAvailable: response.repairAvailable,
  };
}

function parseShaderResponseEnvelope(value: unknown) {
  const response = ensureObject(value);
  const requestId = ensureString(response.requestId, 'requestId');
  if (response.candidateRevision !== 0 && response.candidateRevision !== 1) {
    throw new AiGenerationApiError('Generation API returned an invalid candidate revision.', 0, 'invalid_response');
  }
  return { response, requestId, candidateRevision: response.candidateRevision };
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
  const token = options.bearerToken ?? options.devToken;
  const requestInit = disableGetCaching(init);
  const response = await fetcher(endpoint(options.baseUrl, path), {
    credentials: 'include',
    ...requestInit,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...requestInit.headers,
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

function disableGetCaching(init: RequestInit): RequestInit {
  const method = (init.method ?? 'GET').toUpperCase();
  if (method !== 'GET' || init.cache !== undefined) return init;
  return { ...init, cache: 'no-store' };
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

export async function createAiShader(
  request: CreateAiShaderRequest,
  options: AiGenerationClientOptions = {},
): Promise<AiShaderGenerationResponse> {
  const body = await requestJson(
    '/api/ai/shaders',
    {
      method: 'POST',
      body: JSON.stringify(request),
    },
    options,
  );
  return awaitShaderCandidate(parseAiShaderRequestResponse(body), options);
}

export async function validateAiShader(
  requestId: string,
  candidateRevision: 0 | 1,
  outcome: 'accepted' | 'rejected',
  diagnostic: AiShaderCompilerDiagnostic | undefined,
  options: AiGenerationClientOptions = {},
): Promise<AiShaderValidationResponse> {
  const body = await requestJson(
    `/api/ai/shaders/${encodeURIComponent(requestId)}/validation`,
    {
      method: 'POST',
      body: JSON.stringify({ candidateRevision, outcome, ...(diagnostic ? { diagnostic } : {}) }),
    },
    options,
  );
  return parseAiShaderValidationResponse(body);
}

export async function repairAiShader(
  requestId: string,
  options: AiGenerationClientOptions = {},
): Promise<AiShaderGenerationResponse> {
  const body = await requestJson(
    `/api/ai/shaders/${encodeURIComponent(requestId)}/repair`,
    { method: 'POST', body: '{}' },
    options,
  );
  return awaitShaderCandidate(parseAiShaderRequestResponse(body), options);
}

async function awaitShaderCandidate(
  initial: AiShaderRequestResponse,
  options: AiGenerationClientOptions,
): Promise<AiShaderGenerationResponse> {
  let current = initial;
  const deadline = Date.now() + Math.max(0, options.pollTimeoutMs ?? 120_000);
  while (current.status === 'pending' || current.status === 'repairing') {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      throw new AiGenerationApiError(
        'Creation is taking longer than expected. Try again in a moment.',
        504,
        'shader_request_timeout',
      );
    }
    await waitForShaderPoll(Math.min(options.pollIntervalMs ?? 1_000, remainingMs), options.signal);
    const next = await pollShaderRequest(current.requestId, options);
    if (next) current = next;
  }
  if (current.status === 'failed') throw new AiGenerationApiError(current.message, 200, current.code);
  if (current.status === 'client_rejected') {
    throw new AiGenerationApiError('This shader is waiting for browser-guided repair.', 409, 'shader_repair_required');
  }
  return current;
}

async function pollShaderRequest(requestId: string, options: AiGenerationClientOptions) {
  try {
    const body = await requestJson(`/api/ai/shaders/${encodeURIComponent(requestId)}`, { method: 'GET' }, options);
    return parseAiShaderRequestResponse(body);
  } catch (error) {
    if (!isRetryableAiPollingError(error)) throw error;
    return undefined;
  }
}

export function isRetryableAiPollingError(error: unknown) {
  if (isAbortError(error)) return false;
  if (error instanceof TypeError) return true;
  if (!(error instanceof AiGenerationApiError)) return false;
  return error.status === 408 || error.status === 425 || error.status === 429 || error.status >= 500;
}

function isAbortError(error: unknown) {
  return typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'AbortError';
}

function waitForShaderPoll(delayMs: number, signal?: AbortSignal) {
  if (signal?.aborted) return Promise.reject(new DOMException('The operation was aborted.', 'AbortError'));
  return new Promise<void>((resolve, reject) => {
    const finish = () => {
      signal?.removeEventListener('abort', abort);
      resolve();
    };
    const timeout = globalThis.setTimeout(finish, Math.max(0, delayMs));
    const abort = () => {
      globalThis.clearTimeout(timeout);
      reject(new DOMException('The operation was aborted.', 'AbortError'));
    };
    signal?.addEventListener('abort', abort, { once: true });
  });
}

export async function getAiGenerationAccess(options: AiGenerationClientOptions = {}): Promise<AiGenerationAccessState> {
  if (!options.baseUrl && !options.bearerToken && !options.devToken && !options.fetcher) {
    return {
      authenticated: false,
      enabled: false,
      disabledReason: 'anonymous',
      providers: [],
    };
  }
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

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AiErrorResponse } from './contracts.js';

export interface JsonResponse<T> {
  status: number;
  body: T;
  headers?: Record<string, string>;
}

export interface BinaryResponse {
  status: number;
  bytes: Uint8Array;
  headers: Record<string, string>;
}

export class RequestBodyTooLargeError extends Error {
  constructor(readonly maxBytes: number) {
    super(`Request body exceeds ${maxBytes} bytes.`);
    this.name = 'RequestBodyTooLargeError';
  }
}

export type ApiResponse<T> = JsonResponse<T> | BinaryResponse;

export function json<T>(status: number, body: T, headers?: Record<string, string>): JsonResponse<T> {
  return { status, body, headers };
}

export function binary(status: number, bytes: Uint8Array, headers: Record<string, string>): BinaryResponse {
  return { status, bytes, headers };
}

export function errorJson(status: number, code: string, message: string): JsonResponse<AiErrorResponse> {
  return json(status, { code, message });
}

export function writeApiResponse(res: ServerResponse, response: ApiResponse<unknown>) {
  if ('bytes' in response) {
    res.writeHead(response.status, response.headers);
    res.end(response.bytes);
    return;
  }

  writeJsonResponse(res, response);
}

function writeJsonResponse(res: ServerResponse, response: JsonResponse<unknown>) {
  res.writeHead(response.status, {
    'content-type': 'application/json',
    'cache-control': 'no-store',
    ...response.headers,
  });
  res.end(JSON.stringify(response.body));
}

export async function readJsonBody<T>(request: AsyncIterable<Buffer>, options: { maxBytes?: number } = {}): Promise<T> {
  const chunks: Buffer[] = [];
  let byteLength = 0;
  for await (const chunk of request) {
    byteLength += chunk.byteLength;
    if (options.maxBytes !== undefined && byteLength > options.maxBytes) {
      throw new RequestBodyTooLargeError(options.maxBytes);
    }
    chunks.push(chunk);
  }
  const body = Buffer.concat(chunks).toString('utf8');
  if (!body) return {} as T;
  return JSON.parse(body) as T;
}

export function applyCorsHeaders(req: IncomingMessage, res: ServerResponse, webOrigins: string | readonly string[]) {
  const origin = req.headers.origin;
  if (typeof origin === 'string' && isAllowedWebOrigin(origin, webOrigins)) {
    res.setHeader('access-control-allow-origin', origin);
    res.setHeader('access-control-allow-credentials', 'true');
    res.setHeader('access-control-expose-headers', 'set-auth-token');
    res.setHeader('vary', 'Origin');
  }
  res.setHeader('access-control-allow-methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('access-control-allow-headers', 'authorization,content-type');
}

export function isAllowedWebOrigin(origin: string, webOrigins: string | readonly string[]) {
  const allowed = Array.isArray(webOrigins) ? webOrigins : [webOrigins];
  return allowed.some((pattern) => originMatchesPattern(origin, pattern));
}

function originMatchesPattern(origin: string, pattern: string) {
  const normalizedPattern = pattern.trim().replace(/\/$/, '');
  if (!normalizedPattern) return false;
  const normalizedOrigin = normalizeOriginValue(origin);
  if (normalizedOrigin === normalizedPattern) return true;
  if (!normalizedPattern.includes('*')) return false;
  return wildcardOriginRegex(normalizedPattern).test(normalizedOrigin);
}

function normalizeOriginValue(value: string) {
  const trimmed = value.trim().replace(/\/$/, '');
  try {
    const url = new URL(trimmed);
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.origin;
  } catch {
    // Keep the original value so the allow-list check can reject it.
  }
  return trimmed;
}

function wildcardOriginRegex(pattern: string) {
  const escaped = pattern
    .split('*')
    .map((part) => part.replace(/[|\\{}()[\]^$+?.]/g, '\\$&'))
    .join('[^.:/]+');
  return new RegExp(`^${escaped}$`);
}

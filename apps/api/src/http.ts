import type { ServerResponse } from 'node:http';
import type { AiErrorResponse } from './contracts.js';

export interface JsonResponse<T> {
  status: number;
  body: T;
  headers?: Record<string, string>;
}

export function json<T>(status: number, body: T, headers?: Record<string, string>): JsonResponse<T> {
  return { status, body, headers };
}

export function errorJson(status: number, code: string, message: string): JsonResponse<AiErrorResponse> {
  return json(status, { code, message });
}

export function writeJsonResponse<T>(res: ServerResponse, response: JsonResponse<T>) {
  res.writeHead(response.status, {
    'content-type': 'application/json',
    ...response.headers,
  });
  res.end(JSON.stringify(response.body));
}

export async function readJsonBody<T>(request: AsyncIterable<Buffer>): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk);
  const body = Buffer.concat(chunks).toString('utf8');
  if (!body) return {} as T;
  return JSON.parse(body) as T;
}

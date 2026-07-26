export interface ApiRequestOptions {
  baseUrl?: string;
  bearerToken?: string | null;
  fetcher?: typeof fetch;
  signal?: AbortSignal;
}

export async function fetchApiResponse(path: string, init: RequestInit, options: ApiRequestOptions): Promise<Response> {
  const fetcher = options.fetcher ?? fetch;
  return fetcher(`${options.baseUrl?.replace(/\/$/, '') ?? ''}${path}`, {
    credentials: 'include',
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(options.bearerToken ? { authorization: `Bearer ${options.bearerToken}` } : {}),
      ...init.headers,
    },
    signal: options.signal,
  });
}

export async function readApiJson(
  response: Response,
  invalidJsonError: (response: Response) => Error = () => new Error('API returned invalid JSON.'),
): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw invalidJsonError(response);
  }
}

export function apiErrorFields(body: unknown, fallbackMessage: string) {
  const errorBody = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  return {
    message: typeof errorBody.message === 'string' ? errorBody.message : fallbackMessage,
    code: typeof errorBody.code === 'string' ? errorBody.code : undefined,
  };
}

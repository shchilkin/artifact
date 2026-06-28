import { describe, expect, it } from 'vitest';
import {
  AiGenerationApiError,
  cancelAiGenerationJob,
  createAiGenerationJob,
  getAiGenerationAccess,
  getAiGenerationJob,
  parseAiGenerationAccessState,
  parseAiGenerationJob,
} from './aiGenerationClient';

const job = {
  id: 'job-1',
  status: 'queued',
  provider: 'openai',
  model: 'gpt-image',
  prompt: 'noisy shoegaze album cover',
  settings: {
    aspect: '1:1',
    quality: 'standard',
  },
  createdAt: '2026-05-20T10:00:00.000Z',
};

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

function captureJsonFetch(body: unknown) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetcher = async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return jsonResponse(body);
  };
  return { calls, fetcher };
}

function accessResponse() {
  return {
    authenticated: true,
    enabled: true,
    providers: ['openai'],
  };
}

describe('parseAiGenerationJob', () => {
  it('accepts a known provider and status', () => {
    expect(parseAiGenerationJob(job)).toMatchObject({
      id: 'job-1',
      status: 'queued',
      provider: 'openai',
    });
  });

  it('rejects unknown providers', () => {
    expect(() => parseAiGenerationJob({ ...job, provider: 'surprise' })).toThrow(AiGenerationApiError);
  });

  it('rejects unknown statuses', () => {
    expect(() => parseAiGenerationJob({ ...job, status: 'stuck' })).toThrow(AiGenerationApiError);
  });
});

describe('parseAiGenerationAccessState', () => {
  it('accepts enabled access state', () => {
    expect(
      parseAiGenerationAccessState({
        authenticated: true,
        enabled: true,
        providers: ['openai', 'xai'],
        quota: { period: '2026-05', limit: 10, used: 2, remaining: 8 },
      }),
    ).toMatchObject({ authenticated: true, enabled: true });
  });

  it('rejects invalid provider lists', () => {
    expect(() =>
      parseAiGenerationAccessState({
        authenticated: true,
        enabled: true,
        providers: ['openai', 'surprise'],
      }),
    ).toThrow(AiGenerationApiError);
  });
});

describe('ai generation client', () => {
  it('creates jobs with credentials and an idempotent request body', async () => {
    const { calls, fetcher } = captureJsonFetch(job);

    const result = await createAiGenerationJob(
      {
        prompt: 'noisy shoegaze album cover',
        provider: 'openai',
        settings: { aspect: '1:1', quality: 'standard' },
        idempotencyKey: 'request-1',
      },
      { baseUrl: 'https://api.example.test/', fetcher },
    );

    expect(result.id).toBe('job-1');
    expect(calls[0]?.url).toBe('https://api.example.test/api/ai/generations');
    expect(calls[0]?.init.credentials).toBe('include');
    expect(calls[0]?.init.method).toBe('POST');
    expect(JSON.parse(String(calls[0]?.init.body))).toMatchObject({ idempotencyKey: 'request-1' });
  });

  it('can attach a local development bearer token', async () => {
    const { calls, fetcher } = captureJsonFetch(accessResponse());

    await getAiGenerationAccess({ baseUrl: 'http://localhost:4000', devToken: 'dev-token', fetcher });

    expect(calls[0]?.url).toBe('http://localhost:4000/api/ai/access');
    expect(calls[0]?.init.headers).toMatchObject({ authorization: 'Bearer dev-token' });
  });

  it('can attach an account bearer token', async () => {
    const { calls, fetcher } = captureJsonFetch(accessResponse());

    await getAiGenerationAccess({ baseUrl: 'http://localhost:4000', bearerToken: 'account-token', fetcher });

    expect(calls[0]?.url).toBe('http://localhost:4000/api/ai/access');
    expect(calls[0]?.init.headers).toMatchObject({ authorization: 'Bearer account-token' });
  });

  it('prefers explicit bearer tokens over local development tokens', async () => {
    const calls: Array<{ init: RequestInit }> = [];
    const fetcher = async (_url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ init: init ?? {} });
      return jsonResponse({
        authenticated: true,
        enabled: true,
        providers: ['openai'],
      });
    };

    await getAiGenerationAccess({ bearerToken: 'account-token', devToken: 'dev-token', fetcher });

    expect(calls[0]?.init.headers).toMatchObject({ authorization: 'Bearer account-token' });
  });

  it('reads AI access state', async () => {
    const calls: string[] = [];
    const fetcher = async (url: RequestInfo | URL) => {
      calls.push(String(url));
      return jsonResponse({
        authenticated: true,
        enabled: true,
        providers: ['openai'],
        quota: { period: '2026-05', limit: 10, used: 0, remaining: 10 },
      });
    };

    const access = await getAiGenerationAccess({ fetcher });

    expect(access.enabled).toBe(true);
    expect(access.providers).toEqual(['openai']);
    expect(calls).toEqual(['/api/ai/access']);
  });

  it('returns disabled local access without hitting same-origin API when no API credentials are configured', async () => {
    await expect(getAiGenerationAccess()).resolves.toMatchObject({
      authenticated: false,
      enabled: false,
      disabledReason: 'anonymous',
    });
  });

  it('reads jobs by id', async () => {
    const calls: string[] = [];
    const fetcher = async (url: RequestInfo | URL) => {
      calls.push(String(url));
      return jsonResponse({ ...job, status: 'succeeded' });
    };

    const result = await getAiGenerationJob('job/id', { fetcher });

    expect(result.status).toBe('succeeded');
    expect(calls).toEqual(['/api/ai/generations/job%2Fid']);
  });

  it('cancels jobs through the cancel endpoint', async () => {
    const calls: Array<{ url: string; method?: string }> = [];
    const fetcher = async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), method: init?.method });
      return jsonResponse({ ...job, status: 'cancelled' });
    };

    const result = await cancelAiGenerationJob('job-1', { fetcher });

    expect(result.status).toBe('cancelled');
    expect(calls).toEqual([{ url: '/api/ai/generations/job-1/cancel', method: 'POST' }]);
  });

  it('throws API errors with server-provided codes', async () => {
    const fetcher = async () =>
      jsonResponse({ code: 'quota_exceeded', message: 'Monthly quota used.' }, { status: 429 });

    await expect(getAiGenerationJob('job-1', { fetcher })).rejects.toMatchObject({
      status: 429,
      code: 'quota_exceeded',
      message: 'Monthly quota used.',
    });
  });
});

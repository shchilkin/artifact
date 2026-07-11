import { describe, expect, it } from 'vitest';
import {
  AiGenerationApiError,
  cancelAiGenerationJob,
  createAiGenerationJob,
  createAiShader,
  getAiGenerationAccess,
  getAiGenerationJob,
  parseAiGenerationAccessState,
  parseAiGenerationJob,
  parseAiShaderGenerationResponse,
  repairAiShader,
  validateAiShader,
} from './aiGenerationClient';

const generatedShaderInstance = {
  definition: {
    version: 1,
    id: 'water-refraction',
    label: 'Water Refraction',
    language: 'glsl-fragment',
    code: `vec4 mainImage(vec2 uv) {
      vec2 offset = vec2(sin(uv.y * 16.0), cos(uv.x * 14.0)) * u_prop_amount;
      return texture2D(u_backdrop, clamp(uv + offset, 0.0, 1.0));
    }`,
    properties: [{ key: 'amount', label: 'Amount', type: 'number', default: 0.02, min: 0, max: 0.1, step: 0.001 }],
  },
  values: { amount: 0.02 },
};

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
  it('parses and normalizes generated shader instances', () => {
    const response = parseAiShaderGenerationResponse({
      requestId: 'shader-1',
      candidateRevision: 0,
      status: 'generated',
      attempt: 'initial',
      prompt: 'water refraction',
      source: 'openai',
      model: 'gpt-5.5-mini',
      instance: generatedShaderInstance,
    });

    expect(response.prompt).toBe('water refraction');
    expect(response.source).toBe('openai');
    expect(response.model).toBe('gpt-5.5-mini');
    expect(response.instance.definition.provenance).toEqual({
      source: 'openai',
      prompt: 'water refraction',
      model: 'gpt-5.5-mini',
      requestId: 'shader-1',
      attempt: 'initial',
    });
    expect(response.instance.values).toEqual({ amount: 0.02 });
  });

  it('rejects shader responses with controls that the code does not read', () => {
    expect(() =>
      parseAiShaderGenerationResponse({
        requestId: 'shader-1',
        candidateRevision: 0,
        status: 'generated',
        attempt: 'initial',
        prompt: 'water refraction',
        source: 'openai',
        instance: {
          ...generatedShaderInstance,
          definition: {
            ...generatedShaderInstance.definition,
            code: 'vec4 mainImage(vec2 uv) { return texture2D(u_backdrop, uv); }',
          },
        },
      }),
    ).toThrow(AiGenerationApiError);
  });

  it('creates shader instances through the AI shader endpoint', async () => {
    const { calls, fetcher } = captureJsonFetch({
      requestId: 'shader-1',
      candidateRevision: 0,
      status: 'generated',
      attempt: 'initial',
      prompt: 'neon waves',
      source: 'openai',
      model: 'gpt-5.5-mini',
      instance: generatedShaderInstance,
    });

    const result = await createAiShader(
      { prompt: 'neon waves', mode: 'openai', idempotencyKey: 'shader-request-1' },
      { baseUrl: 'https://api.example.test/', bearerToken: 'account-token', fetcher },
    );

    expect(result.instance.definition.label).toBe('Water Refraction');
    expect(result.source).toBe('openai');
    expect(calls[0]?.url).toBe('https://api.example.test/api/ai/shaders');
    expect(calls[0]?.init.method).toBe('POST');
    expect(calls[0]?.init.headers).toMatchObject({ authorization: 'Bearer account-token' });
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      prompt: 'neon waves',
      mode: 'openai',
      idempotencyKey: 'shader-request-1',
    });
  });

  it('creates a refinement candidate from an accepted shader request', async () => {
    const { calls, fetcher } = captureJsonFetch({
      requestId: 'shader-refined-1',
      candidateRevision: 0,
      status: 'generated',
      attempt: 'refine',
      prompt: 'Make it calmer',
      source: 'openai',
      model: 'gpt-5.5-mini',
      instance: generatedShaderInstance,
    });

    const result = await createAiShader(
      {
        prompt: 'Make it calmer',
        mode: 'openai',
        idempotencyKey: 'shader-refine-1',
        refineFromRequestId: 'shader-accepted-1',
      },
      { baseUrl: 'https://api.example.test/', bearerToken: 'account-token', fetcher },
    );

    expect(result.attempt).toBe('refine');
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      prompt: 'Make it calmer',
      mode: 'openai',
      idempotencyKey: 'shader-refine-1',
      refineFromRequestId: 'shader-accepted-1',
    });
  });

  it('reports browser validation and requests the single repair by request id', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetcher = async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      if (String(url).endsWith('/validation')) {
        return jsonResponse({
          requestId: 'shader-1',
          candidateRevision: 0,
          status: 'client_rejected',
          repairAvailable: true,
        });
      }
      return jsonResponse({
        requestId: 'shader-1',
        candidateRevision: 1,
        status: 'generated',
        attempt: 'repair',
        prompt: 'water refraction',
        source: 'openai',
        model: 'gpt-5.5-mini',
        instance: generatedShaderInstance,
      });
    };

    await validateAiShader(
      'shader-1',
      0,
      'rejected',
      { stage: 'compile', message: 'invalid token', browser: 'WebKit' },
      { baseUrl: 'https://api.example.test', fetcher },
    );
    const repaired = await repairAiShader('shader-1', { baseUrl: 'https://api.example.test', fetcher });

    expect(calls.map((call) => call.url)).toEqual([
      'https://api.example.test/api/ai/shaders/shader-1/validation',
      'https://api.example.test/api/ai/shaders/shader-1/repair',
    ]);
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      outcome: 'rejected',
      candidateRevision: 0,
      diagnostic: { stage: 'compile', message: 'invalid token', browser: 'WebKit' },
    });
    expect(repaired.attempt).toBe('repair');
  });

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

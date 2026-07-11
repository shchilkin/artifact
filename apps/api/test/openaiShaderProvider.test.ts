import { describe, expect, it, vi } from 'vitest';
import { createOpenAiShaderProvider } from '../src/providers/index.js';
import { jsonFetchResponse } from './helpers/providerFetch.js';

const generatedShader = {
  label: 'Neon Refraction',
  code: `vec4 mainImage(vec2 uv) {
    vec2 offset = vec2(sin(uv.y * 12.0), cos(uv.x * 10.0)) * u_prop_amount;
    vec4 source = texture2D(u_backdrop, clamp(uv + offset, 0.0, 1.0));
    return vec4(mix(source.rgb, source.rgb * u_prop_tint, 0.25), source.a);
  }`,
  properties: [
    { key: 'amount', label: 'Distortion', type: 'number', default: 0.03, min: 0, max: 0.12, step: 0.001 },
    { key: 'tint', label: 'Tint', type: 'color', default: '#ff00aa' },
  ],
};

describe('createOpenAiShaderProvider', () => {
  it('uses strict structured output and returns an editable shader instance', async () => {
    const fetcher = vi.fn(async (...args: [string, RequestInit]) => {
      expect(args).toHaveLength(2);
      return jsonFetchResponse(
        {
          output_text: JSON.stringify(generatedShader),
          usage: { input_tokens: 50, output_tokens: 100, total_tokens: 150 },
        },
        { headers: { 'x-request-id': 'req-openai-1' } },
      );
    });
    const provider = createOpenAiShaderProvider({
      apiKey: 'test-key',
      defaultModel: 'gpt-5.5-mini',
      fetch: fetcher,
    });

    await expect(
      provider.generateShader({ prompt: 'neon refraction', clientRequestId: 'shader-request-1' }),
    ).resolves.toMatchObject({
      requestId: 'req-openai-1',
      usage: { inputTokens: 50, outputTokens: 100, totalTokens: 150 },
      instance: {
        definition: {
          version: 1,
          id: 'shader-request-1-definition',
          label: 'Neon Refraction',
          language: 'glsl-fragment',
          code: generatedShader.code,
          properties: generatedShader.properties,
        },
        values: { amount: 0.03, tint: '#ff00aa' },
      },
    });

    const firstFetchCall = fetcher.mock.calls[0];
    if (!firstFetchCall) throw new Error('Expected OpenAI fetch call.');
    expect(firstFetchCall[0]).toBe('https://api.openai.com/v1/responses');
    expect(firstFetchCall[1]).toMatchObject({
      method: 'POST',
      headers: expect.objectContaining({
        authorization: 'Bearer test-key',
        'x-client-request-id': 'shader-request-1',
      }),
    });
    const body = JSON.parse(String(firstFetchCall[1].body));
    expect(body).toMatchObject({
      model: 'gpt-5.5-mini',
      max_output_tokens: 2_400,
      reasoning: { effort: 'low' },
      text: {
        format: {
          type: 'json_schema',
          name: 'artifact_shader_definition',
          strict: true,
          schema: {
            required: ['label', 'code', 'properties'],
            properties: { properties: { items: { anyOf: expect.any(Array) } } },
          },
        },
      },
    });
  });

  it('reads output text from nested Responses API content', async () => {
    const provider = createOpenAiShaderProvider({
      apiKey: 'test-key',
      fetch: async () => jsonFetchResponse({ output: [{ content: [{ text: JSON.stringify(generatedShader) }] }] }),
    });

    await expect(
      provider.generateShader({ prompt: 'neon refraction', clientRequestId: 'shader-request-2' }),
    ).resolves.toMatchObject({ instance: { definition: { label: 'Neon Refraction' } } });
  });

  it('sends the stored failed definition and cleaned browser diagnostic for repair', async () => {
    const fetcher = vi.fn(async (...args: [string, RequestInit]) => {
      expect(args).toHaveLength(2);
      return jsonFetchResponse({ output_text: JSON.stringify(generatedShader) });
    });
    const provider = createOpenAiShaderProvider({ apiKey: 'test-key', fetch: fetcher });

    await provider.generateShader({
      prompt: 'neon refraction',
      clientRequestId: 'shader-request-3-repair',
      repair: {
        instance: {
          definition: {
            version: 1,
            id: 'failed-definition',
            label: 'Failed Shader',
            language: 'glsl-fragment',
            code: generatedShader.code,
            properties: generatedShader.properties as never,
          },
          values: { amount: 0.03, tint: '#ff00aa' },
        },
        diagnostic: { stage: 'compile', message: 'invalid token', browser: 'WebKit' },
      },
    });

    const firstFetchCall = fetcher.mock.calls[0];
    if (!firstFetchCall) throw new Error('Expected OpenAI repair fetch call.');
    const body = JSON.parse(String(firstFetchCall[1].body));
    expect(body.input[0].content).toContain('Repair the supplied shader');
    const repairInput = JSON.parse(body.input[1].content);
    expect(repairInput).toMatchObject({
      originalPrompt: 'neon refraction',
      failedDefinition: { id: 'failed-definition', label: 'Failed Shader' },
      compilerDiagnostic: { stage: 'compile', message: 'invalid token', browser: 'WebKit' },
    });
  });

  it('surfaces OpenAI API errors', async () => {
    const provider = createOpenAiShaderProvider({
      apiKey: 'test-key',
      fetch: async () => jsonFetchResponse({ error: { message: 'schema rejected' } }, { ok: false, status: 400 }),
    });

    await expect(
      provider.generateShader({ prompt: 'neon waves', clientRequestId: 'shader-request-3' }),
    ).rejects.toThrow('schema rejected');
  });

  it('rejects responses without JSON output text', async () => {
    const provider = createOpenAiShaderProvider({
      apiKey: 'test-key',
      fetch: async () => jsonFetchResponse({ output_text: 'not json' }),
    });

    await expect(
      provider.generateShader({ prompt: 'neon waves', clientRequestId: 'shader-request-4' }),
    ).rejects.toThrow('OpenAI shader response was not valid JSON.');
  });

  it('rejects generated code outside the safe shader subset', async () => {
    const provider = createOpenAiShaderProvider({
      apiKey: 'test-key',
      fetch: async () =>
        jsonFetchResponse({
          output_text: JSON.stringify({
            label: 'Unsafe',
            code: 'vec4 mainImage(vec2 uv) { while (uv.x > 0.0) { uv.x -= 0.1; } return vec4(uv, 0.0, 1.0); }',
            properties: [],
          }),
        }),
    });

    await expect(
      provider.generateShader({ prompt: 'unsafe shader', clientRequestId: 'shader-request-invalid' }),
    ).rejects.toThrow('OpenAI shader did not match the contract');
  });

  it('rejects controls that are not used by the generated code', async () => {
    const provider = createOpenAiShaderProvider({
      apiKey: 'test-key',
      fetch: async () =>
        jsonFetchResponse({
          output_text: JSON.stringify({
            label: 'Dead Controls',
            code: 'vec4 mainImage(vec2 uv) { return texture2D(u_backdrop, uv); }',
            properties: [{ key: 'amount', label: 'Amount', type: 'number', default: 0.5, min: 0, max: 1, step: 0.01 }],
          }),
        }),
    });

    await expect(
      provider.generateShader({ prompt: 'editable effect', clientRequestId: 'shader-unused-control' }),
    ).rejects.toThrow('Shader property amount is not used by the shader code.');
  });

  it('rejects generated effects that ignore the connected source', async () => {
    const provider = createOpenAiShaderProvider({
      apiKey: 'test-key',
      fetch: async () =>
        jsonFetchResponse({
          output_text: JSON.stringify({
            label: 'Standalone Fill',
            code: 'vec4 mainImage(vec2 uv) { return vec4(uv, 0.0, 1.0); }',
            properties: [],
          }),
        }),
    });

    await expect(
      provider.generateShader({ prompt: 'source effect', clientRequestId: 'shader-no-source' }),
    ).rejects.toThrow('must sample the connected u_backdrop image');
  });

  it('does not count commented source sampling as a backdrop effect', async () => {
    const provider = createOpenAiShaderProvider({
      apiKey: 'test-key',
      fetch: async () =>
        jsonFetchResponse({
          output_text: JSON.stringify({
            label: 'Comment Only',
            code: `// texture2D(u_backdrop, uv)
vec4 mainImage(vec2 uv) { return vec4(uv, 0.0, 1.0); }`,
            properties: [],
          }),
        }),
    });

    await expect(
      provider.generateShader({ prompt: 'source effect', clientRequestId: 'shader-commented-source' }),
    ).rejects.toThrow('must sample the connected u_backdrop image');
  });

  it('aborts shader generation after the configured timeout', async () => {
    const provider = createOpenAiShaderProvider({
      apiKey: 'test-key',
      timeoutMs: 5,
      fetch: async (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        }),
    });

    await expect(
      provider.generateShader({ prompt: 'slow shader', clientRequestId: 'shader-timeout-1' }),
    ).rejects.toMatchObject({ name: 'OpenAiShaderTimeoutError', timeoutMs: 5 });
  });
});

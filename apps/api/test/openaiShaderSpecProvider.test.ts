import { describe, expect, it, vi } from 'vitest';
import { createOpenAiShaderSpecProvider } from '../src/providers/index.js';
import { jsonFetchResponse } from './helpers/providerFetch.js';

describe('createOpenAiShaderSpecProvider', () => {
  it('calls the OpenAI Responses API and returns a normalized shader spec', async () => {
    const fetcher = vi.fn(async (...args: [string, RequestInit]) => {
      expect(args).toHaveLength(2);
      return jsonFetchResponse(
        {
          output_text: JSON.stringify({
            version: 2,
            label: 'Neon Wave',
            prompt: 'ignored provider prompt',
            base: 0.8,
            contrast: 2,
            palette: ['#ff00aa', '#101820'],
            operations: [
              {
                op: 'wave',
                frequency: 24,
                amplitude: 0.4,
                angle: 42,
                phase: 0.5,
              },
            ],
          }),
          usage: { input_tokens: 50, output_tokens: 100, total_tokens: 150 },
        },
        { headers: { 'x-request-id': 'req-openai-1' } },
      );
    });
    const provider = createOpenAiShaderSpecProvider({
      apiKey: 'test-key',
      defaultModel: 'gpt-5.5-mini',
      fetch: fetcher,
    });

    await expect(
      provider.generateShaderSpec({ prompt: 'neon waves', clientRequestId: 'shader-request-1' }),
    ).resolves.toMatchObject({
      requestId: 'req-openai-1',
      usage: { inputTokens: 50, outputTokens: 100, totalTokens: 150 },
      spec: {
        version: 2,
        label: 'Neon Wave',
        prompt: 'neon waves',
        base: 0.8,
        contrast: 2,
        palette: ['#ff00aa', '#101820'],
        operations: [{ op: 'wave', frequency: 24, amplitude: 0.4, angle: 42, phase: 0.5 }],
      },
    });

    expect(fetcher).toHaveBeenCalledWith(
      'https://api.openai.com/v1/responses',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer test-key',
          'content-type': 'application/json',
          'x-client-request-id': 'shader-request-1',
        }),
      }),
    );
    const firstFetchCall = fetcher.mock.calls[0];
    if (!firstFetchCall) throw new Error('Expected OpenAI fetch call.');
    const body = JSON.parse(String(firstFetchCall[1].body));
    expect(body).toMatchObject({
      model: 'gpt-5.5-mini',
      max_output_tokens: 2_400,
      reasoning: { effort: 'low' },
      text: {
        format: {
          type: 'json_schema',
          strict: true,
          schema: {
            properties: {
              operations: { items: { anyOf: expect.any(Array) } },
            },
          },
        },
      },
    });
  });

  it('reads output text from nested Responses API content', async () => {
    const provider = createOpenAiShaderSpecProvider({
      apiKey: 'test-key',
      fetch: async () =>
        jsonFetchResponse({
          output: [
            {
              content: [
                {
                  text: JSON.stringify({
                    version: 2,
                    label: 'Ink',
                    prompt: 'ink',
                    base: 0.4,
                    contrast: 1.5,
                    palette: ['#000000', '#ffffff'],
                    operations: [
                      {
                        op: 'threshold',
                        scale: 0,
                        amount: 0,
                        octaves: 0,
                        seedOffset: 0,
                        frequency: 0,
                        amplitude: 0,
                        angle: 0,
                        phase: 0,
                        centerX: 0,
                        centerY: 0,
                        radius: 0,
                        value: 0.52,
                        softness: 0.08,
                        steps: 0,
                      },
                    ],
                  }),
                },
              ],
            },
          ],
        }),
    });

    await expect(
      provider.generateShaderSpec({ prompt: 'ink texture', clientRequestId: 'shader-request-2' }),
    ).resolves.toMatchObject({
      spec: {
        label: 'Ink',
        operations: [{ op: 'threshold', value: 0.52, softness: 0.08 }],
      },
    });
  });

  it('surfaces OpenAI shader errors', async () => {
    const provider = createOpenAiShaderSpecProvider({
      apiKey: 'test-key',
      fetch: async () => jsonFetchResponse({ error: { message: 'schema rejected' } }, { ok: false, status: 400 }),
    });

    await expect(
      provider.generateShaderSpec({ prompt: 'neon waves', clientRequestId: 'shader-request-3' }),
    ).rejects.toThrow('schema rejected');
  });

  it('rejects responses without JSON output text', async () => {
    const provider = createOpenAiShaderSpecProvider({
      apiKey: 'test-key',
      fetch: async () => jsonFetchResponse({ output_text: 'not json' }),
    });

    await expect(
      provider.generateShaderSpec({ prompt: 'neon waves', clientRequestId: 'shader-request-4' }),
    ).rejects.toThrow('OpenAI shader spec response was not valid JSON.');
  });

  it('rejects a structured response that does not match the shader contract', async () => {
    const provider = createOpenAiShaderSpecProvider({
      apiKey: 'test-key',
      fetch: async () =>
        jsonFetchResponse({
          output_text: JSON.stringify({ version: 2, label: 'Empty', palette: ['#000000'], operations: [] }),
        }),
    });

    await expect(
      provider.generateShaderSpec({ prompt: 'empty shader', clientRequestId: 'shader-request-invalid' }),
    ).rejects.toThrow('OpenAI shader spec did not match the contract');
  });

  it('aborts shader generation after the configured timeout', async () => {
    const provider = createOpenAiShaderSpecProvider({
      apiKey: 'test-key',
      timeoutMs: 5,
      fetch: async (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        }),
    });

    await expect(
      provider.generateShaderSpec({ prompt: 'slow shader', clientRequestId: 'shader-timeout-1' }),
    ).rejects.toMatchObject({ name: 'OpenAiShaderSpecTimeoutError', timeoutMs: 5 });
  });
});

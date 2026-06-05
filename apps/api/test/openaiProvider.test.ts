import { describe, expect, it, vi } from 'vitest';
import { createOpenAiImageProvider } from '../src/providers/index.js';
import { jsonFetchResponse } from './helpers/providerFetch.js';

describe('createOpenAiImageProvider', () => {
  it('calls the OpenAI Image API and returns normalized image bytes', async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: (name: string) => (name.toLowerCase() === 'x-request-id' ? 'req-123' : null) },
      json: async () => ({
        data: [{ b64_json: Buffer.from([1, 2, 3]).toString('base64'), revised_prompt: 'revised prompt' }],
        usage: { total_tokens: 12 },
      }),
    }));
    const provider = createOpenAiImageProvider({
      apiKey: 'test-key',
      defaultModel: 'gpt-image-2',
      fetch: fetcher,
    });

    await expect(
      provider.generateImage({
        jobId: 'job-1',
        userId: 'user-1',
        provider: 'openai',
        model: 'gpt-image-2',
        prompt: 'grainy shoegaze cover',
        settings: { aspect: '4:5', quality: 'standard' },
      }),
    ).resolves.toMatchObject({
      provider: 'openai',
      model: 'gpt-image-2',
      mimeType: 'image/png',
      width: 1024,
      height: 1280,
      usage: {
        metadata: {
          requestId: 'req-123',
          revisedPrompt: 'revised prompt',
        },
      },
    });

    expect(fetcher).toHaveBeenCalledWith(
      'https://api.openai.com/v1/images/generations',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer test-key',
          'content-type': 'application/json',
        }),
        body: JSON.stringify({
          model: 'gpt-image-2',
          prompt: 'grainy shoegaze cover',
          n: 1,
          size: '1024x1280',
          quality: 'medium',
          output_format: 'png',
        }),
      }),
    );
  });

  it('surfaces OpenAI error messages', async () => {
    const provider = createOpenAiImageProvider({
      apiKey: 'test-key',
      fetch: async () => jsonFetchResponse({ error: { message: 'prompt rejected' } }, { ok: false, status: 400 }),
    });

    await expect(
      provider.generateImage({
        jobId: 'job-1',
        userId: 'user-1',
        provider: 'openai',
        model: 'gpt-image-2',
        prompt: 'grainy shoegaze cover',
        settings: { aspect: '1:1', quality: 'high' },
      }),
    ).rejects.toThrow('prompt rejected');
  });

  it('rejects successful responses without image data', async () => {
    const provider = createOpenAiImageProvider({
      apiKey: 'test-key',
      fetch: async () => jsonFetchResponse({ data: [{}] }),
    });

    await expect(
      provider.generateImage({
        jobId: 'job-1',
        userId: 'user-1',
        provider: 'openai',
        model: 'gpt-image-2',
        prompt: 'grainy shoegaze cover',
        settings: { aspect: '1:1', quality: 'draft' },
      }),
    ).rejects.toThrow('OpenAI image response did not include image data.');
  });
});

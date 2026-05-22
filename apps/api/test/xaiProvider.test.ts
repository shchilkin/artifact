import { describe, expect, it, vi } from 'vitest';
import { createXAiImageProvider } from '../src/providers/index.js';

describe('createXAiImageProvider', () => {
  it('calls the xAI Image API and returns normalized image bytes', async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: (name: string) => (name.toLowerCase() === 'x-request-id' ? 'req-xai-123' : null) },
      json: async () => ({
        data: [
          {
            b64_json: Buffer.from([1, 2, 3]).toString('base64'),
            mime_type: 'image/jpeg',
            revised_prompt: 'revised prompt',
          },
        ],
        usage: { cost_in_usd_ticks: 200000000 },
      }),
    }));
    const provider = createXAiImageProvider({
      apiKey: 'test-key',
      defaultModel: 'grok-imagine-image-quality',
      fetch: fetcher,
    });

    await expect(
      provider.generateImage({
        jobId: 'job-1',
        userId: 'user-1',
        provider: 'xai',
        model: 'grok-imagine-image-quality',
        prompt: 'grainy shoegaze cover',
        settings: { aspect: '4:5', quality: 'high' },
      }),
    ).resolves.toMatchObject({
      provider: 'xai',
      model: 'grok-imagine-image-quality',
      mimeType: 'image/jpeg',
      width: 1536,
      height: 2048,
      usage: {
        metadata: {
          requestId: 'req-xai-123',
          revisedPrompt: 'revised prompt',
          aspectRatio: '3:4',
          resolution: '2k',
          requestedAspect: '4:5',
        },
      },
    });

    expect(fetcher).toHaveBeenCalledWith(
      'https://api.x.ai/v1/images/generations',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer test-key',
          'content-type': 'application/json',
        }),
        body: JSON.stringify({
          model: 'grok-imagine-image-quality',
          prompt: 'grainy shoegaze cover',
          n: 1,
          aspect_ratio: '3:4',
          resolution: '2k',
          response_format: 'b64_json',
        }),
      }),
    );
  });

  it('surfaces xAI error messages', async () => {
    const provider = createXAiImageProvider({
      apiKey: 'test-key',
      fetch: async () => ({
        ok: false,
        status: 400,
        headers: { get: () => null },
        json: async () => ({ error: { message: 'prompt rejected' } }),
      }),
    });

    await expect(
      provider.generateImage({
        jobId: 'job-1',
        userId: 'user-1',
        provider: 'xai',
        model: 'grok-imagine-image-quality',
        prompt: 'grainy shoegaze cover',
        settings: { aspect: '1:1', quality: 'standard' },
      }),
    ).rejects.toThrow('prompt rejected');
  });

  it('rejects successful responses without image data', async () => {
    const provider = createXAiImageProvider({
      apiKey: 'test-key',
      fetch: async () => ({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({ data: [{}] }),
      }),
    });

    await expect(
      provider.generateImage({
        jobId: 'job-1',
        userId: 'user-1',
        provider: 'xai',
        model: 'grok-imagine-image-quality',
        prompt: 'grainy shoegaze cover',
        settings: { aspect: '1:1', quality: 'draft' },
      }),
    ).rejects.toThrow('xAI image response did not include image data.');
  });
});

import { describe, expect, it } from 'vitest';
import { priceProviderUsage } from '../src/providerPricing.js';

describe('provider pricing', () => {
  it('prices GPT-5.5 shader tokens in integer micro USD', () => {
    expect(
      priceProviderUsage({
        provider: 'openai',
        model: 'gpt-5.5',
        usage: { inputTokens: 120, outputTokens: 340 },
      }),
    ).toEqual({ costMicroUsd: '10800', pricingVersion: 'openai-2026-07-12' });
  });

  it('prices GPT Image 2 token usage by modality', () => {
    expect(
      priceProviderUsage({
        provider: 'openai',
        model: 'gpt-image-2',
        usage: { inputTokens: 1_000, outputTokens: 4_000 },
      }),
    ).toEqual({ costMicroUsd: '125000', pricingVersion: 'openai-2026-07-12' });
  });

  it('uses exact xAI cost ticks when the response includes them', () => {
    expect(
      priceProviderUsage({
        provider: 'xai',
        model: 'grok-imagine-image-quality',
        usage: { imageCount: 1, imageSize: '2k', costUsdTicks: '712340000' },
      }),
    ).toEqual({ costMicroUsd: '71234', pricingVersion: 'xai-reported-cost-v1' });
  });

  it('falls back to the versioned xAI per-image rate', () => {
    expect(
      priceProviderUsage({
        provider: 'xai',
        model: 'grok-imagine-image-quality',
        usage: { imageCount: 1, imageSize: '2k' },
      }),
    ).toEqual({ costMicroUsd: '70000', pricingVersion: 'xai-2026-07-12' });
  });

  it('rejects unknown production pricing instead of silently counting zero', () => {
    expect(() => priceProviderUsage({ provider: 'openai', model: 'unknown', usage: { inputTokens: 10 } })).toThrow(
      'Unsupported provider pricing',
    );
  });
});

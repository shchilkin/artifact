import type { ProviderUsageMetrics } from './db/types.js';

const OPENAI_PRICING_VERSION = 'openai-2026-07-12';
const XAI_PRICING_VERSION = 'xai-2026-07-12';
const USD_TICKS_PER_MICRO_USD = 10_000n;

export function priceProviderUsage(input: { provider: string; model: string; usage: ProviderUsageMetrics }): {
  costMicroUsd: string;
  pricingVersion: string;
} {
  if (input.provider === 'openai' && input.model.startsWith('gpt-5.5')) {
    return tokenPrice(input.usage, { input: 20n, cached: 2n, output: 120n }, OPENAI_PRICING_VERSION);
  }
  if (input.provider === 'openai' && input.model.startsWith('gpt-image-2')) {
    return tokenPrice(input.usage, { input: 20n, cached: 5n, output: 120n }, OPENAI_PRICING_VERSION);
  }
  if (input.provider === 'xai' && input.usage.costUsdTicks !== undefined) {
    const ticks = nonNegativeBigInt(input.usage.costUsdTicks, 'costUsdTicks');
    return {
      costMicroUsd: roundedDivide(ticks, USD_TICKS_PER_MICRO_USD).toString(),
      pricingVersion: 'xai-reported-cost-v1',
    };
  }
  if (input.provider === 'xai' && input.model === 'grok-imagine-image-quality') {
    const count = BigInt(input.usage.imageCount ?? 1);
    const perImage = input.usage.imageSize?.toLowerCase() === '2k' ? 70_000n : 50_000n;
    return { costMicroUsd: (count * perImage).toString(), pricingVersion: XAI_PRICING_VERSION };
  }
  if (input.provider === 'xai' && input.model === 'grok-imagine-image') {
    return {
      costMicroUsd: (BigInt(input.usage.imageCount ?? 1) * 20_000n).toString(),
      pricingVersion: XAI_PRICING_VERSION,
    };
  }
  if (
    input.provider === 'openai-mock' ||
    input.provider === 'xai-mock' ||
    input.model.includes('mock-image') ||
    input.model === 'mock-image-v1'
  ) {
    return { costMicroUsd: '0', pricingVersion: 'mock-v1' };
  }
  throw new Error(`Unsupported provider pricing: ${input.provider}/${input.model}`);
}

function tokenPrice(
  usage: ProviderUsageMetrics,
  quarterMicroUsdRate: { input: bigint; cached: bigint; output: bigint },
  pricingVersion: string,
) {
  const inputTokens = BigInt(usage.inputTokens ?? 0);
  const cachedTokens = BigInt(usage.cachedInputTokens ?? 0);
  const outputTokens = BigInt(usage.outputTokens ?? 0);
  const uncachedTokens = inputTokens > cachedTokens ? inputTokens - cachedTokens : 0n;
  const costInQuarterMicros =
    uncachedTokens * quarterMicroUsdRate.input +
    cachedTokens * quarterMicroUsdRate.cached +
    outputTokens * quarterMicroUsdRate.output;
  return { costMicroUsd: roundedDivide(costInQuarterMicros, 4n).toString(), pricingVersion };
}

function nonNegativeBigInt(value: string, label: string) {
  if (!/^\d+$/.test(value)) throw new Error(`${label} must be a non-negative integer string`);
  return BigInt(value);
}

function roundedDivide(value: bigint, divisor: bigint) {
  return (value + divisor / 2n) / divisor;
}

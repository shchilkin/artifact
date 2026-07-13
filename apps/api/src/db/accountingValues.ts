import type { JsonObject, ProviderUsageMetrics } from './types.js';

export function normalizeProviderUsageMetrics(usage: ProviderUsageMetrics): JsonObject {
  return Object.fromEntries(
    Object.entries(usage).flatMap(([key, value]) =>
      value === undefined
        ? []
        : [
            [
              key,
              typeof value === 'number'
                ? nonNegativeInteger(value, `usage.${key}`)
                : requiredText(value, `usage.${key}`),
            ],
          ],
    ),
  );
}

export function normalizeMicroUsd(value: string): string {
  if (!/^\d+$/.test(value)) throw new Error('costMicroUsd must be a non-negative integer string');
  return value;
}

export function requiredText(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function nonNegativeInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${label} must be a non-negative integer`);
  return value;
}

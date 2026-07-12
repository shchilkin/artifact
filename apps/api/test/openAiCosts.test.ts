import { describe, expect, it, vi } from 'vitest';
import { OpenAiCostsClient, usdDecimalToMicroUsd } from '../src/openAiCosts.js';

describe('OpenAI Costs client', () => {
  it('paginates daily buckets and sums USD amounts without floating point math', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        response({ data: [{ results: [{ amount: { value: '0.012345', currency: 'usd' } }] }], next_page: 'p2' }),
      )
      .mockResolvedValueOnce(
        response({ data: [{ results: [{ amount: { value: '1.20', currency: 'usd' } }] }], next_page: null }),
      );
    const client = new OpenAiCostsClient({ apiKey: 'admin-key', fetch: fetcher });

    await expect(
      client.getCost({
        from: new Date('2026-07-11T00:00:00.000Z'),
        to: new Date('2026-07-12T00:00:00.000Z'),
      }),
    ).resolves.toEqual({ costMicroUsd: '1212345' });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(String(fetcher.mock.calls[1]?.[0])).toContain('page=p2');
  });

  it('parses and rounds USD decimals to integer micro USD', () => {
    expect(usdDecimalToMicroUsd('0.0000005')).toBe(1n);
    expect(usdDecimalToMicroUsd('12.345678')).toBe(12_345_678n);
  });
});

function response(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

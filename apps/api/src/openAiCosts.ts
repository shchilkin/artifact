interface CostsResponse {
  data?: Array<{ results?: Array<{ amount?: { value?: unknown; currency?: unknown } }> }>;
  next_page?: unknown;
  error?: { message?: unknown };
}

export class OpenAiCostsClient {
  private readonly endpoint: string;
  private readonly fetcher: typeof fetch;

  constructor(options: { apiKey: string; endpoint?: string; fetch?: typeof fetch }) {
    this.endpoint = options.endpoint ?? 'https://api.openai.com/v1/organization/costs';
    this.fetcher = options.fetch ?? fetch;
    this.apiKey = options.apiKey;
  }

  private readonly apiKey: string;

  async getCost(input: { from: Date; to: Date }) {
    let page: string | null = null;
    let total = 0n;
    do {
      const url = new URL(this.endpoint);
      url.searchParams.set('start_time', String(Math.floor(input.from.getTime() / 1000)));
      url.searchParams.set('end_time', String(Math.floor(input.to.getTime() / 1000)));
      url.searchParams.set('bucket_width', '1d');
      if (page) url.searchParams.set('page', page);
      const response = await this.fetcher(url, {
        headers: { authorization: `Bearer ${this.apiKey}` },
      });
      const body = (await response.json()) as CostsResponse;
      if (!response.ok) {
        const message = body.error?.message;
        throw new Error(
          typeof message === 'string' ? message : `OpenAI Costs request failed with HTTP ${response.status}.`,
        );
      }
      for (const bucket of body.data ?? []) {
        for (const result of bucket.results ?? []) {
          if (result.amount?.currency !== 'usd') continue;
          const value = result.amount?.value;
          if (typeof value !== 'string' && typeof value !== 'number') continue;
          total += usdDecimalToMicroUsd(String(value));
        }
      }
      page = typeof body.next_page === 'string' && body.next_page ? body.next_page : null;
    } while (page);
    return { costMicroUsd: total.toString() };
  }
}

export function usdDecimalToMicroUsd(value: string) {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match?.[1]) throw new Error('OpenAI cost amount must be a non-negative USD decimal.');
  const fraction = (match[2] ?? '').padEnd(7, '0');
  const micros = BigInt(match[1]) * 1_000_000n + BigInt(fraction.slice(0, 6) || '0');
  return fraction[6] && Number(fraction[6]) >= 5 ? micros + 1n : micros;
}

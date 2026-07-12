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
      const url = createCostsUrl(this.endpoint, input, page);
      const response = await this.fetcher(url, {
        headers: { authorization: `Bearer ${this.apiKey}` },
      });
      const body = (await response.json()) as CostsResponse;
      assertSuccessfulResponse(response, body);
      total += sumUsdCosts(body);
      page = nextPage(body);
    } while (page);
    return { costMicroUsd: total.toString() };
  }
}

function createCostsUrl(endpoint: string, input: { from: Date; to: Date }, page: string | null) {
  const url = new URL(endpoint);
  url.searchParams.set('start_time', String(Math.floor(input.from.getTime() / 1000)));
  url.searchParams.set('end_time', String(Math.floor(input.to.getTime() / 1000)));
  url.searchParams.set('bucket_width', '1d');
  if (page) url.searchParams.set('page', page);
  return url;
}

function assertSuccessfulResponse(response: Response, body: CostsResponse) {
  if (response.ok) return;
  const message = body.error?.message;
  throw new Error(typeof message === 'string' ? message : `OpenAI Costs request failed with HTTP ${response.status}.`);
}

function sumUsdCosts(body: CostsResponse) {
  return (body.data ?? []).reduce(
    (total, bucket) => total + (bucket.results ?? []).reduce((sum, result) => sum + usdAmount(result.amount), 0n),
    0n,
  );
}

function usdAmount(amount: { value?: unknown; currency?: unknown } | undefined) {
  if (amount?.currency !== 'usd') return 0n;
  return typeof amount.value === 'string' || typeof amount.value === 'number'
    ? usdDecimalToMicroUsd(String(amount.value))
    : 0n;
}

function nextPage(body: CostsResponse) {
  return typeof body.next_page === 'string' && body.next_page ? body.next_page : null;
}

export function usdDecimalToMicroUsd(value: string) {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match?.[1]) throw new Error('OpenAI cost amount must be a non-negative USD decimal.');
  const fraction = (match[2] ?? '').padEnd(7, '0');
  const micros = BigInt(match[1]) * 1_000_000n + BigInt(fraction.slice(0, 6) || '0');
  return fraction[6] && Number(fraction[6]) >= 5 ? micros + 1n : micros;
}

export interface RateLimitState {
  count: number;
  resetAt: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterMs: number;
}

export interface InMemoryRateLimitOptions {
  limit: number;
  now?: () => number;
  windowMs: number;
}

export interface InMemoryRateLimiter {
  check(key: string): RateLimitResult;
  clear(key?: string): void;
  snapshot(): ReadonlyMap<string, RateLimitState>;
}

function assertPositiveNumber(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number`);
  }

  return value;
}

export function createInMemoryRateLimiter(options: InMemoryRateLimitOptions): InMemoryRateLimiter {
  const limit = Math.floor(assertPositiveNumber(options.limit, 'limit'));
  const windowMs = assertPositiveNumber(options.windowMs, 'windowMs');
  const now = options.now ?? Date.now;
  const entries = new Map<string, RateLimitState>();

  return {
    check(key: string): RateLimitResult {
      const currentTime = now();
      const existing = entries.get(key);
      const state =
        existing && existing.resetAt > currentTime
          ? existing
          : {
              count: 0,
              resetAt: currentTime + windowMs,
            };

      state.count += 1;
      entries.set(key, state);

      const allowed = state.count <= limit;
      const remaining = Math.max(0, limit - state.count);

      return {
        allowed,
        limit,
        remaining,
        resetAt: state.resetAt,
        retryAfterMs: allowed ? 0 : Math.max(0, state.resetAt - currentTime),
      };
    },
    clear(key?: string): void {
      if (key) entries.delete(key);
      else entries.clear();
    },
    snapshot(): ReadonlyMap<string, RateLimitState> {
      return new Map(entries);
    },
  };
}

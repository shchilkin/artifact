import { describe, expect, it } from 'vitest';
import { createInMemoryRateLimiter } from '../src/rateLimit.js';

describe('in-memory rate limiter', () => {
  it('limits requests inside a fixed window', () => {
    let now = 1000;
    const limiter = createInMemoryRateLimiter({
      limit: 2,
      now: () => now,
      windowMs: 100,
    });

    expect(limiter.check('user-1')).toMatchObject({ allowed: true, remaining: 1 });
    expect(limiter.check('user-1')).toMatchObject({ allowed: true, remaining: 0 });
    expect(limiter.check('user-1')).toMatchObject({
      allowed: false,
      remaining: 0,
      retryAfterMs: 100,
    });

    now = 1101;

    expect(limiter.check('user-1')).toMatchObject({ allowed: true, remaining: 1 });
  });
});

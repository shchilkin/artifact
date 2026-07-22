import { describe, expect, it } from 'vitest';
import { readPageValue } from './pageParams';

describe('readPageValue', () => {
  it('uses the fallback when a page parameter is absent or invalid', () => {
    expect(readPageValue(null, 25)).toBe(25);
    expect(readPageValue('not-a-number', 25)).toBe(25);
    expect(readPageValue('-1', 25)).toBe(25);
    expect(readPageValue('1.5', 25)).toBe(25);
  });

  it('accepts zero and positive integers', () => {
    expect(readPageValue('0', 25)).toBe(0);
    expect(readPageValue('50', 25)).toBe(50);
  });
});

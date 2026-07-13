import { describe, expect, it } from 'vitest';
import { formatFeature, formatInteger, formatMicroUsd } from './format';

describe('backoffice formatting', () => {
  it('formats provider micro-dollar values as dollars', () => {
    expect(formatMicroUsd('10800')).toBe('$0.01');
    expect(formatMicroUsd('10000000')).toBe('$10.00');
  });

  it('formats counts and feature names for operators', () => {
    expect(formatInteger('1234')).toBe('1,234');
    expect(formatFeature('shader_refine')).toBe('shader refine');
  });
});

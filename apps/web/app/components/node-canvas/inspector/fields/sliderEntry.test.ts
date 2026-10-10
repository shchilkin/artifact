import { describe, expect, it } from 'vitest';

import { entryLimitMessage, formatEntry, parseEntry, sliderPrecision, snapToStep } from './sliderEntry';

describe('slider numeric entry', () => {
  it('snaps typed values to the step grid counted from min, like the range input', () => {
    expect(parseEntry('12.4', { min: 0, max: 100, step: 1 })).toBe(12);
    expect(parseEntry('12.5', { min: 0, max: 100, step: 1 })).toBe(13);
    expect(parseEntry('7', { min: 1, max: 99, step: 2 })).toBe(7);
    expect(parseEntry('8', { min: 1, max: 99, step: 2 })).toBe(9);
    expect(parseEntry('0.33', { min: 0, max: 1, step: 0.05 })).toBe(0.35);
    expect(parseEntry('0.3', { min: 0, max: 1, step: 0.1 })).toBe(0.3);
  });

  it('clamps to the range, including a max that is off the step grid', () => {
    expect(parseEntry('-20', { min: 0, max: 100, step: 1 })).toBe(0);
    expect(parseEntry('999', { min: 0, max: 300, step: 1 })).toBe(300);
    expect(snapToStep(10, { min: 0, max: 9.5, step: 1 })).toBe(9.5);
  });

  it('keeps integer fields integral', () => {
    for (const typed of ['41.7', '0.2', '9998.6']) {
      expect(Number.isInteger(parseEntry(typed, { min: 0, max: 9999, step: 1 }))).toBe(true);
    }
  });

  it('discards text that is not a finite number', () => {
    for (const typed of ['', ' ', '-', '1e', 'abc', 'Infinity']) {
      expect(parseEntry(typed, { min: 0, max: 100, step: 1 })).toBeNull();
    }
  });

  it('shows stored values at the slider precision', () => {
    expect(sliderPrecision({ min: 0, step: 1 })).toBe(0);
    expect(sliderPrecision({ min: 0, step: 0.05 })).toBe(2);
    expect(sliderPrecision({ min: 0.5, step: 1 })).toBe(1);
    expect(sliderPrecision({ min: 0, step: 1e-3 })).toBe(3);
    expect(formatEntry(0.1 + 0.2, { min: 0, step: 0.1 })).toBe('0.3');
    expect(formatEntry(24, { min: 0, step: 1 })).toBe('24');
    expect(formatEntry(12.6, { min: 0, step: 1 })).toBe('13');
  });

  it('names the limit a typed value was clamped to', () => {
    const range = { min: 0, max: 100, step: 1 };
    expect(entryLimitMessage('999', range)).toBe('Max 100');
    expect(entryLimitMessage('-5', range, '%')).toBe('Min 0%');
    expect(entryLimitMessage('0.25', { min: 0, max: 0.2, step: 0.05 })).toBe('Max 0.2');
    expect(entryLimitMessage('100', range)).toBeNull();
    expect(entryLimitMessage('42.4', range)).toBeNull();
    expect(entryLimitMessage('', range)).toBeNull();
    expect(entryLimitMessage('1e', range)).toBeNull();
  });
});

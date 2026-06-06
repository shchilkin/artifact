import { describe, expect, it } from 'vitest';

import { documentFingerprint } from './documentFingerprint';

describe('documentFingerprint', () => {
  it('normalizes object key order while preserving array order', () => {
    expect(documentFingerprint({ b: 1, a: [{ y: 2, x: 1 }] })).toBe(documentFingerprint({ a: [{ x: 1, y: 2 }], b: 1 }));
    expect(documentFingerprint({ items: [1, 2] })).not.toBe(documentFingerprint({ items: [2, 1] }));
  });
});

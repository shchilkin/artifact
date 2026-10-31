import { describe, expect, it } from 'vitest';
import { catalogueNumber } from './appBuildInfo';

describe('catalogueNumber', () => {
  it('derives the catalogue number from the release version', () => {
    expect(catalogueNumber('0.50.1')).toBe('ART-0501');
    expect(catalogueNumber('v1.2.0')).toBe('ART-1020');
    expect(catalogueNumber('0.51.0-rc.1')).toBe('ART-0510');
  });

  it('falls back to a blank number for non-release builds', () => {
    expect(catalogueNumber('local-development')).toBe('ART-0000');
  });
});

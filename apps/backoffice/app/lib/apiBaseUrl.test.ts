import { describe, expect, it } from 'vitest';
import { resolveBackofficeApiBaseUrl } from './apiBaseUrl';

describe('resolveBackofficeApiBaseUrl', () => {
  it('uses an explicit API origin without a trailing slash', () => {
    expect(resolveBackofficeApiBaseUrl(' https://api.example.com/ ', { PROD: true })).toBe('https://api.example.com');
  });

  it('uses the local API in development and the public API in production', () => {
    expect(resolveBackofficeApiBaseUrl(undefined, { PROD: false })).toBe('http://127.0.0.1:4000');
    expect(resolveBackofficeApiBaseUrl(undefined, { PROD: true })).toBe('https://api.artifact.shchilkin.dev');
  });
});

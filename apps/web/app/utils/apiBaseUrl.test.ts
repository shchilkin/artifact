import { describe, expect, it } from 'vitest';
import { resolveArtifactApiBaseUrl } from './apiBaseUrl';

describe('artifact API base URL resolution', () => {
  it('uses local configured API URLs in development', () => {
    expect(resolveArtifactApiBaseUrl('http://localhost:4000', { PROD: false }, { hostname: 'localhost' })).toBe(
      'http://localhost:4000',
    );
  });

  it('ignores the tracked localhost default in production previews', () => {
    expect(
      resolveArtifactApiBaseUrl('http://localhost:4000', { PROD: true }, { hostname: 'artifact-preview.vercel.app' }),
    ).toBeUndefined();
  });

  it('derives the production API URL on known production hosts', () => {
    expect(
      resolveArtifactApiBaseUrl('http://localhost:4000', { PROD: true }, { hostname: 'artifact.shchilkin.dev' }),
    ).toBe('https://api.artifact.shchilkin.dev');
  });

  it('keeps explicit non-local Vercel env values in production', () => {
    expect(
      resolveArtifactApiBaseUrl(
        'https://preview-api.example.test/',
        { PROD: true },
        { hostname: 'artifact-preview.vercel.app' },
      ),
    ).toBe('https://preview-api.example.test');
  });
});

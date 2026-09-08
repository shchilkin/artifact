import { afterEach, expect, it, vi } from 'vitest';
import { analyzeArtifactRuntimeProject } from './document.js';
import { loadEmbeddedFonts } from './fonts.js';
import type { ArtifactRuntimeProject } from './types.js';

function project(): ArtifactRuntimeProject {
  return {
    artifactPackage: 'project',
    manifest: { kind: 'artifact-project-package', version: 1, documentSchemaVersion: 3 },
    document: {
      schemaVersion: 3,
      global: { seed: 1 },
      layers: [{ id: 'title', kind: 'text', font: 'artifact-font://title', content: 'Viber' }],
      fontAssets: [{ id: 'title', dataUrl: 'data:font/ttf;base64,AAAA' }],
    },
  };
}

function fontBrowser(failOnLoad = 0) {
  let loads = 0;
  const faces = new Set<unknown>();
  vi.stubGlobal('document', {
    fonts: { add: (face: unknown) => faces.add(face), delete: (face: unknown) => faces.delete(face) },
  });
  vi.stubGlobal(
    'FontFace',
    class {
      constructor(
        readonly family: string,
        readonly source: string,
      ) {}
      async load() {
        if (++loads === failOnLoad) throw new Error('invalid font bytes');
        return this;
      }
    },
  );
  return faces;
}

afterEach(() => vi.unstubAllGlobals());

it('recognizes embedded font bytes, while metadata-only and external sources remain unresolved', () => {
  const value = project();
  expect(analyzeArtifactRuntimeProject(value).status).toBe('ready');
  value.document.fontAssets = [{ id: 'title', family: 'Metadata only' }];
  expect(analyzeArtifactRuntimeProject(value).status).toBe('unresolved-fonts');
  value.document.fontAssets = [{ id: 'title', dataUrl: 'https://example.com/font.ttf' }];
  expect(analyzeArtifactRuntimeProject(value).status).toBe('unresolved-fonts');
});

it('isolates concurrent font lifetimes without mutating the composition', async () => {
  const faces = fontBrowser();
  const value = project();
  const before = JSON.stringify(value);
  const a = await loadEmbeddedFonts(value, {});
  const b = await loadEmbeddedFonts(value, {});
  expect(a.fontFamilies).not.toEqual(b.fontFamilies);
  expect(faces.size).toBe(2);
  a.release();
  a.release();
  expect(faces.size).toBe(1);
  b.release();
  expect(faces.size).toBe(0);
  expect(JSON.stringify(value)).toBe(before);
});

it('uses explicit host mappings without allocating or deleting host-owned fonts', async () => {
  const faces = fontBrowser();
  const loaded = await loadEmbeddedFonts(project(), { fontFamilies: { 'artifact-font://title': 'Host Font' } });
  expect(loaded.fontFamilies['artifact-font://title']).toBe('Host Font');
  expect(faces.size).toBe(0);
  loaded.release();
});

it('releases previously registered faces if a later font fails to decode', async () => {
  const faces = fontBrowser(2);
  const value = project();
  value.document.layers.push({ id: 'other', kind: 'text', font: 'artifact-font://other' });
  value.document.fontAssets?.push({ id: 'other', dataUrl: 'data:font/ttf;base64,AQID' });
  await expect(loadEmbeddedFonts(value, {})).rejects.toThrow('invalid font bytes');
  expect(faces.size).toBe(0);
});

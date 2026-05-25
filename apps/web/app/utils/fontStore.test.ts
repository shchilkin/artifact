import { describe, expect, it, vi } from 'vitest';
import { type CanvasDocument, makeFillLayer, makeTextLayer } from '../types/config';
import {
  collectDocumentFontRefs,
  fontUriFromId,
  hydrateDocumentFontAssets,
  isFontUri,
  normalizeImportedFontLabel,
  storeDocumentFontAssets,
} from './fontStore';

describe('fontStore document helpers', () => {
  const fontAsset = {
    id: 'font-a',
    dataUrl: 'data:font/woff2;base64,AAAA',
    mime: 'font/woff2',
    bytes: 123,
    label: 'Poster Local',
    family: 'Artifact Imported font a',
    createdAt: '2026-05-25T00:00:00.000Z',
  };

  it('uses serializable artifact font references for imported fonts', () => {
    expect(fontUriFromId('font-a')).toBe('artifact-font://font-a');
    expect(isFontUri('artifact-font://font-a')).toBe(true);
    expect(isFontUri('BUNGEE')).toBe(false);
  });

  it('normalizes imported font labels for picker display', () => {
    expect(normalizeImportedFontLabel('Jost-VariableFont_wght.ttf')).toBe('Jost');
    expect(normalizeImportedFontLabel('Poppins Bold.otf')).toBe('Poppins');
    expect(normalizeImportedFontLabel('Inter_18pt-Regular.woff2')).toBe('Inter');
    expect(normalizeImportedFontLabel('Local Poster.ttf')).toBe('Local Poster');
  });

  it('collects unique document font references', () => {
    const doc: CanvasDocument = {
      global: { bg: '#101010', seed: 1, aspect: '1:1' },
      layers: [
        makeTextLayer({ font: 'BUNGEE' }),
        makeTextLayer({ font: 'BUNGEE' }),
        makeTextLayer({ font: fontUriFromId('font-a') }),
        makeFillLayer(),
      ],
      export: { format: 'png', scale: 1, target: 'cover' },
    };

    expect(collectDocumentFontRefs(doc)).toEqual(['BUNGEE', 'artifact-font://font-a']);
  });

  it('hydrates imported font references into portable document font assets', async () => {
    const doc: CanvasDocument = {
      global: { bg: '#101010', seed: 1, aspect: '1:1' },
      layers: [makeTextLayer({ font: fontUriFromId('font-a') }), makeTextLayer({ font: 'BUNGEE' })],
      export: { format: 'png', scale: 1, target: 'cover' },
    };
    const loadFontAsset = vi.fn(async (font: string) => (font === fontUriFromId('font-a') ? fontAsset : null));

    const hydrated = await hydrateDocumentFontAssets(doc, { loadFontAsset });

    expect(loadFontAsset).toHaveBeenCalledWith('artifact-font://font-a');
    expect(hydrated.fontAssets).toEqual([fontAsset]);
    expect(hydrated.layers[0]).toMatchObject({ kind: 'text', font: 'artifact-font://font-a' });
  });

  it('stores portable document font assets outside the document and strips payloads', async () => {
    const doc: CanvasDocument = {
      global: { bg: '#101010', seed: 1, aspect: '1:1' },
      layers: [makeTextLayer({ font: fontUriFromId('font-a') })],
      export: { format: 'png', scale: 1, target: 'cover' },
      fontAssets: [fontAsset],
    };
    const saveFontAsset = vi.fn(async () => fontAsset);

    const stored = await storeDocumentFontAssets(doc, { saveFontAsset });

    expect(saveFontAsset).toHaveBeenCalledWith(fontAsset);
    expect(stored.fontAssets).toBeUndefined();
    expect(stored.layers[0]).toMatchObject({ kind: 'text', font: 'artifact-font://font-a' });
  });
});

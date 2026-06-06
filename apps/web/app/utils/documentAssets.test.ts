import { describe, expect, it, vi } from 'vitest';
import { type CanvasDocument, makeFillLayer, makeImageLayer, makeTextLayer } from '../types/config';
import {
  hasPortableDocumentPayloads,
  inspectDocumentDependencies,
  preparePortableDocument,
  storePortableDocumentAssets,
} from './documentAssets';
import { makePortableAssetLoaders } from './documentAssetTestHelpers';
import { fontUriFromId } from './fontStore';
import { EXPORT_NODE_ID } from './nodeGraph';

describe('documentAssets', () => {
  const imageRef = 'artifact-asset://image-a';
  const imageDataUrl = 'data:image/png;base64,AAAA';
  const fontRef = fontUriFromId('font-a');
  const fontAsset = {
    id: 'font-a',
    dataUrl: 'data:font/woff2;base64,BBBB',
    mime: 'font/woff2',
    bytes: 128,
    label: 'Poster Local',
    family: 'Artifact Imported font a',
    createdAt: '2026-05-25T00:00:00.000Z',
  };

  function doc(partial: Partial<CanvasDocument> = {}): CanvasDocument {
    return {
      global: { bg: '#101010', seed: 1, aspect: '1:1' },
      layers: [],
      export: { format: 'png', scale: 1, target: 'cover' },
      ...partial,
    };
  }

  it('inventories imported image/font refs and portable payloads without loading bytes', () => {
    const inventory = inspectDocumentDependencies(
      doc({
        layers: [
          {
            ...makeImageLayer(imageRef, { id: 'image-a' }),
            aiGenerationHistory: [{ src: imageDataUrl, aiGeneration: { prompt: 'alt' } }],
          },
          makeTextLayer({ id: 'text-a', font: fontRef }),
          makeFillLayer({ id: 'fill-a' }),
        ],
        fontAssets: [fontAsset],
        graph: {
          edges: [{ id: 'e-text-export', fromId: 'text-a', fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' }],
          positions: {},
          mergeNodes: [],
          colorNodes: [],
        },
      }),
    );

    expect(inventory).toEqual({
      importedImageRefs: [imageRef],
      importedFontRefs: [fontRef],
      portableImagePayloads: [imageDataUrl],
      portableFontAssetIds: ['font-a'],
      hasGraphExportTarget: true,
      missingGraphExportTarget: false,
    });
  });

  it('reports graph documents without an export input', () => {
    const inventory = inspectDocumentDependencies(
      doc({ layers: [makeFillLayer()], graph: { edges: [], positions: {}, mergeNodes: [], colorNodes: [] } }),
    );

    expect(inventory.hasGraphExportTarget).toBe(false);
    expect(inventory.missingGraphExportTarget).toBe(true);
  });

  it('prepares portable documents by hydrating imported images and fonts', async () => {
    const { loadAssetDataUrl, loadFontAsset } = makePortableAssetLoaders({
      imageRef,
      imageDataUrl,
      fontRef,
      fontAsset,
    });

    const portable = await preparePortableDocument(
      doc({ layers: [makeImageLayer(imageRef), makeTextLayer({ font: fontRef })] }),
      { loadAssetDataUrl, loadFontAsset },
    );

    expect(loadAssetDataUrl).toHaveBeenCalledWith(imageRef);
    expect(loadFontAsset).toHaveBeenCalledWith(fontRef);
    expect(portable.layers[0]).toMatchObject({ kind: 'image', src: imageDataUrl });
    expect(portable.fontAssets).toEqual([fontAsset]);
  });

  it('stores portable image/font payloads and strips active document payloads', async () => {
    const saveAssetDataUrl = vi.fn(async () => imageRef);
    const saveFontAsset = vi.fn(async () => fontAsset);

    const stored = await storePortableDocumentAssets(
      doc({
        layers: [makeImageLayer(imageDataUrl), makeTextLayer({ font: fontRef })],
        fontAssets: [fontAsset],
      }),
      { saveAssetDataUrl, saveFontAsset },
    );

    expect(saveAssetDataUrl).toHaveBeenCalledWith(imageDataUrl);
    expect(saveFontAsset).toHaveBeenCalledWith(fontAsset);
    expect(stored.layers[0]).toMatchObject({ kind: 'image', src: imageRef });
    expect(stored.fontAssets).toBeUndefined();
    expect(hasPortableDocumentPayloads(stored)).toBe(false);
  });

  it('keeps documents usable when local payload storage is unavailable', async () => {
    const stored = await storePortableDocumentAssets(
      doc({
        layers: [makeImageLayer(imageDataUrl), makeTextLayer({ font: fontRef })],
        fontAssets: [fontAsset],
      }),
      {
        saveAssetDataUrl: vi.fn(async () => {
          throw new Error('asset store unavailable');
        }),
        saveFontAsset: vi.fn(async () => {
          throw new Error('font store unavailable');
        }),
      },
    );

    expect(stored.layers[0]).toMatchObject({ kind: 'image', src: imageDataUrl });
    expect(stored.fontAssets).toBeUndefined();
  });
});

import { describe, expect, it, vi } from 'vitest';
import { type CanvasDocument, makeFillLayer, makeImageLayer } from '../types/config';
import { hydrateDocumentImageAssets } from './assetStore';

describe('hydrateDocumentImageAssets', () => {
  const portableDataUrl = 'data:image/png;base64,AAAA';

  it('hydrates generated local image assets into portable document data URLs', async () => {
    const doc: CanvasDocument = {
      global: { bg: '#101010', seed: 13, aspect: '1:1' },
      layers: [
        makeImageLayer('artifact-asset://generated-output', { id: 'generated-layer' }),
        makeFillLayer({ id: 'fill-layer' }),
      ],
      export: { format: 'png', scale: 1, target: 'cover' },
    };
    const loadAssetDataUrl = vi.fn(async (src: string) =>
      src === 'artifact-asset://generated-output' ? portableDataUrl : null,
    );

    const hydrated = await hydrateDocumentImageAssets(doc, { loadAssetDataUrl });

    expect(loadAssetDataUrl).toHaveBeenCalledWith('artifact-asset://generated-output');
    expect(hydrated.layers[0]).toMatchObject({ id: 'generated-layer', kind: 'image', src: portableDataUrl });
    expect(doc.layers[0]).toMatchObject({
      id: 'generated-layer',
      kind: 'image',
      src: 'artifact-asset://generated-output',
    });
  });

  it('preserves local asset references when bytes are unavailable', async () => {
    const doc: CanvasDocument = {
      global: { bg: '#101010', seed: 13, aspect: '1:1' },
      layers: [makeImageLayer('artifact-asset://missing-generated-output', { id: 'generated-layer' })],
      export: { format: 'png', scale: 1, target: 'cover' },
    };

    const hydrated = await hydrateDocumentImageAssets(doc, { loadAssetDataUrl: vi.fn(async () => null) });

    expect(hydrated).toBe(doc);
    expect(hydrated.layers[0]).toMatchObject({
      id: 'generated-layer',
      kind: 'image',
      src: 'artifact-asset://missing-generated-output',
    });
  });
});

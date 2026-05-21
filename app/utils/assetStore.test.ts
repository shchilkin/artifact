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

  it('hydrates generated image history alongside the selected image', async () => {
    const doc: CanvasDocument = {
      global: { bg: '#101010', seed: 13, aspect: '1:1' },
      layers: [
        {
          ...makeImageLayer('artifact-asset://generated-output', { id: 'generated-layer' }),
          aiGeneration: { prompt: 'current', status: 'succeeded' },
          aiGenerationHistory: [
            { src: 'artifact-asset://generated-output', aiGeneration: { prompt: 'current', status: 'succeeded' } },
            { src: 'artifact-asset://generated-alt', aiGeneration: { prompt: 'alt', status: 'succeeded' } },
          ],
          aiGenerationHistoryIndex: 0,
        },
      ],
      export: { format: 'png', scale: 1, target: 'cover' },
    };
    const loadAssetDataUrl = vi.fn(async (src: string) => {
      if (src === 'artifact-asset://generated-output') return portableDataUrl;
      if (src === 'artifact-asset://generated-alt') return 'data:image/png;base64,BBBB';
      return null;
    });

    const hydrated = await hydrateDocumentImageAssets(doc, { loadAssetDataUrl });
    const layer = hydrated.layers[0];

    expect(layer).toMatchObject({
      kind: 'image',
      src: portableDataUrl,
      aiGenerationHistory: [
        { src: portableDataUrl, aiGeneration: { prompt: 'current' } },
        { src: 'data:image/png;base64,BBBB', aiGeneration: { prompt: 'alt' } },
      ],
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

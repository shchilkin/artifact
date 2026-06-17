import { describe, expect, it, vi } from 'vitest';
import {
  type CanvasDocument,
  makeFillLayer,
  makeGraphEnvironmentNode,
  makeImageLayer,
  makeSourceLayer,
  makeTextLayer,
} from '../types/config';
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
  const modelRef = 'artifact-model://model-a';
  const modelDataUrl = 'data:model/gltf-binary;base64,CCCC';
  const environmentRef = 'artifact-env://env-a';
  const environmentDataUrl = 'data:image/x-exr;base64,DDDD';
  const fontAsset = {
    id: 'font-a',
    dataUrl: 'data:font/woff2;base64,BBBB',
    mime: 'font/woff2',
    bytes: 128,
    label: 'Poster Local',
    family: 'Artifact Imported font a',
    createdAt: '2026-05-25T00:00:00.000Z',
  };
  const modelAsset = {
    id: 'model-a',
    dataUrl: modelDataUrl,
    mime: 'model/gltf-binary',
    bytes: 512,
    label: 'skull.glb',
    createdAt: '2026-06-13T00:00:00.000Z',
  };
  const environmentAsset = {
    id: 'env-a',
    dataUrl: environmentDataUrl,
    mime: 'image/x-exr',
    bytes: 1024,
    label: 'studio.exr',
    createdAt: '2026-06-13T00:00:00.000Z',
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
          makeSourceLayer('model', { id: 'model-a', modelSrc: modelRef }),
          makeFillLayer({ id: 'fill-a' }),
        ],
        fontAssets: [fontAsset],
        modelAssets: [modelAsset],
        graph: {
          edges: [{ id: 'e-text-export', fromId: 'text-a', fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' }],
          positions: {},
          mergeNodes: [],
          colorNodes: [],
          environmentNodes: [makeGraphEnvironmentNode({ id: 'env-node-a', environmentSrc: environmentRef })],
        },
        envAssets: [environmentAsset],
      }),
    );

    expect(inventory).toEqual({
      importedImageRefs: [imageRef],
      importedFontRefs: [fontRef],
      importedModelRefs: [modelRef],
      importedEnvironmentRefs: [environmentRef],
      portableImagePayloads: [imageDataUrl],
      portableFontAssetIds: ['font-a'],
      portableModelAssetIds: ['model-a'],
      portableEnvironmentAssetIds: ['env-a'],
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
    const { loadAssetDataUrl, loadFontAsset, loadModelAsset, loadEnvironmentAsset } = makePortableAssetLoaders({
      imageRef,
      imageDataUrl,
      fontRef,
      fontAsset,
      modelRef,
      modelAsset,
      environmentRef,
      environmentAsset,
    });

    const portable = await preparePortableDocument(
      doc({
        layers: [
          makeImageLayer(imageRef),
          makeTextLayer({ font: fontRef }),
          makeSourceLayer('model', { modelSrc: modelRef }),
        ],
        graph: {
          edges: [],
          positions: {},
          mergeNodes: [],
          colorNodes: [],
          environmentNodes: [makeGraphEnvironmentNode({ id: 'env-node-a', environmentSrc: environmentRef })],
        },
      }),
      { loadAssetDataUrl, loadFontAsset, loadModelAsset, loadEnvironmentAsset },
    );

    expect(loadAssetDataUrl).toHaveBeenCalledWith(imageRef);
    expect(loadFontAsset).toHaveBeenCalledWith(fontRef);
    expect(loadModelAsset).toHaveBeenCalledWith(modelRef);
    expect(loadEnvironmentAsset).toHaveBeenCalledWith(environmentRef);
    expect(portable.layers[0]).toMatchObject({ kind: 'image', src: imageDataUrl });
    expect(portable.fontAssets).toEqual([fontAsset]);
    expect(portable.layers[2]).toMatchObject({ kind: 'model', modelSrc: modelDataUrl, modelName: 'skull.glb' });
    expect(portable.modelAssets).toEqual([modelAsset]);
    expect(portable.graph?.environmentNodes?.[0]).toMatchObject({
      environmentSrc: environmentDataUrl,
      environmentName: 'studio.exr',
    });
    expect(portable.envAssets).toEqual([environmentAsset]);
  });

  it('stores portable image/font payloads and strips active document payloads', async () => {
    const saveAssetDataUrl = vi.fn(async () => imageRef);
    const saveFontAsset = vi.fn(async () => fontAsset);
    const saveModelDataUrl = vi.fn(async () => modelAsset);
    const saveModelAsset = vi.fn(async () => modelAsset);
    const saveEnvironmentDataUrl = vi.fn(async () => environmentAsset);
    const saveEnvironmentAsset = vi.fn(async () => environmentAsset);

    const stored = await storePortableDocumentAssets(
      doc({
        layers: [
          makeImageLayer(imageDataUrl),
          makeTextLayer({ font: fontRef }),
          makeSourceLayer('model', { modelSrc: modelDataUrl }),
        ],
        graph: {
          edges: [],
          positions: {},
          mergeNodes: [],
          colorNodes: [],
          environmentNodes: [makeGraphEnvironmentNode({ environmentSrc: environmentDataUrl })],
        },
        fontAssets: [fontAsset],
        modelAssets: [modelAsset],
        envAssets: [environmentAsset],
      }),
      {
        saveAssetDataUrl,
        saveFontAsset,
        saveModelDataUrl,
        saveModelAsset,
        saveEnvironmentDataUrl,
        saveEnvironmentAsset,
      },
    );

    expect(saveAssetDataUrl).toHaveBeenCalledWith(imageDataUrl);
    expect(saveFontAsset).toHaveBeenCalledWith(fontAsset);
    expect(saveModelDataUrl).toHaveBeenCalledWith(modelDataUrl, 'Imported model');
    expect(saveModelAsset).toHaveBeenCalledWith({
      dataUrl: modelDataUrl,
      mime: 'model/gltf-binary',
      bytes: 512,
      label: 'skull.glb',
    });
    expect(saveEnvironmentDataUrl).toHaveBeenCalledWith(environmentDataUrl, 'Imported environment');
    expect(saveEnvironmentAsset).toHaveBeenCalledWith({
      dataUrl: environmentDataUrl,
      mime: 'image/x-exr',
      bytes: 1024,
      label: 'studio.exr',
    });
    expect(stored.layers[0]).toMatchObject({ kind: 'image', src: imageRef });
    expect(stored.layers[2]).toMatchObject({ kind: 'model', modelSrc: modelRef });
    expect(stored.graph?.environmentNodes?.[0]).toMatchObject({ environmentSrc: environmentRef });
    expect(stored.fontAssets).toBeUndefined();
    expect(stored.modelAssets).toBeUndefined();
    expect(stored.envAssets).toBeUndefined();
    expect(hasPortableDocumentPayloads(stored)).toBe(false);
  });

  it('keeps documents usable when local payload storage is unavailable', async () => {
    const stored = await storePortableDocumentAssets(
      doc({
        layers: [
          makeImageLayer(imageDataUrl),
          makeTextLayer({ font: fontRef }),
          makeSourceLayer('model', { modelSrc: modelDataUrl }),
        ],
        fontAssets: [fontAsset],
        modelAssets: [modelAsset],
      }),
      {
        saveAssetDataUrl: vi.fn(async () => {
          throw new Error('asset store unavailable');
        }),
        saveFontAsset: vi.fn(async () => {
          throw new Error('font store unavailable');
        }),
        saveModelDataUrl: vi.fn(async () => {
          throw new Error('model store unavailable');
        }),
        saveModelAsset: vi.fn(async () => {
          throw new Error('model store unavailable');
        }),
      },
    );

    expect(stored.layers[0]).toMatchObject({ kind: 'image', src: imageDataUrl });
    expect(stored.layers[2]).toMatchObject({ kind: 'model', modelSrc: modelDataUrl });
    expect(stored.fontAssets).toBeUndefined();
    expect(stored.modelAssets).toBeUndefined();
  });
});

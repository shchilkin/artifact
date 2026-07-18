import { describe, expect, it, vi } from 'vitest';
import {
  type CanvasDocument,
  makeFillLayer,
  makeGraphEnvironmentNode,
  makeImageLayer,
  makeSourceLayer,
  makeTextLayer,
} from '../types/config';
import { inspectDocumentDependencies } from './documentAssets';
import { makePortableAssetLoaders } from './documentAssetTestHelpers';
import {
  ARTIFACT_PROJECT_PACKAGE_EXTENSION,
  ARTIFACT_PROJECT_PACKAGE_KIND,
  ARTIFACT_PROJECT_PACKAGE_MIME,
  buildArtifactProjectPackageManifest,
  createArtifactProjectPackageFileName,
  importArtifactProjectPackage,
  isArtifactProjectPackageFile,
  parseArtifactProjectPackage,
  prepareArtifactProjectPackage,
  serializeArtifactProjectPackage,
} from './documentPackage';
import { fontUriFromId } from './fontStore';
import { EXPORT_NODE_ID } from './nodeGraph';

describe('documentPackage', () => {
  const imageRef = 'artifact-asset://image-a';
  const imageDataUrl = 'data:image/png;base64,AAAA';
  const modelRef = 'artifact-model://model-a';
  const modelDataUrl = 'data:model/gltf-binary;base64,CCCC';
  const environmentRef = 'artifact-env://env-a';
  const environmentDataUrl = 'data:image/x-exr;base64,DDDD';
  const fontRef = fontUriFromId('font-a');
  const fontAsset = {
    id: 'font-a',
    dataUrl: 'data:font/woff2;base64,BBBB',
    mime: 'font/woff2',
    bytes: 128,
    label: 'Poster Local',
    family: 'Artifact Imported font a',
    createdAt: '2026-05-25T00:00:00.000Z',
    source: 'local-file' as const,
    embeddingPolicy: 'user-confirmed-required' as const,
  };
  const googleFontAsset = {
    ...fontAsset,
    id: 'google-font-a',
    label: 'Space Grotesk',
    family: 'Artifact Google google font a',
    source: 'google-fonts' as const,
    sourceName: 'Space Grotesk (Google Fonts)',
    sourceUrl: 'https://fonts.googleapis.com/css2?family=Space+Grotesk&display=swap',
    license: { name: 'SIL Open Font License 1.1', allowsEmbedding: true },
    embeddingPolicy: 'open-license-embeddable' as const,
  };
  const modelAsset = {
    id: 'model-a',
    dataUrl: modelDataUrl,
    mime: 'model/gltf-binary',
    bytes: 2_008_530,
    label: 'Untitled.glb',
    createdAt: '2026-06-13T00:00:00.000Z',
  };
  const environmentAsset = {
    id: 'env-a',
    dataUrl: environmentDataUrl,
    mime: 'image/x-exr',
    bytes: 6_100_000,
    label: 'Qwantani Dusk.exr',
    createdAt: '2026-06-13T00:00:00.000Z',
  };

  function doc(partial: Partial<CanvasDocument> = {}): CanvasDocument {
    return {
      global: { bg: 'transparent', seed: 1234, aspect: '1:1' },
      layers: [],
      export: { format: 'png', scale: 1, target: 'cover' },
      ...partial,
    };
  }

  it('builds a package manifest that keeps raster export pixel-only and text editable', () => {
    const sourceDoc = doc({
      layers: [
        makeImageLayer(imageRef, { id: 'image-a' }),
        makeTextLayer({ id: 'title', content: 'TYPE MIX', font: fontRef }),
        makeTextLayer({ id: 'label', content: 'CATALOG', font: 'BUNGEE' }),
        makeFillLayer({ id: 'plate' }),
      ],
      graph: {
        edges: [{ id: 'e-title-export', fromId: 'title', fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' }],
        positions: {},
        mergeNodes: [],
        colorNodes: [],
      },
    });
    const packageDoc = doc({
      ...sourceDoc,
      layers: sourceDoc.layers.map((layer) => (layer.kind === 'image' ? { ...layer, src: imageDataUrl } : layer)),
    });
    const metadata = new Map([[fontAsset.id, { ...fontAsset, dataUrl: undefined }]]);

    const manifest = buildArtifactProjectPackageManifest(sourceDoc, packageDoc, metadata, {
      now: new Date('2026-05-26T00:00:00.000Z'),
    });

    expect(manifest).toMatchObject({
      kind: ARTIFACT_PROJECT_PACKAGE_KIND,
      version: 1,
      createdAt: '2026-05-26T00:00:00.000Z',
      rasterExportPolicy: 'pixel-only-no-font-files',
      editableTextPolicy: 'original-text-plus-font-metadata',
      visualFallbackPolicy: 'raster-snapshot-preferred-svg-outlines-explicit-only',
      images: {
        importedRefs: [imageRef],
        embeddedPayloads: 1,
        remainingLocalRefs: [],
      },
      hasGraphExportTarget: true,
      missingGraphExportTarget: false,
    });
    expect(manifest.fonts).toEqual([
      expect.objectContaining({
        ref: fontRef,
        kind: 'imported',
        layerIds: ['title'],
        textContents: ['TYPE MIX'],
        embedding: 'metadata-only',
        recovery: 'editable-text-replace-font',
        asset: expect.objectContaining({ id: 'font-a', label: 'Poster Local' }),
      }),
      expect.objectContaining({
        ref: 'BUNGEE',
        kind: 'bundled',
        layerIds: ['label'],
        textContents: ['CATALOG'],
        embedding: 'bundled-registry',
        recovery: 'registry-font',
      }),
    ]);
  });

  it('prepares license-aware packages without embedding unknown local font files by default', async () => {
    const { loadAssetDataUrl, loadFontAsset } = makePortableAssetLoaders({
      imageRef,
      imageDataUrl,
      fontRef,
      fontAsset,
    });

    const projectPackage = await prepareArtifactProjectPackage(
      doc({ layers: [makeImageLayer(imageRef), makeTextLayer({ id: 'title', content: 'POSTER', font: fontRef })] }),
      { loadAssetDataUrl, loadFontAsset, now: new Date('2026-05-26T00:00:00.000Z') },
    );

    expect(loadAssetDataUrl).toHaveBeenCalledWith(imageRef);
    expect(loadFontAsset).toHaveBeenCalledWith(fontRef);
    expect(projectPackage.document.layers[0]).toMatchObject({ kind: 'image', src: imageDataUrl });
    expect(projectPackage.document.fontAssets).toBeUndefined();
    expect(projectPackage.manifest.fontEmbeddingMode).toBe('license-aware');
    expect(projectPackage.manifest.fonts[0]).toMatchObject({
      ref: fontRef,
      embedding: 'metadata-only',
      recovery: 'editable-text-replace-font',
      textContents: ['POSTER'],
    });
  });

  it('embeds open-license Google fonts in license-aware packages', async () => {
    const googleRef = fontUriFromId(googleFontAsset.id);
    const projectPackage = await prepareArtifactProjectPackage(
      doc({ layers: [makeTextLayer({ id: 'title', content: 'POSTER', font: googleRef })] }),
      { loadFontAsset: vi.fn(async () => googleFontAsset) },
    );

    expect(projectPackage.document.fontAssets).toEqual([googleFontAsset]);
    expect(projectPackage.manifest.fontEmbeddingMode).toBe('license-aware');
    expect(projectPackage.manifest.fonts[0]).toMatchObject({
      ref: googleRef,
      embedding: 'embedded-file',
      asset: expect.objectContaining({
        label: 'Space Grotesk',
        source: 'google-fonts',
        license: { name: 'SIL Open Font License 1.1', allowsEmbedding: true },
      }),
    });
  });

  it('supports explicit font-file package mode for user-confirmed embedding', async () => {
    const projectPackage = await prepareArtifactProjectPackage(
      doc({ layers: [makeTextLayer({ id: 'title', font: fontRef })] }),
      { includeFontFiles: true, loadFontAsset: vi.fn(async () => fontAsset) },
    );

    expect(projectPackage.document.fontAssets).toEqual([fontAsset]);
    expect(projectPackage.manifest.fontEmbeddingMode).toBe('explicit-font-files');
    expect(projectPackage.manifest.fonts[0]).toMatchObject({
      ref: fontRef,
      embedding: 'embedded-file',
      recovery: 'editable-text-replace-font',
    });
  });

  it('serializes, parses, and imports package documents through existing asset storage boundaries', async () => {
    const projectPackage = await prepareArtifactProjectPackage(
      doc({
        layers: [makeImageLayer(imageRef), makeTextLayer({ id: 'title', font: fontRef })],
      }),
      {
        includeFontFiles: true,
        loadAssetDataUrl: vi.fn(async () => imageDataUrl),
        loadFontAsset: vi.fn(async () => fontAsset),
      },
    );

    const parsed = parseArtifactProjectPackage(serializeArtifactProjectPackage(projectPackage));
    expect(parsed?.manifest.kind).toBe(ARTIFACT_PROJECT_PACKAGE_KIND);

    const saveAssetDataUrl = vi.fn(async () => imageRef);
    const saveFontAsset = vi.fn(async () => fontAsset);
    const imported = await importArtifactProjectPackage(parsed!, { saveAssetDataUrl, saveFontAsset });

    expect(saveAssetDataUrl).toHaveBeenCalledWith(imageDataUrl);
    expect(saveFontAsset).toHaveBeenCalledWith(fontAsset);
    expect(imported.layers[0]).toMatchObject({ kind: 'image', src: imageRef });
    expect(imported.fontAssets).toBeUndefined();
    expect(imported.layers[1]).toMatchObject({ kind: 'text', font: fontRef });
  });

  it('round-trips imported GLB and EXR payloads through a clean project-package import', async () => {
    const { loadModelAsset, loadEnvironmentAsset } = makePortableAssetLoaders({
      imageRef,
      imageDataUrl,
      fontRef,
      fontAsset,
      modelRef,
      modelAsset,
      environmentRef,
      environmentAsset,
    });
    const projectPackage = await prepareArtifactProjectPackage(
      doc({
        layers: [makeSourceLayer('model', { id: 'model-node', modelSrc: modelRef, modelName: 'Untitled.glb' })],
        graph: {
          edges: [],
          positions: {},
          mergeNodes: [],
          colorNodes: [],
          environmentNodes: [
            makeGraphEnvironmentNode({
              id: 'environment-node',
              environmentSrc: environmentRef,
              environmentName: 'Qwantani Dusk.exr',
            }),
          ],
        },
      }),
      { loadModelAsset, loadEnvironmentAsset },
    );

    expect(loadModelAsset).toHaveBeenCalledWith(modelRef);
    expect(loadEnvironmentAsset).toHaveBeenCalledWith(environmentRef);
    expect(projectPackage.document.modelAssets).toEqual([modelAsset]);
    expect(projectPackage.document.envAssets).toEqual([environmentAsset]);
    expect(projectPackage.manifest).toMatchObject({
      models: {
        importedRefs: [modelRef],
        embeddedPayloads: 1,
        remainingLocalRefs: [],
        assets: [
          {
            ref: modelRef,
            id: 'model-a',
            name: 'Untitled.glb',
            mime: 'model/gltf-binary',
            bytes: 2_008_530,
            embedded: true,
          },
        ],
      },
      environments: {
        importedRefs: [environmentRef],
        embeddedPayloads: 1,
        remainingLocalRefs: [],
        assets: [
          {
            ref: environmentRef,
            id: 'env-a',
            name: 'Qwantani Dusk.exr',
            mime: 'image/x-exr',
            bytes: 6_100_000,
            embedded: true,
          },
        ],
      },
    });

    const parsed = parseArtifactProjectPackage(serializeArtifactProjectPackage(projectPackage));
    const saveModelDataUrl = vi.fn(async () => modelAsset);
    const saveModelAsset = vi.fn(async () => modelAsset);
    const saveEnvironmentDataUrl = vi.fn(async () => environmentAsset);
    const saveEnvironmentAsset = vi.fn(async () => environmentAsset);
    const imported = await importArtifactProjectPackage(parsed!, {
      saveModelDataUrl,
      saveModelAsset,
      saveEnvironmentDataUrl,
      saveEnvironmentAsset,
    });

    expect(saveModelDataUrl).not.toHaveBeenCalled();
    expect(saveModelAsset).toHaveBeenCalledWith(modelAsset);
    expect(saveEnvironmentDataUrl).not.toHaveBeenCalled();
    expect(saveEnvironmentAsset).toHaveBeenCalledWith(environmentAsset);
    expect(imported.layers[0]).toMatchObject({
      kind: 'model',
      modelSrc: modelRef,
      modelName: 'Untitled.glb',
      modelMime: 'model/gltf-binary',
      modelBytes: 2_008_530,
    });
    expect(imported.graph?.environmentNodes?.[0]).toMatchObject({
      environmentSrc: environmentRef,
      environmentName: 'Qwantani Dusk.exr',
      environmentMime: 'image/x-exr',
      environmentBytes: 6_100_000,
    });
    expect(imported.modelAssets).toBeUndefined();
    expect(imported.envAssets).toBeUndefined();
  });

  it('keeps legacy packages without embedded 3D payloads importable and reports unresolved refs', async () => {
    const legacyPackage = parseArtifactProjectPackage(
      JSON.stringify({
        artifactPackage: 'project',
        manifest: {
          kind: ARTIFACT_PROJECT_PACKAGE_KIND,
          version: 1,
          createdAt: '2026-07-18T00:00:00.000Z',
          documentSchemaVersion: 3,
          images: { importedRefs: [], embeddedPayloads: 0, remainingLocalRefs: [] },
          fonts: [],
        },
        document: doc({
          schemaVersion: 3,
          layers: [makeSourceLayer('model', { modelSrc: modelRef, modelName: 'Untitled.glb' })],
          graph: {
            edges: [],
            positions: {},
            mergeNodes: [],
            colorNodes: [],
            environmentNodes: [
              makeGraphEnvironmentNode({ environmentSrc: environmentRef, environmentName: 'Qwantani Dusk.exr' }),
            ],
          },
        }),
      }),
    );

    const imported = await importArtifactProjectPackage(legacyPackage!);

    expect(imported.layers[0]).toMatchObject({ kind: 'model', modelSrc: modelRef });
    expect(imported.graph?.environmentNodes?.[0]).toMatchObject({ environmentSrc: environmentRef });
    expect(inspectDocumentDependencies(imported)).toMatchObject({
      importedModelRefs: [modelRef],
      importedEnvironmentRefs: [environmentRef],
      portableModelAssetIds: [],
      portableEnvironmentAssetIds: [],
    });
  });

  it('recognizes project package files and creates stable package names', () => {
    const file = new File(['{}'], `cover${ARTIFACT_PROJECT_PACKAGE_EXTENSION}`, {
      type: ARTIFACT_PROJECT_PACKAGE_MIME,
    });

    expect(isArtifactProjectPackageFile(file)).toBe(true);
    expect(createArtifactProjectPackageFileName(doc())).toMatch(/^artifact-project-[a-z0-9]+\.artifact$/);
  });
});

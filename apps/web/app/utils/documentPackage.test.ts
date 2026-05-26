import { describe, expect, it, vi } from 'vitest';
import { type CanvasDocument, makeFillLayer, makeImageLayer, makeTextLayer } from '../types/config';
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

  it('prepares metadata-only packages without embedding imported font files by default', async () => {
    const loadAssetDataUrl = vi.fn(async (src: string) => (src === imageRef ? imageDataUrl : null));
    const loadFontAsset = vi.fn(async (font: string) => (font === fontRef ? fontAsset : null));

    const projectPackage = await prepareArtifactProjectPackage(
      doc({ layers: [makeImageLayer(imageRef), makeTextLayer({ id: 'title', content: 'POSTER', font: fontRef })] }),
      { loadAssetDataUrl, loadFontAsset, now: new Date('2026-05-26T00:00:00.000Z') },
    );

    expect(loadAssetDataUrl).toHaveBeenCalledWith(imageRef);
    expect(loadFontAsset).toHaveBeenCalledWith(fontRef);
    expect(projectPackage.document.layers[0]).toMatchObject({ kind: 'image', src: imageDataUrl });
    expect(projectPackage.document.fontAssets).toBeUndefined();
    expect(projectPackage.manifest.fontEmbeddingMode).toBe('metadata-only');
    expect(projectPackage.manifest.fonts[0]).toMatchObject({
      ref: fontRef,
      embedding: 'metadata-only',
      recovery: 'editable-text-replace-font',
      textContents: ['POSTER'],
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

  it('recognizes project package files and creates stable package names', () => {
    const file = new File(['{}'], `cover${ARTIFACT_PROJECT_PACKAGE_EXTENSION}`, {
      type: ARTIFACT_PROJECT_PACKAGE_MIME,
    });

    expect(isArtifactProjectPackageFile(file)).toBe(true);
    expect(createArtifactProjectPackageFileName(doc())).toMatch(/^artifact-project-[a-z0-9]+\.artifact$/);
  });
});

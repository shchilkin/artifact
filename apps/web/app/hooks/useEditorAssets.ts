import { useCallback, useEffect, useRef, useState } from 'react';
import type { CanvasDocument, GraphEnvironmentNode, ImageLayer, ModelLayer } from '../types/config';
import { isAssetUri, isImageDataUrl, resolveImageSource, saveImageAsset } from '../utils/assetStore';
import { environmentUriFromId, isSupportedEnvironmentFile, saveEnvironmentFileAsset } from '../utils/envAssetStore';
import { isSupportedModelFile, modelUriFromId, saveModelFileAsset } from '../utils/modelAssetStore';

const MAX_IMAGE_BYTES = 25 * 1024 * 1024; // 25 MB
const MAX_MODEL_BYTES = 50 * 1024 * 1024; // 50 MB
const MAX_ENVIRONMENT_BYTES = 80 * 1024 * 1024; // 80 MB
const MAX_EDGE = 2048;
const RECOMPRESS_BYTES = 1 * 1024 * 1024; // re-encode if >1 MB even when small enough by edge
const IMAGE_FILE_RE = /\.(avif|gif|jpe?g|png|svg|webp)$/i;
const SUPPORTED_DROP_FORMATS = 'images, GLB models, EXR/HDR environments, or .artifact documents';

function isImageFile(file: File) {
  return file.type.startsWith('image/') || IMAGE_FILE_RE.test(file.name);
}

export function unsupportedAssetDropMessage(file: Pick<File, 'name'>) {
  const label = file.name?.trim() || 'This file';
  return `Unsupported file: ${label}. Drop ${SUPPORTED_DROP_FORMATS}.`;
}

async function readImageFile(file: File): Promise<string | null> {
  if (!isImageFile(file)) return null;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(typeof event.target?.result === 'string' ? event.target.result : null);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('decode failed'));
    img.src = src;
  });
}

// Existing image import guard logic; v0.32 tracks asset hook debt.
// fallow-ignore-next-line complexity
async function downsampleDataUrl(src: string, mimeHint: string): Promise<string> {
  const img = await loadImage(src);
  const longest = Math.max(img.naturalWidth, img.naturalHeight);
  const tooLarge = longest > MAX_EDGE;
  const tooHeavy = src.length * 0.75 > RECOMPRESS_BYTES; // base64 → bytes approx
  if (!tooLarge && !tooHeavy) return src;

  const scale = tooLarge ? MAX_EDGE / longest : 1;
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return src;
  ctx.drawImage(img, 0, 0, w, h);
  const outMime = mimeHint === 'image/jpeg' ? 'image/jpeg' : 'image/png';
  return canvas.toDataURL(outMime, 0.9);
}

export function useEditorAssets(
  doc: CanvasDocument,
  onImportImage: (src: string, position?: { x: number; y: number }) => void,
  onImportModel?: (asset: Pick<ModelLayer, 'modelSrc' | 'modelName' | 'modelMime' | 'modelBytes'>) => void,
  onImportEnvironment?: (
    asset: Pick<GraphEnvironmentNode, 'environmentSrc' | 'environmentName' | 'environmentMime' | 'environmentBytes'>,
    position?: { x: number; y: number },
  ) => void,
  onStoreImageAsset?: (layerId: string, src: string, previousSrc: string) => void,
) {
  const [imageCache, setImageCache] = useState<Map<string, HTMLImageElement>>(new Map());
  const [dropError, setDropError] = useState<string | null>(null);
  const dropErrorTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const pendingAssetStoresRef = useRef(new Set<string>());
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimeout(dropErrorTimerRef.current);
    };
  }, []);

  const showDropError = useCallback((message: string) => {
    setDropError(message);
    clearTimeout(dropErrorTimerRef.current);
    dropErrorTimerRef.current = setTimeout(() => setDropError(null), 4000);
  }, []);

  useEffect(() => {
    const imageLayers = doc.layers.filter((layer): layer is ImageLayer => layer.kind === 'image' && Boolean(layer.src));
    let cancelled = false;
    // Existing asset hydration branches; v0.32 tracks asset hook debt.
    // fallow-ignore-next-line complexity
    imageLayers.forEach((layer) => {
      if (isImageDataUrl(layer.src) && onStoreImageAsset && !pendingAssetStoresRef.current.has(layer.src)) {
        pendingAssetStoresRef.current.add(layer.src);
        saveImageAsset(layer.src)
          .then((assetSrc) => {
            pendingAssetStoresRef.current.delete(layer.src);
            if (mountedRef.current && assetSrc !== layer.src) onStoreImageAsset(layer.id, assetSrc, layer.src);
          })
          .catch(() => {
            pendingAssetStoresRef.current.delete(layer.src);
          });
      }
      if (imageCache.has(layer.src)) return;
      const image = new Image();
      image.onload = () => {
        if (cancelled) return;
        setImageCache((current) => {
          if (current.has(layer.src)) return current;
          const next = new Map(current);
          next.set(layer.src, image);
          return next;
        });
      };
      image.onerror = () => {
        // silently skip unloadable images
      };
      if (isAssetUri(layer.src)) {
        resolveImageSource(layer.src)
          .then((resolvedSrc) => {
            if (!cancelled && resolvedSrc) image.src = resolvedSrc;
          })
          .catch(() => {
            // silently skip unloadable assets
          });
      } else {
        image.src = layer.src;
      }
    });
    return () => {
      cancelled = true;
    };
  }, [doc.layers, imageCache, onStoreImageAsset]);

  const handleDroppedFile = useCallback(
    // Existing drop/import guard logic; v0.32 tracks asset hook debt.
    // fallow-ignore-next-line complexity
    async (file: File, position?: { x: number; y: number }) => {
      if (isSupportedModelFile(file)) {
        if (!onImportModel) return;
        if (file.size > MAX_MODEL_BYTES) {
          showDropError(`Model too large — max ${MAX_MODEL_BYTES / 1024 / 1024}MB`);
          return;
        }
        try {
          const asset = await saveModelFileAsset(file);
          onImportModel({
            modelSrc: modelUriFromId(asset.id),
            modelName: asset.label,
            modelMime: asset.mime,
            modelBytes: asset.bytes,
          });
        } catch {
          showDropError('Could not read model');
        }
        return;
      }
      if (isSupportedEnvironmentFile(file)) {
        if (!onImportEnvironment) return;
        if (file.size > MAX_ENVIRONMENT_BYTES) {
          showDropError(`Environment too large — max ${MAX_ENVIRONMENT_BYTES / 1024 / 1024}MB`);
          return;
        }
        try {
          const asset = await saveEnvironmentFileAsset(file);
          onImportEnvironment(
            {
              environmentSrc: environmentUriFromId(asset.id),
              environmentName: asset.label,
              environmentMime: asset.mime,
              environmentBytes: asset.bytes,
            },
            position,
          );
        } catch {
          showDropError('Could not read environment map');
        }
        return;
      }
      if (!isImageFile(file)) {
        showDropError(unsupportedAssetDropMessage(file));
        return;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        showDropError(`Image too large — max ${MAX_IMAGE_BYTES / 1024 / 1024}MB`);
        return;
      }
      try {
        const src = await readImageFile(file);
        if (!src) return;
        const optimized = await downsampleDataUrl(src, file.type);
        let importedSrc = optimized;
        try {
          importedSrc = await saveImageAsset(optimized);
        } catch {
          // Keep the upload usable even if IndexedDB is blocked or temporarily unavailable.
        }
        onImportImage(importedSrc, position);
      } catch {
        showDropError('Could not read image');
      }
    },
    [onImportEnvironment, onImportImage, onImportModel, showDropError],
  );

  useEffect(() => {
    // Existing paste image guard logic; v0.32 tracks asset hook debt.
    // fallow-ignore-next-line complexity
    function onPaste(event: ClipboardEvent) {
      if (event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLInputElement) return;
      const items = event.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (!item.type.startsWith('image/')) continue;
        const file = item.getAsFile();
        if (file) {
          void handleDroppedFile(file);
          break;
        }
      }
    }
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [handleDroppedFile]);

  return {
    imageCache,
    dropError,
    handleDroppedFile,
  };
}

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CanvasDocument, ImageLayer } from '../types/config';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

async function readImageFile(file: File): Promise<string | null> {
  if (!file.type.startsWith('image/')) return null;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(typeof event.target?.result === 'string' ? event.target.result : null);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function useGeneratorAssets(
  doc: CanvasDocument,
  onImportImage: (src: string) => void,
) {
  const [imageCache, setImageCache] = useState<Map<string, HTMLImageElement>>(new Map());
  const [dropError, setDropError] = useState<string | null>(null);
  const dropErrorTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(dropErrorTimerRef.current), []);

  const showDropError = useCallback((message: string) => {
    setDropError(message);
    clearTimeout(dropErrorTimerRef.current);
    dropErrorTimerRef.current = setTimeout(() => setDropError(null), 4000);
  }, []);

  useEffect(() => {
    const imageLayers = doc.layers.filter((layer): layer is ImageLayer => layer.kind === 'image' && Boolean(layer.src));
    let cancelled = false;
    imageLayers.forEach((layer) => {
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
      image.src = layer.src;
    });
    return () => {
      cancelled = true;
    };
  }, [doc.layers, imageCache]);

  const handleDroppedFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) return;
    if (file.size > MAX_IMAGE_BYTES) {
      showDropError(`Image too large — max ${MAX_IMAGE_BYTES / 1024 / 1024}MB`);
      return;
    }
    try {
      const src = await readImageFile(file);
      if (!src) return;
      onImportImage(src);
    } catch {
      showDropError('Could not read image');
    }
  }, [onImportImage, showDropError]);

  useEffect(() => {
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

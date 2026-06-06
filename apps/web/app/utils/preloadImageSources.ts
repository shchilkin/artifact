import { resolveImageSource } from './assetStore';

export async function preloadImageSources(
  srcs: string[],
  imageCache: Map<string, HTMLImageElement>,
  effectiveImageCache = imageCache,
) {
  await Promise.all(
    srcs.map(
      (src) =>
        new Promise<void>((resolve) => {
          const image = new Image();
          image.onload = () => {
            imageCache.set(src, image);
            effectiveImageCache.set(src, image);
            resolve();
          };
          image.onerror = () => resolve();
          resolveImageSource(src)
            .then((resolvedSrc) => {
              if (resolvedSrc) image.src = resolvedSrc;
              else resolve();
            })
            .catch(() => resolve());
        }),
    ),
  );
}

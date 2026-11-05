import { describe, expect, it } from 'vitest';
import { markRenderAssetFallback } from '../utils/renderAssetEpoch';
import { galleryGraphRenderCacheFor } from './NodeGalleryCanvas';

describe('galleryGraphRenderCacheFor', () => {
  it('does not reuse gallery frames across a render-asset fallback', () => {
    const before = galleryGraphRenderCacheFor('session');
    markRenderAssetFallback();
    const after = galleryGraphRenderCacheFor('session');

    expect(after.namespace).not.toBe(before.namespace);
  });
});

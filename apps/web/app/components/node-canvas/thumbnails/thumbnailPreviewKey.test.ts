import { describe, expect, it, vi } from 'vitest';

vi.mock('@xyflow/react', () => ({ useStore: vi.fn() }));

import { getNodePreviewSize, nodePreviewRenderBucket } from './previewSizing';
import { thumbnailPreviewKey } from './useNodeThumbnailRender';

describe('thumbnailPreviewKey', () => {
  it('separates frames of the same content rendered at different buckets', () => {
    const small = getNodePreviewSize('1:1', undefined, undefined, nodePreviewRenderBucket(60));
    const large = getNodePreviewSize('1:1', undefined, undefined, nodePreviewRenderBucket(600));

    expect(thumbnailPreviewKey('layer-a::sig', small)).not.toBe(thumbnailPreviewKey('layer-a::sig', large));
  });

  it('is stable for the same content and bucket', () => {
    const size = getNodePreviewSize('4:5', undefined, undefined, 320);

    expect(thumbnailPreviewKey('layer-a::sig', size)).toBe(thumbnailPreviewKey('layer-a::sig', { ...size }));
    expect(thumbnailPreviewKey('layer-a::sig', size)).toContain(`render:${size.render.width}x${size.render.height}`);
  });

  it('changes with content at the same bucket', () => {
    const size = getNodePreviewSize('1:1', undefined, undefined, 320);

    expect(thumbnailPreviewKey('layer-a::sig-1', size)).not.toBe(thumbnailPreviewKey('layer-a::sig-2', size));
  });
});

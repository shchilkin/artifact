import { describe, expect, it, vi } from 'vitest';
import { fillOnly } from '../test-fixtures/render/fixtures';
import type { CanvasDocument } from '../types/config';
import { generateThumbnail, PROJECT_THUMBNAIL_MIN_EDGE, projectThumbnailDimensions } from './generateThumbnail';
import { markRenderAssetFallback } from './renderAssetEpoch';
import { renderDocument } from './renderer';

vi.mock('./renderer', () => ({
  renderDocument: vi.fn(async () => ({ toDataURL: () => 'data:image/webp;base64,THUMB' })),
}));

describe('project thumbnail dimensions', () => {
  it('renders square project thumbnails at the retina gallery size', () => {
    expect(projectThumbnailDimensions(fillOnly)).toMatchObject({
      aspect: '1:1',
      width: PROJECT_THUMBNAIL_MIN_EDGE,
      height: PROJECT_THUMBNAIL_MIN_EDGE,
    });
  });

  it('preserves wide document aspect ratio while keeping the short edge retina-safe', () => {
    const wide: CanvasDocument = {
      ...fillOnly,
      global: {
        ...fillOnly.global,
        aspect: '16:9',
      },
    };

    expect(projectThumbnailDimensions(wide)).toMatchObject({
      aspect: '16:9',
      width: 1920,
      height: PROJECT_THUMBNAIL_MIN_EDGE,
    });
  });

  it('preserves tall document aspect ratio while keeping the short edge retina-safe', () => {
    const tall: CanvasDocument = {
      ...fillOnly,
      global: {
        ...fillOnly.global,
        aspect: '9:16',
      },
    };

    expect(projectThumbnailDimensions(tall)).toMatchObject({
      aspect: '9:16',
      width: PROJECT_THUMBNAIL_MIN_EDGE,
      height: 1920,
    });
  });
});

describe('generateThumbnail cache', () => {
  it('re-renders an unchanged document after a render-asset fallback', async () => {
    const doc: CanvasDocument = { ...fillOnly, global: { ...fillOnly.global, seed: 4242 } };
    const render = vi.mocked(renderDocument);
    render.mockClear();

    await generateThumbnail(doc, new Map());
    await generateThumbnail(doc, new Map());
    expect(render).toHaveBeenCalledTimes(1);

    markRenderAssetFallback();
    await generateThumbnail(doc, new Map());
    expect(render).toHaveBeenCalledTimes(2);
  });
});

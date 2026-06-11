import { describe, expect, it } from 'vitest';
import { fillOnly } from '../test-fixtures/render/fixtures';
import type { CanvasDocument } from '../types/config';
import { PROJECT_THUMBNAIL_MIN_EDGE, projectThumbnailDimensions } from './generateThumbnail';

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

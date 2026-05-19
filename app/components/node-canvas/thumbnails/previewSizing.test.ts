import { describe, expect, it } from 'vitest';

import { THUMB_SIZE } from '../constants';
import {
  getNodePreviewSize,
  NODE_PREVIEW_PASSIVE_RENDER_SCALE,
  NODE_PREVIEW_RENDER_MAX,
  NODE_PREVIEW_RENDER_SCALE,
} from './previewSizing';

describe('getNodePreviewSize', () => {
  it.each([
    ['1:1', THUMB_SIZE, THUMB_SIZE],
    ['4:5', Math.round(THUMB_SIZE * 0.8), THUMB_SIZE],
    ['9:16', Math.round(THUMB_SIZE * (9 / 16)), THUMB_SIZE],
    ['16:9', THUMB_SIZE, Math.round(THUMB_SIZE * (9 / 16))],
  ] as const)('fits %s into the display frame', (aspect, width, height) => {
    expect(getNodePreviewSize(aspect).display).toEqual({ width, height });
  });

  it('renders above display resolution for WYSIWYG previews', () => {
    const size = getNodePreviewSize('1:1');

    expect(size.render.width).toBeGreaterThan(size.display.width);
    expect(size.render.height).toBeGreaterThan(size.display.height);
    expect(size.renderScale).toBeGreaterThanOrEqual(NODE_PREVIEW_RENDER_SCALE);
  });

  it('supports lighter passive preview renders without changing display geometry', () => {
    const active = getNodePreviewSize('16:9');
    const passive = getNodePreviewSize('16:9', undefined, NODE_PREVIEW_PASSIVE_RENDER_SCALE);

    expect(passive.display).toEqual(active.display);
    expect(passive.aspect).toEqual(active.aspect);
    expect(passive.render).toEqual(active.render);
    expect(passive.renderScale).toBeGreaterThan(NODE_PREVIEW_PASSIVE_RENDER_SCALE);
  });

  it('preserves aspect ratio for high-DPI render dimensions', () => {
    const wide = getNodePreviewSize('16:9');
    const tall = getNodePreviewSize('9:16');

    expect(wide.render.width).toBeGreaterThan(wide.render.height);
    expect(tall.render.height).toBeGreaterThan(tall.render.width);
    expect(wide.aspect).toEqual({ width: 1920, height: 1080 });
    expect(tall.aspect).toEqual({ width: 1080, height: 1920 });
  });

  it('keeps render dimensions high enough for document-baseline print effects', () => {
    const square = getNodePreviewSize('1:1');
    const wide = getNodePreviewSize('16:9');

    expect(square.render.width).toBeGreaterThanOrEqual(square.aspect.width);
    expect(square.render.height).toBeGreaterThanOrEqual(square.aspect.height);
    expect(Math.max(wide.render.width, wide.render.height)).toBe(NODE_PREVIEW_RENDER_MAX);
  });
});

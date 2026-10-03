import type { AspectRatio } from '../../../types/config';
import { ASPECT_SIZES } from '../../../types/config';
import { THUMB_SIZE } from '../constants';

export const NODE_PREVIEW_RENDER_SCALE = 3;
export const NODE_PREVIEW_PASSIVE_RENDER_SCALE = 1;
export const NODE_PREVIEW_RENDER_MAX = 1280;
/**
 * Longest-side render sizes for graph node thumbnails, in device pixels. A thumbnail renders at the smallest bucket
 * that covers its on-screen size at the current graph zoom, so a zoomed-out graph does not render full-size frames.
 */
export const NODE_PREVIEW_RENDER_BUCKETS = [160, 320, 640, NODE_PREVIEW_RENDER_MAX] as const;
const MAX_DEVICE_PIXEL_RATIO = 2;

/** Longest side of a node thumbnail on screen, in device pixels, at graph zoom `zoom`. */
export function nodePreviewOnScreenPx(zoom: number, devicePixelRatio = 1, maxDisplayDimension = THUMB_SIZE) {
  const ratio = Math.min(MAX_DEVICE_PIXEL_RATIO, Math.max(1, devicePixelRatio || 1));
  return maxDisplayDimension * Math.max(0, zoom) * ratio;
}

/** Smallest render bucket that covers `onScreenPx`, clamped to the largest bucket. */
export function nodePreviewRenderBucket(onScreenPx: number): number {
  return (
    NODE_PREVIEW_RENDER_BUCKETS.find((bucket) => bucket >= onScreenPx) ??
    NODE_PREVIEW_RENDER_BUCKETS[NODE_PREVIEW_RENDER_BUCKETS.length - 1]
  );
}

export interface NodePreviewSize {
  display: { width: number; height: number };
  render: { width: number; height: number };
  aspect: { width: number; height: number };
  renderScale: number;
}

function fitToMax(width: number, height: number, maxDimension: number) {
  const scale = maxDimension / Math.max(width, height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * `renderBucket` (from `nodePreviewRenderBucket`) sets the render size directly for zoom-aware graph thumbnails.
 * Without it, the render size covers the document baseline so print effects match the full-size frame.
 */
export function getNodePreviewSize(
  aspect: AspectRatio = '1:1',
  maxDisplayDimension = THUMB_SIZE,
  renderScale = NODE_PREVIEW_RENDER_SCALE,
  renderBucket?: number,
): NodePreviewSize {
  const [aspectWidth, aspectHeight] = ASPECT_SIZES[aspect] ?? ASPECT_SIZES['1:1'];
  const display = fitToMax(aspectWidth, aspectHeight, maxDisplayDimension);
  const effectBaselineMax = Math.min(NODE_PREVIEW_RENDER_MAX, Math.max(aspectWidth, aspectHeight));
  const renderMax =
    renderBucket === undefined
      ? Math.min(NODE_PREVIEW_RENDER_MAX, Math.max(effectBaselineMax, Math.round(maxDisplayDimension * renderScale)))
      : Math.min(NODE_PREVIEW_RENDER_MAX, Math.max(1, Math.round(renderBucket)));
  const render = fitToMax(aspectWidth, aspectHeight, renderMax);

  return {
    display,
    render,
    aspect: { width: aspectWidth, height: aspectHeight },
    renderScale: render.width / display.width,
  };
}

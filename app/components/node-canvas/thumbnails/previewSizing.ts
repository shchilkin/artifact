import type { AspectRatio } from '../../../types/config';
import { ASPECT_SIZES } from '../../../types/config';
import { THUMB_SIZE } from '../constants';

export const NODE_PREVIEW_RENDER_SCALE = 3;
export const NODE_PREVIEW_PASSIVE_RENDER_SCALE = 1.6;
export const NODE_PREVIEW_RENDER_MAX = 960;

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

export function getNodePreviewSize(
  aspect: AspectRatio = '1:1',
  maxDisplayDimension = THUMB_SIZE,
  renderScale = NODE_PREVIEW_RENDER_SCALE,
): NodePreviewSize {
  const [aspectWidth, aspectHeight] = ASPECT_SIZES[aspect] ?? ASPECT_SIZES['1:1'];
  const display = fitToMax(aspectWidth, aspectHeight, maxDisplayDimension);
  const renderMax = Math.min(NODE_PREVIEW_RENDER_MAX, Math.round(maxDisplayDimension * renderScale));
  const render = fitToMax(aspectWidth, aspectHeight, renderMax);

  return {
    display,
    render,
    aspect: { width: aspectWidth, height: aspectHeight },
    renderScale: render.width / display.width,
  };
}

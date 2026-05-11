import type { MouseEvent as ReactMouseEvent, SyntheticEvent } from 'react';

import type { Layer } from '../../types/config';
import type { GalleryEligibleLayer } from './types';

export function isGalleryEligibleLayer(layer: Layer): layer is GalleryEligibleLayer {
  return layer.kind === 'primitive'
    || layer.kind === 'noise'
    || layer.kind === 'array'
    || layer.kind === 'text'
    || layer.kind === 'image';
}

export function cloneLayerSnapshot<T extends Layer>(layer: T): T {
  if (layer.kind === 'emoji') {
    return { ...layer, emojis: [...layer.emojis] } as T;
  }
  return { ...layer };
}

export function stopNodeEvent(e: SyntheticEvent) {
  e.stopPropagation();
}

export function callAll<E extends SyntheticEvent>(
  ...handlers: Array<((event: E) => void) | undefined>
) {
  return (event: E) => {
    handlers.forEach((handler) => handler?.(event));
  };
}

export function isAdditiveSelectionEvent(event?: ReactMouseEvent) {
  return Boolean(event?.metaKey || event?.ctrlKey || event?.shiftKey);
}

export function distancePointToSegment(
  point: { x: number; y: number },
  start: { x: number; y: number },
  end: { x: number; y: number },
) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)));
  const px = start.x + t * dx;
  const py = start.y + t * dy;
  return Math.hypot(point.x - px, point.y - py);
}

export function clampPopupPosition(
  x: number,
  y: number,
  width: number,
  height: number,
  padding = 8,
) {
  if (typeof window === 'undefined') {
    return { left: x, top: y };
  }
  return {
    left: Math.min(Math.max(padding, x), Math.max(padding, window.innerWidth - width - padding)),
    top: Math.min(Math.max(padding, y), Math.max(padding, window.innerHeight - height - padding)),
  };
}

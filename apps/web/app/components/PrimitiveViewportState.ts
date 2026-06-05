import type { PrimitiveLayer } from '../types/config';

export type PrimitiveRenderMode = 'shaded' | 'unlit' | 'wireframe';

export interface PrimitiveViewportState {
  rotationX: number;
  rotationY: number;
  zoom: number;
  panX: number;
  panY: number;
  locked?: boolean;
}

export function defaultPrimitiveViewportState(layer: PrimitiveLayer): PrimitiveViewportState {
  return {
    rotationX: layer.tiltX,
    rotationY: layer.tiltY,
    zoom: 1,
    panX: 0,
    panY: 0,
    locked: false,
  };
}

export function primitiveViewStateMapsEqual(
  a: Record<string, PrimitiveViewportState>,
  b: Record<string, PrimitiveViewportState>,
) {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) => {
    const left = a[key];
    const right = b[key];
    return (
      right !== undefined &&
      left.rotationX === right.rotationX &&
      left.rotationY === right.rotationY &&
      left.zoom === right.zoom &&
      left.panX === right.panX &&
      left.panY === right.panY &&
      (left.locked ?? false) === (right.locked ?? false)
    );
  });
}

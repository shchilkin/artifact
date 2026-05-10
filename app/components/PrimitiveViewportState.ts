import type { PrimitiveLayer } from '../types/config';

export type PrimitiveRenderMode = 'shaded' | 'unlit' | 'wireframe';

export interface PrimitiveViewportState {
  rotationX: number;
  rotationY: number;
  zoom: number;
  panX: number;
  panY: number;
}

export function defaultPrimitiveViewportState(layer: PrimitiveLayer): PrimitiveViewportState {
  return {
    rotationX: layer.tiltX,
    rotationY: layer.tiltY,
    zoom: 1,
    panX: 0,
    panY: 0,
  };
}

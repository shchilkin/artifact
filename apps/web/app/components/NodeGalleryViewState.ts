export interface MediaViewState {
  zoom: number;
  offsetX: number;
  offsetY: number;
}

export function defaultMediaViewState(): MediaViewState {
  return { zoom: 1, offsetX: 0, offsetY: 0 };
}

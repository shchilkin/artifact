export interface CanvasPreviewRenderState {
  isRendering: boolean;
  hasFrame: boolean;
  error: Error | null;
}

export function resolveCanvasPreviewState(
  renderState: CanvasPreviewRenderState,
  hasLayers: boolean,
  hasSelection: boolean,
) {
  if (renderState.error) return 'error';
  if (renderState.isRendering && !renderState.hasFrame) return 'loading';
  if (!hasLayers) return 'empty';
  if (hasSelection) return 'selected';
  return 'ready';
}

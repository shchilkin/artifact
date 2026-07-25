import type { ImageLayer, TextLayer } from '../types/config';

export type CanvasHandleMode = 'move' | 'scale-se' | 'scale-nw' | 'scale-ne' | 'scale-sw' | 'rotate';

type ArrowKey = 'ArrowDown' | 'ArrowLeft' | 'ArrowRight' | 'ArrowUp';

export function nextKeyboardLayer({
  layer,
  mode,
  key,
  canvasW,
  canvasH,
  accelerated,
  independent,
}: {
  layer: TextLayer | ImageLayer;
  mode: CanvasHandleMode;
  key: string;
  canvasW: number;
  canvasH: number;
  accelerated: boolean;
  independent: boolean;
}): TextLayer | ImageLayer | null {
  if (!isArrowKey(key) || canvasW <= 0 || canvasH <= 0) return null;
  const step = accelerated ? 10 : 1;
  const dx = key === 'ArrowLeft' ? -step / canvasW : key === 'ArrowRight' ? step / canvasW : 0;
  const dy = key === 'ArrowUp' ? -step / canvasH : key === 'ArrowDown' ? step / canvasH : 0;

  if (mode === 'move') return { ...layer, x: layer.x + dx, y: layer.y + dy };
  if (mode === 'rotate') {
    const direction = key === 'ArrowLeft' || key === 'ArrowDown' ? -1 : 1;
    return { ...layer, rotation: layer.rotation + direction * step };
  }
  return scaledLayer(layer, mode, dx, dy, independent);
}

export function scaledLayer(
  orig: TextLayer | ImageLayer,
  mode: CanvasHandleMode,
  dx: number,
  dy: number,
  independent: boolean,
) {
  const xSign = mode.includes('e') ? 1 : -1;
  const ySign = mode.includes('s') ? 1 : -1;
  return independent
    ? independentlyScaledLayer(orig, dx, dy, xSign, ySign)
    : proportionallyScaledLayer(orig, dx, dy, xSign, ySign);
}

function isArrowKey(key: string): key is ArrowKey {
  return key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight' || key === 'ArrowUp';
}

function independentlyScaledLayer(orig: TextLayer | ImageLayer, dx: number, dy: number, xSign: number, ySign: number) {
  return {
    ...orig,
    scaleX: Math.max(0.05, orig.scaleX + dx * 2 * xSign),
    scaleY: Math.max(0.05, orig.scaleY + dy * 2 * ySign),
  };
}

function proportionallyScaledLayer(orig: TextLayer | ImageLayer, dx: number, dy: number, xSign: number, ySign: number) {
  const delta = (dx * xSign + dy * ySign) / Math.SQRT2;
  const newScale = Math.max(0.05, orig.scaleX + delta * 2);
  return { ...orig, scaleX: newScale, scaleY: newScale };
}

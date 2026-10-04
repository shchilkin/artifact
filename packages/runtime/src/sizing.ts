export const DEFAULT_MAX_DEVICE_PIXEL_RATIO = 2;
export const DEFAULT_MAX_RENDER_SIZE = 1080;

export interface RenderSizeInput {
  /** Displayed size in CSS pixels. */
  readonly cssWidth: number;
  readonly cssHeight: number;
  readonly devicePixelRatio: number;
  readonly maxDevicePixelRatio: number;
  /** Upper bound for the longer side of the drawing buffer, in device pixels. */
  readonly maxRenderSize: number;
}

/** The drawing-buffer size: CSS size × capped DPR, scaled down so the longer side fits `maxRenderSize`. */
export function computeRenderSize(input: RenderSizeInput): { width: number; height: number } {
  const dpr = clampPositive(Math.min(input.devicePixelRatio, input.maxDevicePixelRatio), 1);
  const width = clampPositive(input.cssWidth, 1) * dpr;
  const height = clampPositive(input.cssHeight, 1) * dpr;
  const scale = Math.min(1, clampPositive(input.maxRenderSize, Infinity) / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function clampPositive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

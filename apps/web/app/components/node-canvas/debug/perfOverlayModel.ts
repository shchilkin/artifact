export interface OverlayPosition {
  x: number;
  y: number;
}

export const PERF_OVERLAY_DEFAULT_POSITION: OverlayPosition = { x: 12, y: 132 };

export function parsePerfOverlayPosition(stored: string | null): OverlayPosition {
  if (!stored) return PERF_OVERLAY_DEFAULT_POSITION;
  return coercePerfOverlayPosition(JSON.parse(stored));
}

function coercePerfOverlayPosition(value: unknown): OverlayPosition {
  if (!isPerfOverlayPosition(value)) return PERF_OVERLAY_DEFAULT_POSITION;
  return { x: value.x, y: value.y };
}

function isPerfOverlayPosition(value: unknown): value is OverlayPosition {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Partial<OverlayPosition>).x === 'number' &&
    typeof (value as Partial<OverlayPosition>).y === 'number'
  );
}

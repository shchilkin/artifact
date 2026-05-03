import { useRef, useCallback } from 'react';

interface Props {
  /** 0–1 fraction of container width */
  x: number;
  /** 0–1 fraction of container height */
  y: number;
  /** Badge width as fraction of container width */
  size?: number;
  onMove?: (x: number, y: number) => void;
  /** If true, pointer events are disabled (used during export baking) */
  inert?: boolean;
}

/** Badge aspect ratio from public/Parental_Advisory_label.svg: 265 × 166 */
const BADGE_ASPECT = 166 / 265;

export function ParentalAdvisoryBadge({ x, y, size = 0.3, onMove, inert = false }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const startPointer = useRef({ px: 0, py: 0 });
  const startPos = useRef({ x: 0, y: 0 });

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (inert || !onMove) return;
    e.preventDefault();
    e.stopPropagation();
    dragging.current = true;
    startPointer.current = { px: e.clientX, py: e.clientY };
    startPos.current = { x, y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [inert, onMove, x, y]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current || !onMove) return;
    const parent = containerRef.current?.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    const dx = (e.clientX - startPointer.current.px) / rect.width;
    const dy = (e.clientY - startPointer.current.py) / rect.height;
    const nx = Math.max(0, Math.min(1 - size, startPos.current.x + dx));
    const ny = Math.max(0, Math.min(1 - size * BADGE_ASPECT, startPos.current.y + dy));
    onMove(nx, ny);
  }, [onMove, size]);

  const onPointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  return (
    <div
      ref={containerRef}
      className="pa-badge"
      style={{
        position: 'absolute',
        left: `${x * 100}%`,
        top: `${y * 100}%`,
        width: `${size * 100}%`,
        cursor: inert ? 'default' : 'grab',
        userSelect: 'none',
        touchAction: 'none',
        pointerEvents: inert ? 'none' : 'auto',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <img
        src="/Parental_Advisory_label.svg"
        alt="Parental Advisory Explicit Content"
        width="100%"
        style={{ display: 'block', pointerEvents: 'none' }}
        draggable={false}
      />
    </div>
  );
}

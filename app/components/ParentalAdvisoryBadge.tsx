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

/** Height / width = 1 / 1.6 */
const BADGE_ASPECT = 1 / 1.6;

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
        pointerEvents: inert ? 'none' : 'auto',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      aria-label="Parental Advisory Explicit Content"
      role="img"
    >
      <div className="pa-label">
        <div className="pa-inner">
          {/* Row 1: black bg, "PARENTAL" in white */}
          <div className="pa-row pa-row--top">
            <span className="pa-text pa-text--parental">PARENTAL</span>
          </div>
          {/* Row 2: white bg, "ADVISORY" massive */}
          <div className="pa-row pa-row--middle">
            <span className="pa-text pa-text--advisory">ADVISORY</span>
          </div>
          {/* Row 3: black bg, "EXPLICIT CONTENT" in white */}
          <div className="pa-row pa-row--bottom">
            <span className="pa-text pa-text--explicit">EXPLICIT CONTENT</span>
          </div>
        </div>
      </div>
    </div>
  );
}



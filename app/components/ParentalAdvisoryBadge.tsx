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

/** Canonical badge aspect ratio: 340 × 104 */
const BADGE_ASPECT = 104 / 340;

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
      <svg
        viewBox="0 0 340 104"
        xmlns="http://www.w3.org/2000/svg"
        width="100%"
        style={{ display: 'block' }}
        aria-label="Parental Advisory Explicit Content"
      >
        {/* Outer black border */}
        <rect x="0" y="0" width="340" height="104" fill="black" />
        {/* White inner fill */}
        <rect x="3" y="3" width="334" height="98" fill="white" />
        {/* Black inner border */}
        <rect x="3" y="3" width="334" height="98" fill="none" stroke="black" strokeWidth="2" />

        {/* Divider line */}
        <line x1="3" y1="54" x2="337" y2="54" stroke="black" strokeWidth="2" />

        {/* Top text: PARENTAL ADVISORY */}
        <text
          x="170"
          y="43"
          textAnchor="middle"
          fontFamily="Arial Black, Arial, sans-serif"
          fontWeight="900"
          fontSize="22"
          fill="black"
          letterSpacing="1"
        >
          PARENTAL ADVISORY
        </text>

        {/* Bottom text: EXPLICIT CONTENT */}
        <text
          x="170"
          y="88"
          textAnchor="middle"
          fontFamily="Arial Black, Arial, sans-serif"
          fontWeight="900"
          fontSize="22"
          fill="black"
          letterSpacing="1"
        >
          EXPLICIT CONTENT
        </text>
      </svg>
    </div>
  );
}

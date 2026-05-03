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

/** Badge aspect ratio: viewBox 500 × 330 */
const BADGE_ASPECT = 330 / 500;

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
      {/* viewBox 500×330: outer black → white gap → inner border → 3 bands */}
      <svg
        viewBox="0 0 500 330"
        xmlns="http://www.w3.org/2000/svg"
        width="100%"
        style={{ display: 'block' }}
        aria-label="Parental Advisory Explicit Content"
      >
        {/* Outer thick black border */}
        <rect width="500" height="330" fill="black" />
        {/* White inner fill */}
        <rect x="9" y="9" width="482" height="312" fill="white" />
        {/* Inner thin black border */}
        <rect x="14" y="14" width="472" height="302" fill="none" stroke="black" strokeWidth="3" />
        {/* Top black band */}
        <rect x="14" y="14" width="472" height="56" fill="black" />
        {/* Bottom black band */}
        <rect x="14" y="260" width="472" height="56" fill="black" />

        {/* PARENTAL – white on black */}
        <text
          x="250" y="42"
          textAnchor="middle"
          dominantBaseline="middle"
          fontFamily="Impact, 'Arial Narrow', Arial, sans-serif"
          fontSize="36"
          fill="white"
          letterSpacing="8"
        >PARENTAL</text>

        {/* ADVISORY – giant black on white, stretched to fill width */}
        <text
          x="250" y="165"
          textAnchor="middle"
          dominantBaseline="central"
          fontFamily="Impact, 'Arial Narrow', Arial, sans-serif"
          fontSize="155"
          fill="black"
          textLength="458"
          lengthAdjust="spacingAndGlyphs"
        >ADVISORY</text>

        {/* EXPLICIT CONTENT – white on black */}
        <text
          x="250" y="288"
          textAnchor="middle"
          dominantBaseline="middle"
          fontFamily="Impact, 'Arial Narrow', Arial, sans-serif"
          fontSize="28"
          fill="white"
          letterSpacing="5"
        >EXPLICIT CONTENT</text>
      </svg>
    </div>
  );
}


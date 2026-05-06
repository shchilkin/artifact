import { useCallback, useMemo, useRef } from 'react';
import type { ImageLayer, TextLayer } from '../types/config';

interface Props {
  layer: TextLayer | ImageLayer;
  canvasSize: number;
  imageCache: Map<string, HTMLImageElement>;
  onChange: (updatedLayer: TextLayer | ImageLayer) => void;
}

type DragMode = 'move' | 'scale-se' | 'scale-nw' | 'scale-ne' | 'scale-sw' | 'rotate';

export function CanvasHandles({ layer, canvasSize, imageCache, onChange }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);

  const { hw, hh } = useMemo(() => {
    if (layer.kind === 'image') {
      const img = imageCache.get(layer.src);
      if (img?.naturalWidth) {
        const baseScale = canvasSize / 540;
        return {
          hw: (img.naturalWidth * baseScale * layer.scaleX) / 2,
          hh: (img.naturalHeight * baseScale * layer.scaleY) / 2,
        };
      }
      return { hw: canvasSize * 0.18, hh: canvasSize * 0.18 };
    }

    const fontSize = layer.size * (canvasSize / 540);
    const longestLine = Math.max(...layer.content.split('\n').map((line) => line.length), 4);
    return {
      hw: Math.max(36, Math.min(canvasSize * 0.42, longestLine * fontSize * 0.28 * layer.scaleX)),
      hh: Math.max(18, fontSize * 0.7 * Math.max(layer.scaleY, 0.6)),
    };
  }, [canvasSize, imageCache, layer]);

  const cx = layer.x * canvasSize;
  const cy = layer.y * canvasSize;
  const rot = (layer.rotation * Math.PI) / 180;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const rotHandleOffset = 24;
  const rotHx = cx + (-hh - rotHandleOffset) * (-sin);
  const rotHy = cy + (-hh - rotHandleOffset) * cos;

  const startDrag = useCallback((e: React.PointerEvent, mode: DragMode) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const startX = e.clientX;
    const startY = e.clientY;
    const orig = { ...layer };

    function onMove(me: PointerEvent) {
      const dx = (me.clientX - startX) / canvasSize;
      const dy = (me.clientY - startY) / canvasSize;

      if (mode === 'move') {
        onChange({
          ...orig,
          x: orig.x + dx,
          y: orig.y + dy,
        } as typeof layer);
        return;
      }

      if (mode === 'rotate') {
        const rect = svgRef.current?.getBoundingClientRect();
        if (!rect) return;
        const angle = Math.atan2(me.clientY - (rect.top + cy), me.clientX - (rect.left + cx));
        onChange({ ...orig, rotation: (angle * 180) / Math.PI + 90 } as typeof layer);
        return;
      }

      // Scale — linked (proportional) by default; hold Shift for independent X/Y
      const xSign = mode.includes('e') ? 1 : -1;
      const ySign = mode.includes('s') ? 1 : -1;
      if (me.shiftKey) {
        onChange({
          ...orig,
          scaleX: Math.max(0.05, orig.scaleX + dx * 2 * xSign),
          scaleY: Math.max(0.05, orig.scaleY + dy * 2 * ySign),
        } as typeof layer);
      } else {
        const delta = (dx * xSign + dy * ySign) / Math.SQRT2;
        const newScale = Math.max(0.05, orig.scaleX + delta * 2);
        onChange({ ...orig, scaleX: newScale, scaleY: newScale } as typeof layer);
      }
    }

    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [canvasSize, cx, cy, layer, onChange]);

  return (
    <svg
      ref={svgRef}
      overflow="visible"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}
      viewBox={`0 0 ${canvasSize} ${canvasSize}`}
    >
      <rect
        x={cx - hw}
        y={cy - hh}
        width={hw * 2}
        height={hh * 2}
        fill="transparent"
        stroke="white"
        strokeWidth="1"
        strokeDasharray="4 3"
        transform={`rotate(${layer.rotation} ${cx} ${cy})`}
        style={{ pointerEvents: 'all', cursor: 'move' }}
        onPointerDown={(e) => startDrag(e, 'move')}
      />
      {[
        [-hw, -hh, 'nw'],
        [hw, -hh, 'ne'],
        [hw, hh, 'se'],
        [-hw, hh, 'sw'],
      ].map(([dx, dy, corner]) => {
        const hx = cx + (Number(dx) * cos - Number(dy) * sin);
        const hy = cy + (Number(dx) * sin + Number(dy) * cos);
        return (
          <circle
            key={corner as string}
            cx={hx}
            cy={hy}
            r={5}
            fill="white"
            stroke="#333"
            strokeWidth="1"
            style={{ pointerEvents: 'all', cursor: `${corner}-resize` }}
            onPointerDown={(e) => startDrag(e, `scale-${corner}` as DragMode)}
          />
        );
      })}
      <line x1={cx} y1={cy - hh} x2={rotHx} y2={rotHy} stroke="white" strokeWidth="1" strokeDasharray="3 2" />
      <circle
        cx={rotHx}
        cy={rotHy}
        r={5}
        fill="#fff"
        stroke="#333"
        strokeWidth="1"
        style={{ pointerEvents: 'all', cursor: 'crosshair' }}
        onPointerDown={(e) => startDrag(e, 'rotate')}
      />
    </svg>
  );
}

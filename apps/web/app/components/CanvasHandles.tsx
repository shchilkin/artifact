import { type KeyboardEvent as ReactKeyboardEvent, useCallback, useMemo, useRef } from 'react';
import type { ImageLayer, TextLayer } from '../types/config';
import { type CanvasHandleMode, nextKeyboardLayer, scaledLayer } from './canvasHandleTransforms';

interface Props {
  layer: TextLayer | ImageLayer;
  canvasW: number;
  canvasH: number;
  imageCache: Map<string, HTMLImageElement>;
  onChange: (updatedLayer: TextLayer | ImageLayer) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

const CANVAS_HANDLE_KEY_SHORTCUTS = 'ArrowLeft ArrowRight ArrowUp ArrowDown';

export function CanvasHandles({ layer, canvasW, canvasH, imageCache, onChange, onDragStart, onDragEnd }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);

  const { hw, hh } = useMemo(() => {
    if (layer.kind === 'image') {
      const img = imageCache.get(layer.src);
      if (img?.naturalWidth) {
        const baseScale = canvasW / 540;
        return {
          hw: (img.naturalWidth * baseScale * layer.scaleX) / 2,
          hh: (img.naturalHeight * baseScale * layer.scaleY) / 2,
        };
      }
      return { hw: canvasW * 0.18, hh: canvasW * 0.18 };
    }

    const fontSize = layer.size * (canvasW / 540);
    const longestLine = Math.max(...layer.content.split('\n').map((line) => line.length), 4);
    return {
      hw: Math.max(36, Math.min(canvasW * 0.42, longestLine * fontSize * 0.28 * layer.scaleX)),
      hh: Math.max(18, fontSize * 0.7 * Math.max(layer.scaleY, 0.6)),
    };
  }, [canvasW, imageCache, layer]);

  const cx = layer.x * canvasW;
  const cy = layer.y * canvasH;
  const rot = (layer.rotation * Math.PI) / 180;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const rotHandleOffset = 24;
  const rotHx = cx + (-hh - rotHandleOffset) * -sin;
  const rotHy = cy + (-hh - rotHandleOffset) * cos;

  const startDrag = useCallback(
    (e: React.PointerEvent, mode: CanvasHandleMode) => {
      e.preventDefault();
      e.stopPropagation();
      (e.target as Element).setPointerCapture?.(e.pointerId);
      const startX = e.clientX;
      const startY = e.clientY;
      const orig = { ...layer };
      onDragStart?.();

      function onMove(me: PointerEvent) {
        const dx = (me.clientX - startX) / canvasW;
        const dy = (me.clientY - startY) / canvasH;
        const next = nextDraggedLayer({
          event: me,
          mode,
          orig,
          dx,
          dy,
          center: { x: cx, y: cy },
          rect: svgRef.current?.getBoundingClientRect(),
        });
        if (next) onChange(next as typeof layer);
      }

      function onUp() {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        onDragEnd?.();
      }

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [canvasW, canvasH, cx, cy, layer, onChange, onDragStart, onDragEnd],
  );

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<SVGElement>, mode: CanvasHandleMode) => {
      const next = nextKeyboardLayer({
        layer,
        mode,
        key: event.key,
        canvasW,
        canvasH,
        accelerated: event.shiftKey,
        independent: event.altKey,
      });
      if (!next) return;
      event.preventDefault();
      event.stopPropagation();
      onDragStart?.();
      onChange(next as typeof layer);
      onDragEnd?.();
    },
    [canvasH, canvasW, layer, onChange, onDragEnd, onDragStart],
  );

  return (
    <svg
      ref={svgRef}
      aria-label={`${layer.name} direct manipulation controls`}
      className="canvas-selection-chrome"
      data-layer-lock={layer.locked ? 'locked' : 'unlocked'}
      data-layer-visibility={layer.visible ? 'visible' : 'hidden'}
      overflow="visible"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        overflow: 'visible',
      }}
      viewBox={`0 0 ${canvasW} ${canvasH}`}
    >
      <rect
        x={cx - hw}
        y={cy - hh}
        width={hw * 2}
        height={hh * 2}
        className="canvas-selection-chrome__outline"
        fill="transparent"
        strokeWidth="1"
        strokeDasharray="4 3"
        transform={`rotate(${layer.rotation} ${cx} ${cy})`}
        style={{ pointerEvents: 'all', cursor: 'move' }}
        role="button"
        tabIndex={0}
        aria-keyshortcuts={CANVAS_HANDLE_KEY_SHORTCUTS}
        aria-label={`Move ${layer.name}. Use arrow keys; hold Shift for larger steps.`}
        onPointerDown={(e) => startDrag(e, 'move')}
        onKeyDown={(event) => handleKeyDown(event, 'move')}
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
            className="canvas-selection-chrome__handle"
            data-canvas-handle={corner}
            strokeWidth="1"
            style={{ pointerEvents: 'all', cursor: `${corner}-resize` }}
            role="button"
            tabIndex={0}
            aria-keyshortcuts={CANVAS_HANDLE_KEY_SHORTCUTS}
            aria-label={`Scale ${layer.name} from ${corner} corner. Use arrow keys; hold Shift for larger steps or Alt for one axis.`}
            onPointerDown={(e) => startDrag(e, `scale-${corner}` as CanvasHandleMode)}
            onKeyDown={(event) => handleKeyDown(event, `scale-${corner}` as CanvasHandleMode)}
          />
        );
      })}
      <line
        x1={cx}
        y1={cy - hh}
        x2={rotHx}
        y2={rotHy}
        className="canvas-selection-chrome__rotation-line"
        strokeWidth="1"
        strokeDasharray="3 2"
        aria-hidden="true"
      />
      <circle
        cx={rotHx}
        cy={rotHy}
        r={5}
        className="canvas-selection-chrome__handle canvas-selection-chrome__handle--rotation"
        data-canvas-handle="rotation"
        strokeWidth="1"
        style={{ pointerEvents: 'all', cursor: 'crosshair' }}
        role="button"
        tabIndex={0}
        aria-keyshortcuts={CANVAS_HANDLE_KEY_SHORTCUTS}
        aria-label={`Rotate ${layer.name}. Use arrow keys; hold Shift for larger steps.`}
        onPointerDown={(e) => startDrag(e, 'rotate')}
        onKeyDown={(event) => handleKeyDown(event, 'rotate')}
      />
    </svg>
  );
}

function nextDraggedLayer({
  event,
  mode,
  orig,
  dx,
  dy,
  center,
  rect,
}: {
  event: PointerEvent;
  mode: CanvasHandleMode;
  orig: TextLayer | ImageLayer;
  dx: number;
  dy: number;
  center: { x: number; y: number };
  rect?: DOMRect;
}): TextLayer | ImageLayer | null {
  if (mode === 'move') return { ...orig, x: orig.x + dx, y: orig.y + dy };
  if (mode === 'rotate') return rect ? rotatedLayer(event, orig, center, rect) : null;
  return scaledLayer(orig, mode, dx, dy, event.shiftKey);
}

function rotatedLayer(
  event: PointerEvent,
  orig: TextLayer | ImageLayer,
  center: { x: number; y: number },
  rect: DOMRect,
) {
  const angle = Math.atan2(event.clientY - (rect.top + center.y), event.clientX - (rect.left + center.x));
  return { ...orig, rotation: (angle * 180) / Math.PI + 90 };
}

import type { GeneratorConfig } from '../types/config';
import { usePixiRenderer } from '../hooks/usePixiRenderer';
import { ParentalAdvisoryBadge } from './ParentalAdvisoryBadge';

interface Props {
  cfg: GeneratorConfig;
  seed: number;
  bgImage: HTMLImageElement | null;
  dragOver?: boolean;
  onCfgChange?: (cfg: GeneratorConfig) => void;
}

export function CanvasPreview({ cfg, seed, bgImage, dragOver, onCfgChange }: Props) {
  const containerRef = usePixiRenderer(cfg, seed, bgImage);

  return (
    <div className="canvas-wrapper flex-1 flex items-center justify-center min-h-0 w-full">
      <div className="canvas-area relative aspect-square h-full max-h-[min(100%,540px)] max-w-full flex items-center justify-center">
        <div ref={containerRef} className="pixi-container flex items-center justify-center w-full h-full" />
        {cfg.parentalAdvisory && (
          <div className="absolute inset-0 pointer-events-none [&_.pa-badge]:pointer-events-auto" aria-hidden="true">
            <ParentalAdvisoryBadge
              x={cfg.advisoryX}
              y={cfg.advisoryY}
              bordered={cfg.advisoryBorder}
              onMove={onCfgChange
                ? (nx, ny) => onCfgChange({ ...cfg, advisoryX: nx, advisoryY: ny })
                : undefined
              }
            />
          </div>
        )}
        {dragOver && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70 border-2 border-dashed border-accent pointer-events-none z-10">
            <span className="font-mono text-accent text-xs tracking-[4px] uppercase">Drop Image</span>
          </div>
        )}
      </div>
    </div>
  );
}

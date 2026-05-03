import type { GeneratorConfig } from '../types/config';
import { usePixiRenderer } from '../hooks/usePixiRenderer';
import { ParentalAdvisoryBadge } from './ParentalAdvisoryBadge';

interface Props {
  cfg: GeneratorConfig;
  seed: number;
  onCfgChange?: (cfg: GeneratorConfig) => void;
}

export function CanvasPreview({ cfg, seed, onCfgChange }: Props) {
  const containerRef = usePixiRenderer(cfg, seed);

  return (
    <div className="canvas-wrapper">
      <div className="canvas-area">
        <div ref={containerRef} className="pixi-container" />
        {cfg.parentalAdvisory && (
          <div className="pa-overlay" aria-hidden="true">
            <ParentalAdvisoryBadge
              x={cfg.advisoryX}
              y={cfg.advisoryY}
              onMove={onCfgChange
                ? (nx, ny) => onCfgChange({ ...cfg, advisoryX: nx, advisoryY: ny })
                : undefined
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}

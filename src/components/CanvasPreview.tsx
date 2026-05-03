import type { GeneratorConfig } from '../types/config';
import { usePixiRenderer } from '../hooks/usePixiRenderer';

interface Props {
  cfg: GeneratorConfig;
  seed: number;
}

export function CanvasPreview({ cfg, seed }: Props) {
  const containerRef = usePixiRenderer(cfg, seed);
  return (
    <div className="canvas-wrapper">
      <div ref={containerRef} className="pixi-container" />
    </div>
  );
}

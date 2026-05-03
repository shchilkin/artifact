import { useEffect } from 'react';
import { useRenderer } from '../hooks/useRenderer';
import type { GeneratorConfig } from '../types/config';

interface Props {
  cfg: GeneratorConfig;
  seed: number;
}

export function CanvasPreview({ cfg, seed }: Props) {
  const { canvasRef } = useRenderer(cfg, seed);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = 540;
    canvas.height = 540;
  }, [canvasRef]);

  return (
    <div className="canvas-wrapper">
      <canvas ref={canvasRef} width={540} height={540} />
    </div>
  );
}

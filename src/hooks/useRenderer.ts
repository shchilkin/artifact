import { useRef, useEffect, useCallback } from 'react';
import type { GeneratorConfig } from '../types/config';
import { render } from '../utils/renderer';

export function useRenderer(cfg: GeneratorConfig, seed: number) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    render(ctx, canvas.width, canvas.height, cfg, seed);
  }, [cfg, seed]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  return { canvasRef, redraw };
}

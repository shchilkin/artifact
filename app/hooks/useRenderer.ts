import { useEffect, useRef } from 'react';
import type { GeneratorConfig } from '../types/config';
import { migrateFromV1 } from '../types/config';
import { renderDocument } from '../utils/renderer';

export function useRenderer(cfg: GeneratorConfig, seed: number) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const doc = migrateFromV1(seed, cfg);
    renderDocument(doc, canvas.width, canvas.height, new Map()).then((result) => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(result, 0, 0);
    });
  }, [cfg, seed]);

  return { canvasRef };
}

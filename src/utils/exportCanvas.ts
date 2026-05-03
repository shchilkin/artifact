import type { GeneratorConfig } from '../types/config';
import { render } from './renderer';

export async function exportCanvas(
  cfg: GeneratorConfig,
  seed: number,
  resolution: 1500 | 2000 | 3000
): Promise<void> {
  const canvas = document.createElement('canvas');
  canvas.width = resolution;
  canvas.height = resolution;
  const ctx = canvas.getContext('2d')!;

  await new Promise<void>((resolve) => {
    setTimeout(() => {
      render(ctx, resolution, resolution, cfg, seed);
      resolve();
    }, 0);
  });

  const dataUrl = canvas.toDataURL('image/png', 1.0);
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `cover-${seed}-${resolution}.png`;
  a.click();
}

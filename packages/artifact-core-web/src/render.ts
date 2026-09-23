import type { WebSession } from '../generated/artifact_wasm';
import { EffectClient } from './workers/effectClient';

type Layer = Record<string, unknown>;
type Plan = {
  width: number;
  height: number;
  seed: number;
  background: string;
  layers: Layer[];
  fontAssets: { id: string; dataUrl: string }[] | null;
};
const n = (layer: Layer, key: string, fallback = 0) =>
  typeof layer[key] === 'number' ? (layer[key] as number) : fallback;
const s = (layer: Layer, key: string, fallback = '') =>
  typeof layer[key] === 'string' ? (layer[key] as string) : fallback;

/** A transient raster surface; never stored inside an Artifact document. */
export async function renderProject(session: WebSession, size = 1000, signal?: AbortSignal) {
  const plan: Plan = JSON.parse(session.render_plan_json(size, size));
  return renderPlan(plan, signal);
}

export async function renderPlan(plan: Plan, signal?: AbortSignal): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = plan.width;
  canvas.height = plan.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas is unavailable');
  const fonts = new Map<string, string>();
  const loaded: FontFace[] = [];
  const effects = new EffectClient(signal);
  try {
    for (const asset of plan.fontAssets ?? []) {
      if (!asset.dataUrl.startsWith('data:font/')) throw new Error('Rendering requires an embedded font');
      const family = `Pilot-${asset.id}`;
      const font = await new FontFace(family, `url("${asset.dataUrl}")`).load();
      document.fonts.add(font);
      loaded.push(font);
      fonts.set(`artifact-font://${asset.id}`, family);
    }
    if (plan.background !== 'transparent') {
      ctx.fillStyle = plan.background;
      ctx.fillRect(0, 0, plan.width, plan.height);
    }
    for (const layer of plan.layers) {
      signal?.throwIfAborted();
      if (layer.visible === false) continue;
      ctx.save();
      try {
        ctx.globalAlpha = n(layer, 'opacity', 100) / 100;
        switch (layer.kind) {
          case 'fill':
            ctx.fillStyle = s(layer, 'color');
            ctx.fillRect(0, 0, plan.width, plan.height);
            break;
          case 'effect': {
            const pixels = ctx.getImageData(0, 0, plan.width, plan.height);
            const out = await effects.run({
              pixels: new Uint8Array(pixels.data.buffer),
              width: plan.width,
              height: plan.height,
              layerJSON: JSON.stringify(layer),
              seed: plan.seed,
            });
            signal?.throwIfAborted();
            // The input buffer was transferred; publish only the worker-owned result.
            ctx.putImageData(new ImageData(new Uint8ClampedArray(out.buffer), plan.width, plan.height), 0, 0);
            break;
          }
          case 'emoji':
            for (const item of layer.renderItems as Layer[]) {
              ctx.save();
              ctx.translate(n(item, 'x'), n(item, 'y'));
              ctx.rotate(n(item, 'rotation'));
              ctx.font = `${n(item, 'size')}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", serif`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillStyle = 'white';
              ctx.globalAlpha = n(item, 'opacity');
              ctx.fillText(s(item, 'emoji'), 0, 0);
              ctx.restore();
            }
            break;
          case 'image': {
            const src = s(layer, 'src');
            if (!src.startsWith('data:image/')) throw new Error('Rendering requires embedded images');
            const image = new Image();
            image.src = src;
            await image.decode();
            signal?.throwIfAborted();
            const fit = s(layer, 'fit');
            const x = plan.width / image.naturalWidth;
            const y = plan.height / image.naturalHeight;
            const scale = fit === 'cover' ? Math.max(x, y) : fit === 'contain' ? Math.min(x, y) : plan.width / 540;
            const width = image.naturalWidth * scale * n(layer, 'scaleX', 1);
            const height = image.naturalHeight * scale * n(layer, 'scaleY', 1);
            ctx.translate(plan.width * n(layer, 'x'), plan.height * n(layer, 'y'));
            ctx.rotate((n(layer, 'rotation') * Math.PI) / 180);
            ctx.drawImage(image, -width / 2, -height / 2, width, height);
            break;
          }
          case 'text': {
            const family = fonts.get(s(layer, 'font'));
            if (!family) throw new Error('Embedded text font is missing');
            const size = (n(layer, 'size') * plan.width) / 540;
            const maxWidth = plan.width * 0.92;
            ctx.font = `${size}px "${family}"`;
            const lines: string[] = [];
            for (const paragraph of s(layer, 'content').split('\n')) {
              let line = '';
              for (const word of paragraph.split(/\s+/).filter(Boolean)) {
                const next = line ? `${line} ${word}` : word;
                if (line && ctx.measureText(next).width > maxWidth) {
                  lines.push(line);
                  line = word;
                } else line = next;
              }
              lines.push(line);
            }
            ctx.fillStyle = s(layer, 'color');
            ctx.textAlign = s(layer, 'align', 'center') as CanvasTextAlign;
            ctx.textBaseline = 'middle';
            ctx.translate(plan.width * n(layer, 'x'), plan.height * n(layer, 'y'));
            ctx.rotate((n(layer, 'rotation') * Math.PI) / 180);
            ctx.scale(n(layer, 'scaleX', 1), n(layer, 'scaleY', 1));
            lines.forEach((line, i) => ctx.fillText(line, 0, (i - (lines.length - 1) / 2) * size * 1.25, maxWidth));
            break;
          }
          default:
            throw new Error('Unsupported render layer');
        }
      } finally {
        ctx.restore();
      }
      // Yield between layers so invalidated renders can stop without publishing stale pixels.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    return canvas;
  } finally {
    effects.dispose();
    for (const font of loaded) document.fonts.delete(font);
  }
}

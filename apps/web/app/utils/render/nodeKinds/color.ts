import type { GraphColorNode } from '../../nodeKinds';
import { createCanvas } from '../canvas';
import { type GraphNodeRenderContext, renderSingleInputSource } from './context';

function applyColorNode(source: HTMLCanvasElement, node: GraphColorNode, W: number, H: number): HTMLCanvasElement {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(source, 0, 0);

  const { contrast, brightness, saturation, hue } = node;
  if (contrast === 100 && brightness === 100 && saturation === 100 && hue === 0) return canvas;

  const imageData = ctx.getImageData(0, 0, W, H);
  const d = imageData.data;

  const bF = brightness / 100;
  const cF = contrast / 100;
  const sF = saturation / 100;

  const hRad = (hue * Math.PI) / 180;
  const cos = Math.cos(hRad);
  const sin = Math.sin(hRad);
  const hr00 = 0.213 + cos * 0.787 - sin * 0.213;
  const hr01 = 0.715 - cos * 0.715 - sin * 0.715;
  const hr02 = 0.072 - cos * 0.072 + sin * 0.928;
  const hr10 = 0.213 - cos * 0.213 + sin * 0.143;
  const hr11 = 0.715 + cos * 0.285 + sin * 0.14;
  const hr12 = 0.072 - cos * 0.072 - sin * 0.283;
  const hr20 = 0.213 - cos * 0.213 - sin * 0.787;
  const hr21 = 0.715 - cos * 0.715 + sin * 0.715;
  const hr22 = 0.072 + cos * 0.928 + sin * 0.072;

  const sm00 = 0.213 + 0.787 * sF;
  const sm01 = 0.715 - 0.715 * sF;
  const sm02 = 0.072 - 0.072 * sF;
  const sm10 = 0.213 - 0.213 * sF;
  const sm11 = 0.715 + 0.285 * sF;
  const sm12 = 0.072 - 0.072 * sF;
  const sm20 = 0.213 - 0.213 * sF;
  const sm21 = 0.715 - 0.715 * sF;
  const sm22 = 0.072 + 0.928 * sF;

  const applyHue = hue !== 0;
  const applySat = saturation !== 100;

  for (let i = 0; i < d.length; i += 4) {
    let r = d[i] / 255;
    let g = d[i + 1] / 255;
    let b = d[i + 2] / 255;

    r *= bF;
    g *= bF;
    b *= bF;

    r = (r - 0.5) * cF + 0.5;
    g = (g - 0.5) * cF + 0.5;
    b = (b - 0.5) * cF + 0.5;

    if (applySat) {
      const nr = sm00 * r + sm01 * g + sm02 * b;
      const ng = sm10 * r + sm11 * g + sm12 * b;
      const nb = sm20 * r + sm21 * g + sm22 * b;
      r = nr;
      g = ng;
      b = nb;
    }

    if (applyHue) {
      const nr = hr00 * r + hr01 * g + hr02 * b;
      const ng = hr10 * r + hr11 * g + hr12 * b;
      const nb = hr20 * r + hr21 * g + hr22 * b;
      r = nr;
      g = ng;
      b = nb;
    }

    d[i] = Math.min(255, Math.max(0, Math.round(r * 255)));
    d[i + 1] = Math.min(255, Math.max(0, Math.round(g * 255)));
    d[i + 2] = Math.min(255, Math.max(0, Math.round(b * 255)));
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

export async function renderColorGraphNode(node: GraphColorNode, context: GraphNodeRenderContext) {
  const nodeId = node.id;
  const colorNode = node;
  const source = await renderSingleInputSource(nodeId, context);
  return applyColorNode(source, colorNode, context.W, context.H);
}

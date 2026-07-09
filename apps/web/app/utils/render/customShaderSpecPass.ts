import type { GraphShaderNode } from '../../types/config';
import { normalizeCustomShaderSpec } from '../customShaderSpec';
import { cloneCanvas, createCanvas } from './canvas';

type Rgb = [number, number, number];

export function renderCustomShaderSpecPass(
  backdrop: HTMLCanvasElement,
  node: GraphShaderNode,
  seed: number,
  width: number,
  height: number,
): HTMLCanvasElement {
  const source = cloneCanvas(backdrop, width, height);
  const sourceContext = source.getContext('2d', { willReadFrequently: true })!;
  const sourceImage = sourceContext.getImageData(0, 0, width, height);
  const output = createCanvas(width, height);
  const outputContext = output.getContext('2d', { willReadFrequently: true })!;
  const outputImage = outputContext.createImageData(width, height);
  const spec = normalizeCustomShaderSpec(node.customShaderSpec);
  const palette = (spec.palette ?? node.palette).map(hexToRgb);
  const contrast = clamp(spec.contrast ?? 1, 0.1, 4);
  const proceduralMix = 0.18 + clamp(node.distortion / 100, 0, 1) * 0.34;

  for (let index = 0; index < outputImage.data.length; index += 4) {
    const pixel = index / 4;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    const point = transformedPoint(node, x, y, width, height);
    const radius = Math.hypot(point.x, point.y);
    const angle = Math.atan2(point.y, point.x);
    const sourceRgb = readRgb(sourceImage, index);
    const sourceLuma = rgbLuma(sourceRgb);
    const sourceEdge = sourceEdgeAt(sourceImage, width, height, x, y);
    let color: Rgb = sourceRgb;
    let tone = spec.base ?? 0.46;
    let mapped = false;

    for (const operation of spec.operations) {
      switch (operation.op) {
        case 'noise': {
          const scale = operation.scale / Math.max(0.01, node.scale / 100);
          tone +=
            (fbm(
              point.x * scale,
              point.y * scale,
              seed + node.seedOffset + (operation.seedOffset ?? 0) + 6101,
              operation.octaves ?? 4,
            ) -
              0.5) *
            operation.amount;
          break;
        }
        case 'wave': {
          const direction = (operation.angle * Math.PI) / 180;
          const u = point.x * Math.cos(direction) + point.y * Math.sin(direction);
          tone += Math.sin(u * operation.frequency + (operation.phase ?? 0)) * operation.amplitude;
          break;
        }
        case 'rings': {
          const distance = Math.hypot(point.x - (operation.centerX ?? 0), point.y - (operation.centerY ?? 0));
          tone += Math.sin(distance * operation.frequency) * operation.amount;
          break;
        }
        case 'swirl': {
          const radiusScale = Math.max(0.05, operation.radius ?? 1);
          tone += Math.sin(angle + radius * radiusScale * 8) * operation.amount * smoothstep(1.7, 0.02, radius);
          break;
        }
        case 'threshold':
          tone = smoothstep(
            operation.value - (operation.softness ?? 0.08),
            operation.value + (operation.softness ?? 0.08),
            tone,
          );
          break;
        case 'posterize': {
          const steps = Math.max(2, operation.steps);
          tone = Math.round(clamp(tone, 0, 1) * (steps - 1)) / (steps - 1);
          break;
        }
        case 'invert':
          tone = lerp(tone, 1 - tone, operation.amount);
          break;
        case 'sourceLuma':
          tone = lerp(tone, sourceLuma, operation.amount);
          break;
        case 'edgeGlow': {
          const edge = smoothstep(operation.softness ?? 0.18, 1, sourceEdge);
          tone += edge * operation.amount * 0.5;
          color = addRgb(color, scaleRgb(samplePalette(palette, clamp(tone, 0, 1)), edge * operation.amount * 0.35));
          break;
        }
        case 'chromaticShift': {
          const distance = operation.amount * Math.min(width, height) * 0.028;
          const shiftAngle = ((operation.angle ?? 0) * Math.PI) / 180;
          const shiftX = Math.cos(shiftAngle) * distance;
          const shiftY = Math.sin(shiftAngle) * distance;
          const red = readRgbAt(sourceImage, width, height, x + shiftX, y + shiftY)[0];
          const blue = readRgbAt(sourceImage, width, height, x - shiftX, y - shiftY)[2];
          color = [red, color[1], blue];
          break;
        }
        case 'gradientMap': {
          const mappedColor = samplePalette(palette, correctedTone(tone, contrast));
          color = mixRgb(color, mappedColor, operation.amount);
          mapped = true;
          break;
        }
      }
    }

    const proceduralColor = samplePalette(palette, correctedTone(tone, contrast));
    color = mixRgb(color, proceduralColor, mapped ? proceduralMix * 0.2 : proceduralMix);
    outputImage.data[index] = byte(color[0]);
    outputImage.data[index + 1] = byte(color[1]);
    outputImage.data[index + 2] = byte(color[2]);
    outputImage.data[index + 3] = sourceImage.data[index + 3] ?? 0;
  }

  outputContext.putImageData(outputImage, 0, 0);
  return output;
}

function transformedPoint(node: GraphShaderNode, x: number, y: number, width: number, height: number) {
  const aspect = width / Math.max(1, height);
  const scale = Math.max(0.01, node.scale / 100);
  const px = ((x / Math.max(1, width - 1)) * 2 - 1) * aspect - (node.offsetX / 100) * aspect;
  const py = (y / Math.max(1, height - 1)) * 2 - 1 - node.offsetY / 100;
  const rotation = (-node.rotation * Math.PI) / 180;
  return {
    x: (px * Math.cos(rotation) - py * Math.sin(rotation)) / scale,
    y: (px * Math.sin(rotation) + py * Math.cos(rotation)) / scale,
  };
}

function sourceEdgeAt(image: ImageData, width: number, height: number, x: number, y: number) {
  const horizontal = lumaAt(image, width, height, x + 1, y) - lumaAt(image, width, height, x - 1, y);
  const vertical = lumaAt(image, width, height, x, y + 1) - lumaAt(image, width, height, x, y - 1);
  return clamp((Math.abs(horizontal) + Math.abs(vertical)) * 3, 0, 1);
}

function lumaAt(image: ImageData, width: number, height: number, x: number, y: number) {
  return rgbLuma(readRgbAt(image, width, height, x, y));
}

function readRgbAt(image: ImageData, width: number, height: number, x: number, y: number): Rgb {
  const px = Math.max(0, Math.min(width - 1, Math.round(x)));
  const py = Math.max(0, Math.min(height - 1, Math.round(y)));
  return readRgb(image, (py * width + px) * 4);
}

function readRgb(image: ImageData, index: number): Rgb {
  return [image.data[index] ?? 0, image.data[index + 1] ?? 0, image.data[index + 2] ?? 0];
}

function rgbLuma([red, green, blue]: Rgb) {
  return (red * 0.2126 + green * 0.7152 + blue * 0.0722) / 255;
}

function correctedTone(tone: number, contrast: number) {
  return clamp((tone - 0.5) * contrast + 0.5, 0, 1);
}

function samplePalette(colors: Rgb[], value: number): Rgb {
  if (colors.length === 0) return [255, 255, 255];
  if (colors.length === 1) return colors[0] ?? [255, 255, 255];
  const scaled = clamp(value, 0, 0.9999) * (colors.length - 1);
  const index = Math.floor(scaled);
  return mixRgb(
    colors[index] ?? colors[0]!,
    colors[Math.min(colors.length - 1, index + 1)] ?? colors[0]!,
    scaled - index,
  );
}

function mixRgb(a: Rgb, b: Rgb, amount: number): Rgb {
  const mix = clamp(amount, 0, 1);
  return [lerp(a[0], b[0], mix), lerp(a[1], b[1], mix), lerp(a[2], b[2], mix)];
}

function addRgb(a: Rgb, b: Rgb): Rgb {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function scaleRgb(color: Rgb, amount: number): Rgb {
  return [color[0] * amount, color[1] * amount, color[2] * amount];
}

function hexToRgb(hex: string): Rgb {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  return Number.isFinite(value) ? [(value >> 16) & 255, (value >> 8) & 255, value & 255] : [255, 255, 255];
}

function fbm(x: number, y: number, seed: number, octaves: number) {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let normalization = 0;
  for (let octave = 0; octave < Math.max(1, Math.min(7, octaves)); octave += 1) {
    value += valueNoise(x * frequency, y * frequency, seed + octave * 1013) * amplitude;
    normalization += amplitude;
    frequency *= 2;
    amplitude *= 0.5;
  }
  return normalization > 0 ? value / normalization : 0;
}

function valueNoise(x: number, y: number, seed: number) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smoothstep(0, 1, x - x0);
  const ty = smoothstep(0, 1, y - y0);
  const a = hashNoise(x0, y0, seed);
  const b = hashNoise(x0 + 1, y0, seed);
  const c = hashNoise(x0, y0 + 1, seed);
  const d = hashNoise(x0 + 1, y0 + 1, seed);
  return lerp(lerp(a, b, tx), lerp(c, d, tx), ty);
}

function hashNoise(x: number, y: number, seed: number) {
  let hash = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 1442695041);
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967295;
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const normalized = clamp((value - edge0) / Math.max(0.0001, edge1 - edge0), 0, 1);
  return normalized * normalized * (3 - 2 * normalized);
}

function lerp(a: number, b: number, amount: number) {
  return a + (b - a) * amount;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function byte(value: number) {
  return Math.round(clamp(value, 0, 255));
}

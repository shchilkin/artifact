import type { GraphShaderNode } from '../../types/config';
import { lcg } from '../lcg';
import { normalizeShaderPalette } from '../shaderPalette';
import { createCanvas } from './canvas';
import { renderCustomCodeShaderNodeToCanvas } from './customCodeShader';

type Rgb = [number, number, number];

const RASTER_SHADER_MAX = 640;
const TAU = Math.PI * 2;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = clamp((value - edge0) / Math.max(0.0001, edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function hexToRgb(hex: string): Rgb {
  const normalized = hex.replace('#', '').trim();
  const full = normalized.length === 3 ? normalized.replace(/(.)/g, '$1$1') : normalized;
  const value = Number.parseInt(full, 16);
  if (!Number.isFinite(value)) return [255, 255, 255];
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function rgba(hex: string, alpha: number) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1)})`;
}

function shaderColorStops(node: GraphShaderNode) {
  return normalizeShaderPalette(node.shaderKind, node.palette);
}

function shaderPalette(node: GraphShaderNode): Rgb[] {
  return shaderColorStops(node).map(hexToRgb);
}

function colorStop(colors: readonly string[], index: number) {
  return colors[index % Math.max(1, colors.length)] ?? '#ffffff';
}

function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  const clamped = clamp(t, 0, 1);
  return [
    Math.round(lerp(a[0], b[0], clamped)),
    Math.round(lerp(a[1], b[1], clamped)),
    Math.round(lerp(a[2], b[2], clamped)),
  ];
}

function samplePalette(colors: Rgb[], t: number): Rgb {
  const clamped = clamp(t, 0, 0.9999);
  const scaled = clamped * (colors.length - 1);
  const index = Math.floor(scaled);
  return mixRgb(colors[index], colors[Math.min(colors.length - 1, index + 1)], scaled - index);
}

function angularHarmonic(angle: number, primaryTurns: number, secondaryTurns: number) {
  return Math.sin(angle * primaryTurns) * 0.68 + Math.cos(angle * secondaryTurns) * 0.32;
}

function hashNoise(x: number, y: number, seed: number) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
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

function fbm(x: number, y: number, seed: number, octaves: number) {
  let total = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i += 1) {
    total += valueNoise(x * frequency, y * frequency, seed + i * 101) * amplitude;
    norm += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return total / Math.max(0.0001, norm);
}

function renderSize(width: number, height: number, maxDimension = RASTER_SHADER_MAX) {
  const safeWidth = Math.max(1, Math.round(width));
  const safeHeight = Math.max(1, Math.round(height));
  const longest = Math.max(safeWidth, safeHeight);
  if (longest <= maxDimension) return { width: safeWidth, height: safeHeight };
  const scale = maxDimension / longest;
  return {
    width: Math.max(1, Math.round(safeWidth * scale)),
    height: Math.max(1, Math.round(safeHeight * scale)),
  };
}

function transformedPoint(node: GraphShaderNode, x: number, y: number, width: number, height: number) {
  const aspect = width / Math.max(1, height);
  const offsetX = clamp(node.offsetX / 100, -1, 1) * 0.7;
  const offsetY = clamp(node.offsetY / 100, -1, 1) * 0.7;
  const nx = ((x / Math.max(1, width - 1) - 0.5) * 2 - offsetX) * aspect;
  const ny = (y / Math.max(1, height - 1) - 0.5) * 2 - offsetY;
  const rotation = (-node.rotation * Math.PI) / 180;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return {
    x: nx * cos - ny * sin,
    y: nx * sin + ny * cos,
  };
}

function applySampledImage(
  target: HTMLCanvasElement,
  node: GraphShaderNode,
  seed: number,
  sampler: (x: number, y: number, width: number, height: number) => Rgb,
) {
  const size = renderSize(target.width, target.height);
  const sample = createCanvas(size.width, size.height);
  const sampleCtx = sample.getContext('2d', { willReadFrequently: true });
  const targetCtx = target.getContext('2d');
  if (!sampleCtx || !targetCtx) return;
  const image = sampleCtx.createImageData(size.width, size.height);
  const rng = lcg(seed + (node.seedOffset ?? 0) + 811);
  const grain = clamp(node.grain / 100, 0, 1);

  for (let y = 0; y < size.height; y += 1) {
    for (let x = 0; x < size.width; x += 1) {
      const index = (y * size.width + x) * 4;
      const color = sampler(x, y, size.width, size.height);
      const noise = grain > 0 ? (rng() - 0.5) * 42 * grain : 0;
      image.data[index] = clamp(color[0] + noise, 0, 255);
      image.data[index + 1] = clamp(color[1] + noise, 0, 255);
      image.data[index + 2] = clamp(color[2] + noise, 0, 255);
      image.data[index + 3] = 255;
    }
  }

  sampleCtx.putImageData(image, 0, 0);
  targetCtx.imageSmoothingEnabled = true;
  targetCtx.drawImage(sample, 0, 0, target.width, target.height);
}

function applyGrain(ctx: CanvasRenderingContext2D, node: GraphShaderNode, seed: number, width: number, height: number) {
  const grain = clamp(node.grain / 100, 0, 1);
  if (grain <= 0) return;
  const rng = lcg(seed + (node.seedOffset ?? 0) + 919);
  const image = ctx.getImageData(0, 0, width, height);
  for (let i = 0; i < image.data.length; i += 4) {
    const noise = (rng() - 0.5) * 42 * grain;
    image.data[i] = clamp(image.data[i] + noise, 0, 255);
    image.data[i + 1] = clamp(image.data[i + 1] + noise, 0, 255);
    image.data[i + 2] = clamp(image.data[i + 2] + noise, 0, 255);
  }
  ctx.putImageData(image, 0, 0);
}

function renderMeshGradient(node: GraphShaderNode, seed: number, canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;
  const { width, height } = canvas;
  const colors = shaderColorStops(node);
  const rng = lcg(seed + (node.seedOffset ?? 0));
  const scale = clamp(node.scale / 100, 0.2, 3);
  const distortion = clamp(node.distortion / 100, 0, 1);
  const swirl = clamp(node.swirl / 100, 0, 1);
  const offsetX = clamp(node.offsetX / 100, -1, 1) * width * 0.35;
  const offsetY = clamp(node.offsetY / 100, -1, 1) * height * 0.35;
  const rotation = (node.rotation * Math.PI) / 180;

  ctx.fillStyle = colorStop(colors, 0);
  ctx.fillRect(0, 0, width, height);

  const diagonal = Math.hypot(width, height) * scale;
  for (let index = 0; index < colors.length; index += 1) {
    const angle = rotation + index * 1.72 + swirl * 2.8;
    const jitterX = (rng() - 0.5) * width * distortion * 0.7;
    const jitterY = (rng() - 0.5) * height * distortion * 0.7;
    const x = width / 2 + Math.cos(angle) * width * 0.24 + offsetX + jitterX;
    const y = height / 2 + Math.sin(angle) * height * 0.24 + offsetY + jitterY;
    const radius = diagonal * (0.34 + rng() * 0.22);
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, rgba(colors[index], 0.94));
    gradient.addColorStop(0.46, rgba(colors[index], 0.42));
    gradient.addColorStop(1, rgba(colors[index], 0));
    ctx.globalCompositeOperation = index === 0 ? 'source-over' : 'lighter';
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }

  const linear = ctx.createLinearGradient(0, 0, width, height);
  linear.addColorStop(0, rgba(colorStop(colors, 1), 0.22 + distortion * 0.16));
  linear.addColorStop(0.5, rgba(colorStop(colors, 2), 0.08 + swirl * 0.18));
  linear.addColorStop(1, rgba(colorStop(colors, 3), 0.26));
  ctx.globalCompositeOperation = 'overlay';
  ctx.fillStyle = linear;
  ctx.fillRect(0, 0, width, height);
  ctx.globalCompositeOperation = 'source-over';
  applyGrain(ctx, node, seed, width, height);
}

function renderNoiseField(node: GraphShaderNode, seed: number, canvas: HTMLCanvasElement) {
  const colors = shaderPalette(node);
  const scale = clamp(node.scale / 100, 0.2, 3);
  const distortion = clamp(node.distortion / 100, 0, 1);
  const swirl = clamp(node.swirl / 100, 0, 1);
  const octaves = 3 + Math.round(swirl * 3);
  const frequency = 2.8 / scale;

  applySampledImage(canvas, node, seed, (x, y, width, height) => {
    const p = transformedPoint(node, x, y, width, height);
    const warp = fbm(p.x * frequency * 0.65 + 23.1, p.y * frequency * 0.65 - 17.6, seed + 17, octaves);
    const n = fbm(
      p.x * frequency + warp * distortion * 2.2,
      p.y * frequency - warp * distortion * 2.2,
      seed + 53,
      octaves,
    );
    const tone = smoothstep(0.12, 0.92, n + (warp - 0.5) * distortion * 0.35);
    return samplePalette(colors, tone);
  });
}

function renderMarble(node: GraphShaderNode, seed: number, canvas: HTMLCanvasElement) {
  const colors = shaderPalette(node);
  const scale = clamp(node.scale / 100, 0.2, 3);
  const distortion = clamp(node.distortion / 100, 0, 1);
  const swirl = clamp(node.swirl / 100, 0, 1);
  const frequency = 5.8 / scale;

  applySampledImage(canvas, node, seed, (x, y, width, height) => {
    const p = transformedPoint(node, x, y, width, height);
    const radius = Math.hypot(p.x, p.y);
    const angle = Math.atan2(p.y, p.x);
    const turbulence = fbm(p.x * 2.1, p.y * 2.1, seed + 139, 5);
    const angularWarp = angularHarmonic(angle, 2, 3) * swirl * 2.4;
    const vein = Math.sin((p.x + p.y * 0.34) * frequency + turbulence * (3 + distortion * 13) + angularWarp);
    const mineral = fbm(p.x * 7.2 + radius, p.y * 7.2 - radius, seed + 271, 3);
    const tone = clamp(0.5 + vein * 0.32 + (mineral - 0.5) * 0.36 * distortion, 0, 1);
    return samplePalette(colors, smoothstep(0.08, 0.96, tone));
  });
}

function renderLiquid(node: GraphShaderNode, seed: number, canvas: HTMLCanvasElement) {
  const colors = shaderPalette(node);
  const rng = lcg(seed + (node.seedOffset ?? 0) + 331);
  const centers = Array.from({ length: 5 }, () => ({
    x: (rng() - 0.5) * 2.2,
    y: (rng() - 0.5) * 1.7,
    r: 0.28 + rng() * 0.34,
  }));
  const scale = clamp(node.scale / 100, 0.2, 3);
  const distortion = clamp(node.distortion / 100, 0, 1);
  const swirl = clamp(node.swirl / 100, 0, 1);

  applySampledImage(canvas, node, seed, (x, y, width, height) => {
    const p = transformedPoint(node, x, y, width, height);
    const waveX = Math.sin(p.y * (4.8 / scale) + p.x * swirl * 3.2) * distortion * 0.28;
    const waveY = Math.cos(p.x * (4.2 / scale) - p.y * swirl * 2.8) * distortion * 0.22;
    const px = p.x + waveX;
    const py = p.y + waveY;
    let field = 0;
    for (const center of centers) {
      const dx = px - center.x;
      const dy = py - center.y;
      field += (center.r * center.r) / Math.max(0.015, dx * dx + dy * dy);
    }
    const cellular = fbm(px * 2.2, py * 2.2, seed + 401, 4);
    const tone = smoothstep(0.72, 2.6, field) * 0.72 + cellular * 0.28;
    return samplePalette(colors, tone);
  });
}

function renderStaticRadialGradient(node: GraphShaderNode, seed: number, canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;
  const { width, height } = canvas;
  const colors = shaderColorStops(node);
  const offsetX = clamp(node.offsetX / 100, -1, 1) * width * 0.28;
  const offsetY = clamp(node.offsetY / 100, -1, 1) * height * 0.28;
  const scale = clamp(node.scale / 100, 0.2, 3);
  const radius = Math.hypot(width, height) * 0.5 * scale;
  const gradient = ctx.createRadialGradient(
    width / 2 + offsetX,
    height / 2 + offsetY,
    0,
    width / 2,
    height / 2,
    radius,
  );
  colors.forEach((color, index) => {
    gradient.addColorStop(index / Math.max(1, colors.length - 1), color);
  });
  ctx.fillStyle = colors[colors.length - 1] ?? '#000000';
  ctx.fillRect(0, 0, width, height);
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  applyGrain(ctx, node, seed, width, height);
}

function renderGrainGradient(node: GraphShaderNode, seed: number, canvas: HTMLCanvasElement) {
  renderStaticRadialGradient({ ...node, grain: Math.max(node.grain, 38) }, seed, canvas);
}

function renderColorPanels(node: GraphShaderNode, seed: number, canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;
  const { width, height } = canvas;
  const colors = shaderColorStops(node);
  const rng = lcg(seed + (node.seedOffset ?? 0) + 1201);
  ctx.fillStyle = colorStop(colors, 0);
  ctx.fillRect(0, 0, width, height);
  const columns = 4 + Math.round(clamp(node.scale / 100, 0.2, 3) * 2);
  for (let i = 0; i < columns; i += 1) {
    const x = (i / columns) * width;
    const w = width / columns + width * 0.12;
    const h = height * (0.45 + rng() * 0.8);
    ctx.fillStyle = rgba(colors[i % colors.length], 0.64 + rng() * 0.28);
    ctx.fillRect(x - w * 0.06, (height - h) * rng(), w, h);
  }
  applyGrain(ctx, node, seed, width, height);
}

function renderDotGrid(node: GraphShaderNode, seed: number, canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;
  const { width, height } = canvas;
  const colors = shaderColorStops(node);
  const scale = clamp(node.scale / 100, 0.2, 3);
  const spacing = clamp(30 / scale, 6, 60);
  const distortion = clamp(node.distortion / 100, 0, 1);
  const rng = lcg(seed + (node.seedOffset ?? 0) + 1301);
  const dotColors = colors.slice(0, -1);
  ctx.fillStyle = colors[colors.length - 1] ?? '#000000';
  ctx.fillRect(0, 0, width, height);
  for (let y = spacing / 2; y < height; y += spacing) {
    for (let x = spacing / 2; x < width; x += spacing) {
      const tone = valueNoise(x / spacing, y / spacing, seed + 1307);
      const jitter = spacing * distortion * 0.32;
      ctx.fillStyle = dotColors[Math.min(dotColors.length - 1, Math.floor(tone * dotColors.length))] ?? '#ffffff';
      ctx.beginPath();
      ctx.arc(x + (rng() - 0.5) * jitter, y + (rng() - 0.5) * jitter, spacing * (0.13 + tone * 0.22), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  applyGrain(ctx, node, seed, width, height);
}

function renderDotOrbit(node: GraphShaderNode, seed: number, canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;
  const { width, height } = canvas;
  const colors = shaderColorStops(node);
  const scale = clamp(node.scale / 100, 0.2, 3);
  const rings = 3 + Math.round(clamp(node.swirl / 100, 0, 1) * 4);
  const count = 18 + Math.round(scale * 14);
  const rng = lcg(seed + (node.seedOffset ?? 0) + 1401);
  ctx.fillStyle = colorStop(colors, 3);
  ctx.fillRect(0, 0, width, height);
  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.rotate((node.rotation * Math.PI) / 180);
  for (let ring = 1; ring <= rings; ring += 1) {
    const radius = (Math.min(width, height) * 0.42 * ring) / rings;
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2 + ring * 0.41;
      const tone = i / count;
      const dot = Math.max(1.5, Math.min(width, height) * 0.008 * (1 + rng() * 2));
      ctx.fillStyle = rgba(colors[(ring + i) % colors.length], 0.54 + tone * 0.36);
      ctx.beginPath();
      ctx.arc(Math.cos(angle) * radius, Math.sin(angle) * radius, dot, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
  applyGrain(ctx, node, seed, width, height);
}

function renderBorderRings(node: GraphShaderNode, seed: number, canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;
  const { width, height } = canvas;
  const colors = shaderColorStops(node);
  ctx.fillStyle = colorStop(colors, 0);
  ctx.fillRect(0, 0, width, height);
  const steps = 9;
  for (let i = 0; i < steps; i += 1) {
    const inset = (i / steps) * Math.min(width, height) * 0.28;
    ctx.strokeStyle = rgba(colors[(i + 1) % colors.length], 0.18 + (1 - i / steps) * 0.54);
    ctx.lineWidth = Math.max(2, Math.min(width, height) * 0.018 * (1 + i * 0.15));
    ctx.strokeRect(inset, inset, width - inset * 2, height - inset * 2);
  }
  applyGrain(ctx, node, seed, width, height);
}

function renderFieldPattern(node: GraphShaderNode, seed: number, canvas: HTMLCanvasElement, mode: string) {
  const colors = shaderPalette(node);
  const scale = clamp(node.scale / 100, 0.2, 3);
  const distortion = clamp(node.distortion / 100, 0, 1);
  const swirl = clamp(node.swirl / 100, 0, 1);
  const frequency = 3.2 / scale;

  applySampledImage(canvas, node, seed, (x, y, width, height) => {
    const p = transformedPoint(node, x, y, width, height);
    const radius = Math.hypot(p.x, p.y);
    const angle = Math.atan2(p.y, p.x);
    let tone: number;

    if (mode === 'paperTexture') {
      tone = 0.5 + (fbm(p.x * 18, p.y * 18, seed + 1601, 4) - 0.5) * 0.72;
    } else if (mode === 'water') {
      tone =
        0.5 +
        Math.sin(p.x * 8 + Math.sin(p.y * 9 + swirl * 4) * 2.6) * 0.22 +
        fbm(p.x * 5, p.y * 5, seed + 1621, 4) * 0.28;
    } else if (mode === 'waterCaustic') {
      const warp = (fbm(p.x * 2.4, p.y * 2.4, seed + 1627, 4) - 0.5) * distortion;
      const f = 8.5 / scale;
      const w1 = Math.sin((p.x + warp * 0.38) * f + Math.sin(p.y * f * 0.7) * 1.9);
      const w2 = Math.sin((p.x * 0.58 - p.y * 1.05) * f * 0.82 + Math.cos(p.x * f * 0.6) * 1.3);
      const w3 = Math.sin((p.x * 1.25 + p.y * 0.45) * f * 0.62 + warp * 3.1);
      const caustic = Math.pow(1 - Math.min(1, (Math.abs(w1) + Math.abs(w2) + Math.abs(w3)) / 2.35), 2.2);
      const base = 0.18 + fbm(p.x * 1.2, p.y * 1.2, seed + 1631, 3) * 0.28;
      tone = base + caustic * 0.95;
    } else if (mode === 'heatmap') {
      tone = smoothstep(0.05, 0.98, fbm(p.x * 2.3, p.y * 2.3, seed + 1641, 5) + (1 - radius) * 0.36);
    } else if (mode === 'liquidMetal') {
      const ripple = Math.sin((p.x + p.y) * 9 + fbm(p.x * 5, p.y * 5, seed + 1651, 4) * 8);
      tone = 0.5 + ripple * 0.26 + Math.pow(Math.max(0, 1 - radius), 2) * 0.36;
    } else if (mode === 'gemSmoke') {
      tone = fbm(p.x * 2 + Math.sin(p.y * 4) * 0.6, p.y * 2 + Math.cos(p.x * 3) * 0.6, seed + 1661, 6);
      tone = smoothstep(0.24, 0.92, tone + (1 - radius) * 0.28);
    } else if (mode === 'moire') {
      const baseAngle = (node.rotation * Math.PI) / 180;
      const secondAngle = baseAngle + 0.08 + distortion * 0.22 + swirl * 0.34;
      const freq = 16 / scale;
      const u1 = p.x * Math.cos(baseAngle) + p.y * Math.sin(baseAngle);
      const u2 = p.x * Math.cos(secondAngle) + p.y * Math.sin(secondAngle);
      const lineA = Math.sin(u1 * freq * Math.PI);
      const lineB = Math.sin(u2 * freq * (1.04 + distortion * 0.16) * Math.PI);
      const interference = Math.abs(lineA - lineB);
      tone = smoothstep(0.08, 1, interference * 0.68 + (0.5 + 0.5 * Math.sin((lineA + lineB) * 3)) * 0.28);
    } else if (mode === 'concentricPatterns') {
      const angularTurns = 4 + Math.round(swirl * 6);
      const warpedRadius =
        radius +
        (fbm(p.x * 3.2, p.y * 3.2, seed + 1667, 4) - 0.5) * distortion * 0.22 +
        Math.sin(angle * angularTurns) * 0.045 * swirl;
      const rings = Math.sin((warpedRadius * frequency * 9 + angularHarmonic(angle, 2, 3) * swirl * 0.06) * TAU);
      const radialMask = smoothstep(1.65, 0.05, radius);
      tone = smoothstep(0.22, 0.96, Math.abs(rings)) * 0.78 + radialMask * 0.22;
    } else if (mode === 'spiral') {
      const turns = 5 + Math.round(swirl * 6);
      const radialPhase = radius * frequency * (8 + swirl * 2);
      tone = 0.5 + Math.sin(angle * turns + radialPhase) * 0.5;
    } else if (mode === 'swirl') {
      tone = fbm(Math.cos(angle + radius * 4) * frequency, Math.sin(angle - radius * 4) * frequency, seed + 1681, 5);
    } else if (mode === 'waves') {
      tone = 0.5 + Math.sin((p.x * Math.cos(swirl * 2) + p.y * Math.sin(swirl * 2)) * frequency * 8) * 0.35;
      tone += (fbm(p.x * 4, p.y * 4, seed + 1691, 3) - 0.5) * distortion * 0.4;
    } else if (mode === 'glowingWave') {
      const direction = (node.rotation * Math.PI) / 180 + swirl * 0.7;
      const u = p.x * Math.cos(direction) + p.y * Math.sin(direction);
      const cross = -p.x * Math.sin(direction) + p.y * Math.cos(direction);
      const warp = fbm(p.x * 2.2, p.y * 2.2, seed + 1695, 4) * distortion;
      const wave = Math.sin(u * frequency * 10 + Math.sin(cross * 2.8 + warp * 3.2) * (1.4 + swirl * 2.2));
      const band = Math.pow(Math.max(0, 1 - Math.abs(wave)), 2.4);
      const halo = Math.pow(Math.max(0, 1 - Math.abs(cross + Math.sin(u * 2) * 0.18)), 2) * 0.28;
      tone = 0.08 + band * 0.82 + halo + fbm(p.x * 5.5, p.y * 5.5, seed + 1697, 3) * 0.16;
    } else if (mode === 'neuroNoise') {
      const n = fbm(p.x * 2.2, p.y * 2.2, seed + 1701, 5);
      tone = 0.5 + Math.sin(n * 12 + p.x * 2 - p.y * 2) * 0.32 + n * 0.24;
    } else if (mode === 'perlin' || mode === 'simplexNoise' || mode === 'noiseField') {
      tone = fbm(
        p.x * frequency,
        p.y * frequency,
        seed + (mode === 'simplexNoise' ? 1711 : 1707),
        mode === 'perlin' ? 5 : 6,
      );
    } else if (mode === 'voronoi') {
      const gx = p.x * frequency * 1.6;
      const gy = p.y * frequency * 1.6;
      let minDist = 8;
      for (let oy = -1; oy <= 1; oy += 1) {
        for (let ox = -1; ox <= 1; ox += 1) {
          const cx = Math.floor(gx) + ox;
          const cy = Math.floor(gy) + oy;
          const px = cx + hashNoise(cx, cy, seed + 1721);
          const py = cy + hashNoise(cx, cy, seed + 1727);
          minDist = Math.min(minDist, Math.hypot(gx - px, gy - py));
        }
      }
      tone = smoothstep(0.05, 1.15, minDist);
    } else if (mode === 'smokeRing') {
      const ring = 1 - Math.abs(radius - 0.72) * 2.2;
      tone = smoothstep(0.1, 0.9, ring + fbm(p.x * 5, p.y * 5, seed + 1731, 4) * 0.45);
    } else if (mode === 'tilelessTexture') {
      const tx = x / Math.max(1, width);
      const ty = y / Math.max(1, height);
      const loopX = Math.cos(tx * Math.PI * 2) + Math.sin(tx * Math.PI * 2);
      const loopY = Math.cos(ty * Math.PI * 2) + Math.sin(ty * Math.PI * 2);
      tone = fbm(loopX * frequency, loopY * frequency, seed + 1741, 5);
    } else {
      tone = fbm(p.x * frequency, p.y * frequency, seed + 1751, 4);
    }

    return samplePalette(colors, clamp(tone, 0, 1));
  });
}

export function renderShaderNodeToCanvas(node: GraphShaderNode, seed: number, width: number, height: number) {
  const renderNode = node;
  const renderSeed = seed;
  const canvas = createCanvas(width, height);
  switch (renderNode.shaderKind) {
    case 'aiShader':
    case 'customCode':
      return renderCustomCodeShaderNodeToCanvas(renderNode, renderSeed, width, height, null);
    case 'paperTexture':
    case 'water':
    case 'waterCaustic':
    case 'heatmap':
    case 'liquidMetal':
    case 'gemSmoke':
    case 'moire':
    case 'concentricPatterns':
    case 'spiral':
    case 'swirl':
    case 'waves':
    case 'glowingWave':
    case 'neuroNoise':
    case 'perlin':
    case 'simplexNoise':
    case 'voronoi':
    case 'smokeRing':
    case 'tilelessTexture':
      renderFieldPattern(renderNode, renderSeed, canvas, renderNode.shaderKind);
      break;
    case 'staticRadialGradient':
      renderStaticRadialGradient(renderNode, renderSeed, canvas);
      break;
    case 'grainGradient':
      renderGrainGradient(renderNode, renderSeed, canvas);
      break;
    case 'dotOrbit':
      renderDotOrbit(renderNode, renderSeed, canvas);
      break;
    case 'dotGrid':
      renderDotGrid(renderNode, renderSeed, canvas);
      break;
    case 'borderRings':
      renderBorderRings(renderNode, renderSeed, canvas);
      break;
    case 'metaballs':
      renderLiquid({ ...renderNode, swirl: Math.max(renderNode.swirl, 55) }, renderSeed, canvas);
      break;
    case 'colorPanels':
      renderColorPanels(renderNode, renderSeed, canvas);
      break;
    case 'noiseField':
      renderNoiseField(renderNode, renderSeed, canvas);
      break;
    case 'marble':
      renderMarble(renderNode, renderSeed, canvas);
      break;
    case 'liquid':
      renderLiquid(renderNode, renderSeed, canvas);
      break;
    case 'meshGradient':
    default:
      renderMeshGradient(renderNode, renderSeed, canvas);
      break;
  }
  return canvas;
}

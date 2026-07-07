import type { GraphShaderNode } from '../../types/config';
import { normalizeCustomShaderCodeConfig } from '../customShaderCode';
import { createCanvas, isDrawableCanvas } from './canvas';

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function createFallbackBackdrop(width: number, height: number, seed: number) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  const hue = Math.abs(seed % 360);
  gradient.addColorStop(0, `hsl(${hue}, 70%, 10%)`);
  gradient.addColorStop(0.55, `hsl(${(hue + 54) % 360}, 80%, 20%)`);
  gradient.addColorStop(1, `hsl(${(hue + 190) % 360}, 70%, 14%)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  return canvas;
}

function chooseBackdrop(backdrop: HTMLCanvasElement | null | undefined, width: number, height: number, seed: number) {
  return backdrop && isDrawableCanvas(backdrop) ? backdrop : createFallbackBackdrop(width, height, seed);
}

function renderCanvasFallback(
  node: GraphShaderNode,
  seed: number,
  width: number,
  height: number,
  backdrop?: HTMLCanvasElement | null,
) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d')!;
  const base = chooseBackdrop(backdrop, width, height, seed);
  ctx.drawImage(base, 0, 0, width, height);
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = 0.35 + clamp(node.distortion / 100, 0, 1) * 0.35;
  ctx.strokeStyle = node.colorC;
  ctx.lineWidth = Math.max(1.5, width / 96);
  const waves = Math.max(5, Math.round(8 + node.scale / 12));
  for (let i = -2; i < waves + 2; i += 1) {
    ctx.beginPath();
    for (let x = 0; x <= width; x += Math.max(4, width / 80)) {
      const t = x / Math.max(1, width);
      const y =
        ((i + 0.5) / waves) * height +
        Math.sin(t * Math.PI * 6 + seed * 0.01 + i * 0.7) * height * 0.045 * clamp(node.distortion / 70, 0.2, 1.4);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  return canvas;
}

function compileShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function renderWithWebGl(
  node: GraphShaderNode,
  seed: number,
  width: number,
  height: number,
  backdrop?: HTMLCanvasElement | null,
) {
  const canvas = createCanvas(width, height);
  let gl: WebGLRenderingContext | null;
  try {
    gl = canvas.getContext('webgl', { premultipliedAlpha: false, preserveDrawingBuffer: true });
  } catch {
    return null;
  }
  if (!gl) return null;

  const config = normalizeCustomShaderCodeConfig(node.customShaderCode);
  if (!config.code.includes('mainImage')) return null;

  const vertexSource = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;
  const fragmentSource = `
precision highp float;
uniform sampler2D u_backdrop;
uniform vec2 u_resolution;
uniform float u_seed;
uniform float u_strength;
uniform float u_has_backdrop;
varying vec2 v_uv;
${config.code}
void main() {
  gl_FragColor = mainImage(v_uv);
}`;
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  if (!vertexShader || !fragmentShader) return null;

  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  gl.useProgram(program);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const positionLocation = gl.getAttribLocation(program, 'a_position');
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

  const texture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  const source = chooseBackdrop(backdrop, width, height, seed);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);

  gl.uniform1i(gl.getUniformLocation(program, 'u_backdrop'), 0);
  gl.uniform2f(gl.getUniformLocation(program, 'u_resolution'), width, height);
  gl.uniform1f(gl.getUniformLocation(program, 'u_seed'), seed + node.seedOffset);
  gl.uniform1f(gl.getUniformLocation(program, 'u_strength'), clamp(node.distortion / 100, 0, 1.5));
  gl.uniform1f(gl.getUniformLocation(program, 'u_has_backdrop'), backdrop && isDrawableCanvas(backdrop) ? 1 : 0);
  gl.viewport(0, 0, width, height);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  return canvas;
}

export function renderCustomCodeShaderNodeToCanvas(
  node: GraphShaderNode,
  seed: number,
  width: number,
  height: number,
  backdrop?: HTMLCanvasElement | null,
) {
  return (
    renderWithWebGl(node, seed, width, height, backdrop) ?? renderCanvasFallback(node, seed, width, height, backdrop)
  );
}

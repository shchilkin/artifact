import type { GraphShaderNode } from '../../types/config';
import {
  customShaderCodeHasBlockingIssues,
  normalizeCustomShaderCodeConfig,
  validateCustomShaderCode,
} from '../customShaderCode';
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

function renderTransparentShaderCanvas(width: number, height: number) {
  return createCanvas(width, height);
}

const CUSTOM_CODE_VERTEX_SOURCE = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const CUSTOM_CODE_FRAGMENT_PREFIX = `
precision highp float;
uniform sampler2D u_backdrop;
uniform vec2 u_resolution;
uniform float u_seed;
uniform float u_strength;
uniform float u_has_backdrop;
varying vec2 v_uv;
`;

const CUSTOM_CODE_FRAGMENT_SUFFIX = `
void main() {
  gl_FragColor = mainImage(v_uv);
}`;

export interface CustomCodeShaderCompileResult {
  ok: boolean;
  message: string | null;
}

function buildCustomCodeFragmentSource(code: string) {
  return `${CUSTOM_CODE_FRAGMENT_PREFIX}${code}\n${CUSTOM_CODE_FRAGMENT_SUFFIX}`;
}

function compileShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return { shader: null, log: 'Could not prepare shader.' };
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? 'Shader did not compile.';
    gl.deleteShader(shader);
    return { shader: null, log };
  }
  return { shader, log: null };
}

function linkProgram(gl: WebGLRenderingContext, vertexShader: WebGLShader, fragmentShader: WebGLShader) {
  const program = gl.createProgram();
  if (!program) return { program: null, log: 'Could not prepare shader preview.' };
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? 'Shader did not link.';
    gl.deleteProgram(program);
    return { program: null, log };
  }
  return { program, log: null };
}

function buildProgram(gl: WebGLRenderingContext, fragmentSource: string) {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, CUSTOM_CODE_VERTEX_SOURCE);
  if (!vertex.shader) return { program: null, log: vertex.log };

  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  if (!fragment.shader) {
    gl.deleteShader(vertex.shader);
    return { program: null, log: fragment.log };
  }

  const linked = linkProgram(gl, vertex.shader, fragment.shader);
  gl.deleteShader(vertex.shader);
  gl.deleteShader(fragment.shader);
  return linked;
}

function createWebGlContext(width: number, height: number) {
  if (typeof document === 'undefined') return { canvas: null, gl: null };
  const canvas = createCanvas(width, height);
  try {
    return { canvas, gl: canvas.getContext('webgl', { premultipliedAlpha: false, preserveDrawingBuffer: true }) };
  } catch {
    return { canvas, gl: null };
  }
}

function releaseWebGlContext(gl: WebGLRenderingContext) {
  try {
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    // Context disposal is best-effort on browsers that expose an incomplete extension.
  }
}

function cleanCompileLog(log: string | null) {
  if (!log) return 'Shader did not compile.';
  const firstLine = log
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean);
  if (!firstLine) return 'Shader did not compile.';
  return firstLine.replace(/^ERROR:\s*0:\d+:\s*/i, '').slice(0, 180);
}

export function compileCustomCodeShaderForDiagnostics(code: string): CustomCodeShaderCompileResult {
  const blockingIssue = validateCustomShaderCode(code).find((issue) => issue.severity === 'error');
  if (blockingIssue) return { ok: false, message: blockingIssue.message };

  const { gl } = createWebGlContext(16, 16);
  if (!gl) return { ok: false, message: 'Shader preview is not available in this browser.' };
  let program: WebGLProgram | null = null;
  try {
    const built = buildProgram(gl, buildCustomCodeFragmentSource(code));
    program = built.program;
    if (!program) return { ok: false, message: cleanCompileLog(built.log) };
    return { ok: true, message: null };
  } catch {
    return { ok: false, message: 'Shader compilation failed in this browser.' };
  } finally {
    if (program) gl.deleteProgram(program);
    releaseWebGlContext(gl);
  }
}

function renderWithWebGl(
  node: GraphShaderNode,
  seed: number,
  width: number,
  height: number,
  backdrop?: HTMLCanvasElement | null,
) {
  const { canvas, gl } = createWebGlContext(width, height);
  if (!canvas || !gl) return null;
  const config = normalizeCustomShaderCodeConfig(node.customShaderCode);
  let program: WebGLProgram | null = null;
  let buffer: WebGLBuffer | null = null;
  let texture: WebGLTexture | null = null;

  try {
    const built = buildProgram(gl, buildCustomCodeFragmentSource(config.code));
    program = built.program;
    if (!program) return null;
    gl.useProgram(program);

    buffer = gl.createBuffer();
    if (!buffer) return null;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const positionLocation = gl.getAttribLocation(program, 'a_position');
    if (positionLocation < 0) return null;
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    texture = gl.createTexture();
    if (!texture) return null;
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
    gl.finish();

    const output = createCanvas(width, height);
    const outputContext = output.getContext('2d');
    if (!outputContext) return null;
    outputContext.drawImage(canvas, 0, 0, width, height);
    return output;
  } catch {
    return null;
  } finally {
    if (texture) gl.deleteTexture(texture);
    if (buffer) gl.deleteBuffer(buffer);
    if (program) gl.deleteProgram(program);
    releaseWebGlContext(gl);
  }
}

export function renderCustomCodeShaderNodeToCanvas(
  node: GraphShaderNode,
  seed: number,
  width: number,
  height: number,
  backdrop?: HTMLCanvasElement | null,
) {
  const config = normalizeCustomShaderCodeConfig(node.customShaderCode);
  if (!config.code.trim()) return renderTransparentShaderCanvas(width, height);
  if (customShaderCodeHasBlockingIssues(config.code)) {
    return renderCanvasFallback(node, seed, width, height, backdrop);
  }
  return (
    renderWithWebGl(node, seed, width, height, backdrop) ?? renderCanvasFallback(node, seed, width, height, backdrop)
  );
}

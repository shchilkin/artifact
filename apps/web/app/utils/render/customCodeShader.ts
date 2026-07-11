import type { GraphShaderNode, ShaderDefinition, ShaderPropertyDefinition } from '../../types/config';
import { customShaderCodeHasBlockingIssues, validateCustomShaderCode } from '../customShaderCode';
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
  stage: 'compile' | 'link' | 'runtime-contract' | 'render' | null;
}

export interface CustomCodeShaderCompileRequirements {
  requireBackdrop?: boolean;
  requirePropertyUniforms?: boolean;
  requirePropertyInfluence?: boolean;
  requireVisualVariation?: boolean;
}

const aiShaderInfluenceCache = new Map<string, string | null>();

function shaderPropertyUniformDeclaration(property: ShaderPropertyDefinition) {
  return `uniform ${property.type === 'color' ? 'vec3' : 'float'} u_prop_${property.key};`;
}

function buildCustomCodeFragmentSource(code: string, properties: ShaderPropertyDefinition[] = []) {
  const propertyUniforms = properties.map(shaderPropertyUniformDeclaration).join('\n');
  return `${CUSTOM_CODE_FRAGMENT_PREFIX}${propertyUniforms}\n${code}\n${CUSTOM_CODE_FRAGMENT_SUFFIX}`;
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
  if (!vertex.shader) return { program: null, log: vertex.log, stage: 'compile' as const };

  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  if (!fragment.shader) {
    gl.deleteShader(vertex.shader);
    return { program: null, log: fragment.log, stage: 'compile' as const };
  }

  const linked = linkProgram(gl, vertex.shader, fragment.shader);
  gl.deleteShader(vertex.shader);
  gl.deleteShader(fragment.shader);
  return { ...linked, stage: linked.program ? null : ('link' as const) };
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

export function compileCustomCodeShaderForDiagnostics(
  code: string,
  properties: ShaderPropertyDefinition[] = [],
  requirements: CustomCodeShaderCompileRequirements = {},
): CustomCodeShaderCompileResult {
  const blockingIssue = validateCustomShaderCode(code).find((issue) => issue.severity === 'error');
  if (blockingIssue) return { ok: false, message: blockingIssue.message, stage: 'runtime-contract' };

  const { gl } = createWebGlContext(16, 16);
  if (!gl) return { ok: false, message: 'Shader preview is not available in this browser.', stage: 'render' };
  let program: WebGLProgram | null = null;
  try {
    const built = buildProgram(gl, buildCustomCodeFragmentSource(code, properties));
    program = built.program;
    if (!program) return { ok: false, message: cleanCompileLog(built.log), stage: built.stage ?? 'compile' };
    const inactiveUniform = findRequiredInactiveUniform(gl, program, properties, requirements);
    if (inactiveUniform) return { ok: false, message: inactiveUniform, stage: 'runtime-contract' };
    const nonInfluentialInput = findRequiredNonInfluentialInput(gl, program, properties, requirements);
    if (nonInfluentialInput) return { ok: false, message: nonInfluentialInput, stage: 'runtime-contract' };
    const visualFailure = findVisualOutputFailure(gl, program, properties, requirements);
    if (visualFailure) return { ok: false, message: visualFailure, stage: 'render' };
    const nonInfluentialProperty = findRequiredNonInfluentialProperty(gl, program, properties, requirements);
    if (nonInfluentialProperty) return { ok: false, message: nonInfluentialProperty, stage: 'runtime-contract' };
    return { ok: true, message: null, stage: null };
  } catch {
    return { ok: false, message: 'Shader compilation failed in this browser.', stage: 'render' };
  } finally {
    if (program) gl.deleteProgram(program);
    releaseWebGlContext(gl);
  }
}

function findRequiredInactiveUniform(
  gl: WebGLRenderingContext,
  program: WebGLProgram,
  properties: ShaderPropertyDefinition[],
  requirements: CustomCodeShaderCompileRequirements,
) {
  if (requirements.requireBackdrop && gl.getUniformLocation(program, 'u_backdrop') === null) {
    return 'Use the connected image in the final shader result.';
  }
  if (requirements.requirePropertyUniforms) {
    const inactiveProperty = properties.find(
      (property) => gl.getUniformLocation(program, `u_prop_${property.key}`) === null,
    );
    if (inactiveProperty) return `${inactiveProperty.label} is not used by the final shader result.`;
  }
  return null;
}

function readDiagnosticFrame(
  gl: WebGLRenderingContext,
  program: WebGLProgram,
  properties: ShaderPropertyDefinition[],
  overrides: {
    backdrop?: [number, number, number, number];
    property?: ShaderPropertyDefinition;
    value?: unknown;
    values?: Record<string, unknown>;
  } = {},
) {
  const buffer = gl.createBuffer();
  const texture = gl.createTexture();
  if (!buffer || !texture) return null;
  try {
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const positionLocation = gl.getAttribLocation(program, 'a_position');
    if (positionLocation < 0) return null;
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    const backdrop = overrides.backdrop ?? [0, 0, 0, 255];
    const texturePixels = new Uint8Array(8 * 8 * 4);
    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 8; x += 1) {
        const offset = (y * 8 + x) * 4;
        texturePixels[offset] = (backdrop[0] + x * 29 + y * 7) % 256;
        texturePixels[offset + 1] = (backdrop[1] + x * 11 + y * 31) % 256;
        texturePixels[offset + 2] = (backdrop[2] + x * 19 + y * 17) % 256;
        texturePixels[offset + 3] = backdrop[3];
      }
    }
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 8, 8, 0, gl.RGBA, gl.UNSIGNED_BYTE, texturePixels);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.uniform1i(gl.getUniformLocation(program, 'u_backdrop'), 0);
    gl.uniform2f(gl.getUniformLocation(program, 'u_resolution'), 4, 4);
    gl.uniform1f(gl.getUniformLocation(program, 'u_seed'), 1171);
    gl.uniform1f(gl.getUniformLocation(program, 'u_strength'), 0.5);
    gl.uniform1f(gl.getUniformLocation(program, 'u_has_backdrop'), 1);
    for (const property of properties) {
      setSingleShaderPropertyUniform(gl, program, property, overrides.values?.[property.key] ?? property.default);
    }
    if (overrides.property) {
      setSingleShaderPropertyUniform(gl, program, overrides.property, overrides.value ?? overrides.property.default);
    }
    gl.viewport(0, 0, 4, 4);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    const pixels = new Uint8Array(4 * 4 * 4);
    gl.readPixels(0, 0, 4, 4, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    return pixels;
  } finally {
    gl.deleteTexture(texture);
    gl.deleteBuffer(buffer);
  }
}

function framesDiffer(first: Uint8Array | null, second: Uint8Array | null) {
  if (!first || !second || first.length !== second.length) return false;
  return first.some((value, index) => Math.abs(value - second[index]!) > 1);
}

function frameHasVisiblePixels(frame: Uint8Array | null) {
  if (!frame) return false;
  for (let offset = 3; offset < frame.length; offset += 4) {
    if (frame[offset]! > 8) return true;
  }
  return false;
}

function frameHasSpatialVariation(frame: Uint8Array | null) {
  if (!frame) return false;
  const minimum = [255, 255, 255];
  const maximum = [0, 0, 0];
  for (let offset = 0; offset < frame.length; offset += 4) {
    if (frame[offset + 3]! <= 8) continue;
    for (let channel = 0; channel < 3; channel += 1) {
      minimum[channel] = Math.min(minimum[channel]!, frame[offset + channel]!);
      maximum[channel] = Math.max(maximum[channel]!, frame[offset + channel]!);
    }
  }
  return maximum.some((value, channel) => value - minimum[channel]! > 4);
}

function findRequiredNonInfluentialInput(
  gl: WebGLRenderingContext,
  program: WebGLProgram,
  properties: ShaderPropertyDefinition[],
  requirements: CustomCodeShaderCompileRequirements,
) {
  if (requirements.requireBackdrop) {
    const dark = readDiagnosticFrame(gl, program, properties, { backdrop: [7, 19, 41, 255] });
    const light = readDiagnosticFrame(gl, program, properties, { backdrop: [223, 181, 97, 255] });
    if (!framesDiffer(dark, light)) return 'Use the connected image in the final shader result.';
  }
  return null;
}

function findVisualOutputFailure(
  gl: WebGLRenderingContext,
  program: WebGLProgram,
  properties: ShaderPropertyDefinition[],
  requirements: CustomCodeShaderCompileRequirements,
) {
  if (!requirements.requireVisualVariation) return null;
  const frame = readDiagnosticFrame(gl, program, properties, { backdrop: [31, 79, 149, 255] });
  if (!frameHasVisiblePixels(frame)) return 'The shader result is fully transparent.';
  if (!frameHasSpatialVariation(frame)) {
    return 'The shader result is visually flat. Preserve visible detail from the connected image.';
  }
  return null;
}

function findRequiredNonInfluentialProperty(
  gl: WebGLRenderingContext,
  program: WebGLProgram,
  properties: ShaderPropertyDefinition[],
  requirements: CustomCodeShaderCompileRequirements,
) {
  if (!requirements.requirePropertyInfluence) return null;
  for (const property of properties) {
    const values = propertyDiagnosticValues(property);
    const activeValues = propertyActivationValues(properties, property.key);
    const frames = values.map((value) =>
      readDiagnosticFrame(gl, program, properties, { property, value, values: activeValues }),
    );
    if (!frames.some((frame, index) => frames.slice(index + 1).some((candidate) => framesDiffer(frame, candidate)))) {
      return `${property.label} does not visibly change the shader result.`;
    }
  }
  return null;
}

function propertyActivationValues(properties: ShaderPropertyDefinition[], targetKey: string) {
  return Object.fromEntries(
    properties
      .filter((property) => property.key !== targetKey)
      .map((property) => {
        if (property.type === 'boolean') return [property.key, true];
        if (property.type === 'number') {
          const midpoint = (property.min + property.max) / 2;
          const activeValue = Math.abs(property.default) > 0.000001 ? property.default : midpoint || property.max;
          return [property.key, activeValue];
        }
        return [property.key, property.default];
      }),
  );
}

function propertyDiagnosticValues(property: ShaderPropertyDefinition): unknown[] {
  if (property.type === 'number') return [property.min, property.default, property.max];
  if (property.type === 'boolean') return [false, true];
  return ['#000000', property.default, '#ffffff'];
}

function validateAiShaderInfluence(gl: WebGLRenderingContext, program: WebGLProgram, definition: ShaderDefinition) {
  const cacheKey = JSON.stringify({ code: definition.code, properties: definition.properties });
  if (aiShaderInfluenceCache.has(cacheKey)) return aiShaderInfluenceCache.get(cacheKey) ?? null;
  const message =
    findRequiredNonInfluentialInput(gl, program, definition.properties, {
      requireBackdrop: true,
      requirePropertyUniforms: true,
      requirePropertyInfluence: true,
      requireVisualVariation: true,
    }) ??
    findVisualOutputFailure(gl, program, definition.properties, { requireVisualVariation: true }) ??
    findRequiredNonInfluentialProperty(gl, program, definition.properties, { requirePropertyInfluence: true });
  aiShaderInfluenceCache.set(cacheKey, message);
  return message;
}

function renderWithWebGl(
  node: GraphShaderNode,
  definition: ShaderDefinition,
  seed: number,
  width: number,
  height: number,
  backdrop?: HTMLCanvasElement | null,
) {
  const { canvas, gl } = createWebGlContext(width, height);
  if (!canvas || !gl) return null;
  let program: WebGLProgram | null = null;
  let buffer: WebGLBuffer | null = null;
  let texture: WebGLTexture | null = null;

  try {
    const built = buildProgram(gl, buildCustomCodeFragmentSource(definition.code, definition.properties));
    program = built.program;
    if (!program) return null;
    if (
      node.shaderKind === 'aiShader' &&
      (findRequiredInactiveUniform(gl, program, definition.properties, {
        requireBackdrop: true,
        requirePropertyUniforms: true,
      }) ||
        validateAiShaderInfluence(gl, program, definition))
    ) {
      return null;
    }
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
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

    gl.uniform1i(gl.getUniformLocation(program, 'u_backdrop'), 0);
    gl.uniform2f(gl.getUniformLocation(program, 'u_resolution'), width, height);
    gl.uniform1f(gl.getUniformLocation(program, 'u_seed'), seed + node.seedOffset);
    gl.uniform1f(gl.getUniformLocation(program, 'u_strength'), clamp(node.distortion / 100, 0, 1.5));
    gl.uniform1f(gl.getUniformLocation(program, 'u_has_backdrop'), backdrop && isDrawableCanvas(backdrop) ? 1 : 0);
    setShaderPropertyUniforms(gl, program, definition, node.shaderInstance?.values ?? {});
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

function setShaderPropertyUniforms(
  gl: WebGLRenderingContext,
  program: WebGLProgram,
  definition: ShaderDefinition,
  values: Record<string, number | boolean | string>,
) {
  for (const property of definition.properties) {
    const value = values[property.key] ?? property.default;
    setSingleShaderPropertyUniform(gl, program, property, value);
  }
}

function setSingleShaderPropertyUniform(
  gl: WebGLRenderingContext,
  program: WebGLProgram,
  property: ShaderPropertyDefinition,
  value: unknown,
) {
  const location = gl.getUniformLocation(program, `u_prop_${property.key}`);
  if (!location) return;
  if (property.type === 'color') {
    const [red, green, blue] = shaderHexToRgb(typeof value === 'string' ? value : property.default);
    gl.uniform3f(location, red, green, blue);
  } else if (property.type === 'boolean') {
    gl.uniform1f(location, value === true ? 1 : 0);
  } else {
    gl.uniform1f(location, typeof value === 'number' ? value : property.default);
  }
}

function shaderHexToRgb(value: string): [number, number, number] {
  const hex = value.replace('#', '');
  const expanded = hex.length === 3 ? hex.replace(/./g, (character) => character.repeat(2)) : hex;
  return [0, 2, 4].map((offset) => Number.parseInt(expanded.slice(offset, offset + 2), 16) / 255) as [
    number,
    number,
    number,
  ];
}

export function renderCustomCodeShaderNodeToCanvas(
  node: GraphShaderNode,
  seed: number,
  width: number,
  height: number,
  backdrop?: HTMLCanvasElement | null,
) {
  const definition = node.shaderInstance?.definition;
  if (!definition?.code.trim()) return renderTransparentShaderCanvas(width, height);
  if (node.role === 'effect' && (!backdrop || !isDrawableCanvas(backdrop))) {
    return renderTransparentShaderCanvas(width, height);
  }
  if (customShaderCodeHasBlockingIssues(definition.code)) {
    return renderTransparentShaderCanvas(width, height);
  }
  return (
    renderWithWebGl(node, definition, seed, width, height, backdrop) ?? renderTransparentShaderCanvas(width, height)
  );
}

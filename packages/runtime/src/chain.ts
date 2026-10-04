import { COPY_FRAGMENT, inputClamp, PASS_VERTEX } from './shaders.js';
import type { ArtworkSource, ChainPass, UniformValue, UniformValues } from './types.js';

const POSITION_ATTRIBUTE = 0;

interface UniformSlot {
  readonly location: WebGLUniformLocation;
  readonly type: number;
}

interface CompiledProgram {
  readonly program: WebGLProgram;
  readonly uniforms: ReadonlyMap<string, UniformSlot>;
}

interface Target {
  readonly texture: WebGLTexture;
  readonly framebuffer: WebGLFramebuffer;
}

/**
 * Runs a list of passes over a source texture: one draw per pass, ping-ponging between two framebuffer textures,
 * with the last pass drawing to the canvas. Nothing is read back to the CPU.
 */
export interface ChainRenderer {
  /** Sets the drawing-buffer size and reallocates the intermediate targets when it changes. */
  setSize(width: number, height: number): void;
  /** Uploads new source pixels. */
  setSource(source: ArtworkSource): void;
  /**
   * Draws every pass. `overrides[i]` is merged over pass `i`'s resting uniforms for this frame only.
   */
  render(overrides?: readonly (UniformValues | undefined)[]): void;
  /** Deletes every GL object the renderer created. The context itself stays usable. */
  destroy(): void;
}

export function createChainRenderer(gl: WebGL2RenderingContext, passes: readonly ChainPass[]): ChainRenderer {
  const created = {
    buffers: [] as WebGLBuffer[],
    vertexArrays: [] as WebGLVertexArrayObject[],
    shaders: [] as WebGLShader[],
    programs: [] as WebGLProgram[],
  };
  let destroyed = false;

  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, PASS_VERTEX, created.shaders);
  const programsBySource = new Map<string, CompiledProgram>();
  const programFor = (fragment: string): CompiledProgram => {
    let compiled = programsBySource.get(fragment);
    if (!compiled) {
      compiled = linkProgram(gl, vertexShader, fragment, created);
      programsBySource.set(fragment, compiled);
    }
    return compiled;
  };
  const drawPasses: readonly ChainPass[] =
    passes.length > 0 ? passes : [{ id: 'copy', fragment: COPY_FRAGMENT, uniforms: {} }];
  const passPrograms = drawPasses.map((pass) => programFor(pass.fragment));

  const vertexArray = gl.createVertexArray();
  const quad = gl.createBuffer();
  created.vertexArrays.push(vertexArray);
  created.buffers.push(quad);
  gl.bindVertexArray(vertexArray);
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(POSITION_ATTRIBUTE);
  gl.vertexAttribPointer(POSITION_ATTRIBUTE, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  const sourceTexture = createTexture(gl);
  // Two targets are enough for any chain length; a single pass draws straight from the source to the canvas.
  const targetCount = Math.min(drawPasses.length - 1, 2);
  const targets: Target[] = [];
  let width = 0;
  let height = 0;
  let clamp = inputClamp(1, 1);

  const assertLive = () => {
    if (destroyed) throw new Error('The chain renderer was destroyed.');
  };

  return {
    setSize(nextWidth, nextHeight) {
      assertLive();
      const w = Math.max(1, Math.round(nextWidth));
      const h = Math.max(1, Math.round(nextHeight));
      if (w === width && h === height) return;
      width = w;
      height = h;
      clamp = inputClamp(w, h);
      if (targets.length === 0) {
        for (let index = 0; index < targetCount; index += 1) targets.push(createTarget(gl, w, h));
        return;
      }
      for (const target of targets) {
        gl.bindTexture(gl.TEXTURE_2D, target.texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      }
      gl.bindTexture(gl.TEXTURE_2D, null);
    },

    setSource(source) {
      assertLive();
      gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
      // Pixi uploads canvases premultiplied and unflipped; matching both keeps editor fragments' output identical.
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      gl.bindTexture(gl.TEXTURE_2D, null);
    },

    render(overrides) {
      assertLive();
      if (width === 0 || height === 0) return;
      gl.disable(gl.BLEND);
      gl.disable(gl.DEPTH_TEST);
      gl.bindVertexArray(vertexArray);
      gl.activeTexture(gl.TEXTURE0);
      gl.viewport(0, 0, width, height);
      const last = drawPasses.length - 1;
      for (let index = 0; index <= last; index += 1) {
        const input = index === 0 ? sourceTexture : targets[(index - 1) % 2].texture;
        const output = index === last ? null : targets[index % 2].framebuffer;
        const { program, uniforms } = passPrograms[index];
        gl.bindFramebuffer(gl.FRAMEBUFFER, output);
        gl.useProgram(program);
        gl.bindTexture(gl.TEXTURE_2D, input);
        setUniform(gl, uniforms, 'uSampler', 0, true);
        setUniform(gl, uniforms, 'inputClamp', clamp);
        setUniform(gl, uniforms, 'uFlipY', output === null ? -1 : 1);
        setUniforms(gl, uniforms, drawPasses[index].uniforms);
        const override = overrides?.[index];
        if (override) setUniforms(gl, uniforms, override);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.bindVertexArray(null);
    },

    destroy() {
      if (destroyed) return;
      destroyed = true;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.useProgram(null);
      for (const target of targets) {
        gl.deleteFramebuffer(target.framebuffer);
        gl.deleteTexture(target.texture);
      }
      targets.length = 0;
      gl.deleteTexture(sourceTexture);
      for (const program of created.programs) gl.deleteProgram(program);
      for (const shader of created.shaders) gl.deleteShader(shader);
      for (const buffer of created.buffers) gl.deleteBuffer(buffer);
      for (const vao of created.vertexArrays) gl.deleteVertexArray(vao);
      programsBySource.clear();
    },
  };
}

function createTexture(gl: WebGL2RenderingContext): WebGLTexture {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return texture;
}

function createTarget(gl: WebGL2RenderingContext, width: number, height: number): Target {
  const texture = createTexture(gl);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  const framebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return { texture, framebuffer };
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string, created: WebGLShader[]): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Could not create a WebGL shader.');
  created.push(shader);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(`Shader compile failed: ${gl.getShaderInfoLog(shader) ?? 'unknown error'}`);
  }
  return shader;
}

function linkProgram(
  gl: WebGL2RenderingContext,
  vertexShader: WebGLShader,
  fragment: string,
  created: { shaders: WebGLShader[]; programs: WebGLProgram[] },
): CompiledProgram {
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragment, created.shaders);
  const program = gl.createProgram();
  created.programs.push(program);
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.bindAttribLocation(program, POSITION_ATTRIBUTE, 'aPosition');
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`Shader link failed: ${gl.getProgramInfoLog(program) ?? 'unknown error'}`);
  }
  const uniforms = new Map<string, UniformSlot>();
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
  for (let index = 0; index < count; index += 1) {
    const info = gl.getActiveUniform(program, index);
    if (!info) continue;
    const location = gl.getUniformLocation(program, info.name);
    if (location) uniforms.set(info.name.replace(/\[0\]$/, ''), { location, type: info.type });
  }
  return { program, uniforms };
}

function setUniforms(gl: WebGL2RenderingContext, slots: ReadonlyMap<string, UniformSlot>, values: UniformValues) {
  for (const name in values) setUniform(gl, slots, name, values[name]);
}

/** Sets a uniform the program declares; names the shader does not use are ignored, as Pixi does. */
function setUniform(
  gl: WebGL2RenderingContext,
  slots: ReadonlyMap<string, UniformSlot>,
  name: string,
  value: UniformValue,
  integer = false,
) {
  const slot = slots.get(name);
  if (!slot) return;
  const { location, type } = slot;
  if (typeof value === 'number') {
    if (integer || type === gl.INT || type === gl.BOOL || type === gl.SAMPLER_2D) gl.uniform1i(location, value);
    else gl.uniform1f(location, value);
    return;
  }
  switch (type) {
    case gl.FLOAT_VEC2:
      gl.uniform2f(location, value[0], value[1]);
      return;
    case gl.FLOAT_VEC3:
      gl.uniform3f(location, value[0], value[1], value[2]);
      return;
    case gl.FLOAT_VEC4:
      gl.uniform4f(location, value[0], value[1], value[2], value[3]);
      return;
    case gl.INT_VEC2:
      gl.uniform2i(location, value[0], value[1]);
      return;
    default:
      gl.uniform1fv(location, value as number[]);
  }
}

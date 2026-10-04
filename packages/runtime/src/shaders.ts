import { HEADER } from '@artifact/shared/effect-shaders';

/**
 * Vertex shader for every pass. GLSL ES 1.00, so the editor's Pixi filter fragments (also GLSL ES 1.00) link
 * against it unchanged on a WebGL2 context.
 *
 * Orientation: textures hold the image top row first (no `UNPACK_FLIP_Y`), so `vTextureCoord.y = 0` is the top of
 * the image, as in a Pixi filter. Passes into a framebuffer keep that layout (`uFlipY = 1`). The pass that draws to
 * the canvas sets `uFlipY = -1`, because the canvas drawing buffer's first row is the bottom of the screen.
 */
export const PASS_VERTEX = `
attribute vec2 aPosition;
uniform float uFlipY;
varying vec2 vTextureCoord;

void main() {
  vTextureCoord = aPosition;
  vec2 clip = aPosition * 2.0 - 1.0;
  gl_Position = vec4(clip.x, clip.y * uFlipY, 0.0, 1.0);
}
`;

/** Copies the input. Used when a chain has no passes, so the canvas still shows the source. */
export const COPY_FRAGMENT = `${HEADER}
void main() {
  gl_FragColor = texture2D(uSampler, vTextureCoord);
}`;

/**
 * Pixi's `inputClamp` for a filter input of `width` × `height` texels: the texture's extent inset by half a texel,
 * so clamped samples stay inside the frame. Every pass's input covers the whole render size (the source is
 * stretched to it by the first pass, as the editor draws it at the render size before filtering), so the runtime
 * uses the render size. Matching Pixi's half-texel inset, rather than `(0, 0, 1, 1)`, keeps `norm` identical to the
 * editor's and the warp output pixel-identical.
 */
export function inputClamp(width: number, height: number): [number, number, number, number] {
  return [0.5 / width, 0.5 / height, 1 - 0.5 / width, 1 - 0.5 / height];
}

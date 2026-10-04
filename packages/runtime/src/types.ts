/** A uniform value: a float or int scalar, a float/int vector of length 2 to 4, or a float or `vec4` array. */
export type UniformValue = number | readonly number[];

export type UniformValues = Readonly<Record<string, UniformValue>>;

/** One draw in the chain: a Pixi-compatible fragment and the uniforms it reads at rest. */
export interface ChainPass {
  /** Effect id, for diagnostics and per-frame uniform callbacks. */
  readonly id: string;
  readonly fragment: string;
  readonly uniforms: UniformValues;
}

/** Image data the chain reads from. Anything WebGL can upload with `texImage2D`. */
export type ArtworkSource = TexImageSource;

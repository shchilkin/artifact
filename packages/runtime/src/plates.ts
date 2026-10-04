import type { UniformValues } from './types.js';

/**
 * Plate transforms (issue #394): a live package's plates move as whole layers. A transform is applied about the
 * centre of the frame; at its neutral values the plate is drawn exactly where the editor rendered it.
 *
 * Units, in the texture orientation the chain uses (`y = 0` at the top):
 * - `x`, `y`: offset as a fraction of the frame's width and height (0.02 moves the plate 2% right or down);
 * - `scale`: a factor, 1 at rest;
 * - `rotation`: degrees, clockwise on screen;
 * - `opacity`: 0 to 1, multiplying the plate's alpha.
 */
export const PLATE_TRANSFORMS = ['x', 'y', 'scale', 'rotation', 'opacity'] as const;
export type PlateTransformField = (typeof PLATE_TRANSFORMS)[number];

/** Transforms a `parallax` binding can drive: each plate receives the binding's value times its depth. */
export const PARALLAX_TRANSFORMS = ['x', 'y', 'scale', 'rotation'] as const;
export type ParallaxTransform = (typeof PARALLAX_TRANSFORMS)[number];

export type PlateTransform = Readonly<Record<PlateTransformField, number>>;

export const NEUTRAL_PLATE_TRANSFORM: PlateTransform = { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 };

export const PLATE_EDGES = ['top', 'right', 'bottom', 'left'] as const;
export type PlateEdge = (typeof PLATE_EDGES)[number];

/** What the runtime knows about each plate of a package, bottom first. */
export interface PlateInfo {
  /** How strongly `parallax` bindings move the plate: 0 stays put, 1 takes the binding's full value. */
  readonly depth: number;
  /**
   * Sides of the frame the plate has pixels on. Moving such a side inward would show the plate's cut edge, so the
   * runtime scales the plate, each frame, just enough to keep those sides beyond the frame at the current offset and
   * rotation (no scaling while the transform is neutral, or when the move takes those sides outward).
   */
  readonly edges: readonly PlateEdge[];
}

/**
 * Depth when a package does not say: by stack order, top plates nearer. Plate `index` of `count` gets
 * `(index + 1) / count`, so the top plate takes a parallax binding's full value and the bottom plate a share of it.
 */
export function defaultPlateDepth(index: number, count: number): number {
  return count > 0 ? (index + 1) / count : 1;
}

/** Bottom-to-top plates with resolved depth and edges (every side when a package does not say). */
export function plateInfos(
  plates: readonly { readonly depth?: number; readonly edges?: readonly PlateEdge[] }[],
): readonly PlateInfo[] {
  return plates.map((plate, index) => ({
    depth: plate.depth ?? defaultPlateDepth(index, plates.length),
    edges: plate.edges ?? PLATE_EDGES,
  }));
}

/**
 * Smallest scale (about the frame's centre) that keeps the plate's `edges` sides at or beyond the frame of `width` ×
 * `height` at this offset and rotation: every frame corner must map inside the plate on those sides. 0 when no side
 * needs it; 1 for a neutral transform on any side.
 */
export function coverScale(
  transform: PlateTransform,
  width: number,
  height: number,
  edges: readonly PlateEdge[] = PLATE_EDGES,
): number {
  const { a, b, c, d } = inverseLinear(transform.rotation, width, height, 1);
  const top = edges.includes('top');
  const right = edges.includes('right');
  const bottom = edges.includes('bottom');
  const left = edges.includes('left');
  let needed = 0;
  for (const cornerX of [-0.5, 0.5]) {
    for (const cornerY of [-0.5, 0.5]) {
      const ux = cornerX - transform.x;
      const uy = cornerY - transform.y;
      // The plate point (before scaling, from its centre) this frame corner shows.
      const px = a * ux + c * uy;
      const py = b * ux + d * uy;
      if (right) needed = Math.max(needed, 2 * px);
      if (left) needed = Math.max(needed, -2 * px);
      if (bottom) needed = Math.max(needed, 2 * py);
      if (top) needed = Math.max(needed, -2 * py);
    }
  }
  return needed;
}

/** The transform the runtime draws: scaled up to cover the frame where the plate needs it, opacity in [0, 1]. */
export function effectiveTransform(transform: PlateTransform, plate: PlateInfo, width: number, height: number) {
  const scale = Math.max(transform.scale, coverScale(transform, width, height, plate.edges), 1e-3);
  return { ...transform, scale, opacity: Math.min(1, Math.max(0, transform.opacity)) };
}

/**
 * Uniforms for the plate shaders (`TRANSFORM_OVER_FRAGMENT`, `TRANSFORM_PLACE_FRAGMENT`): the inverse transform, from a
 * frame coordinate to the plate coordinate it shows, as `q = M (uv - 0.5 - offset) + 0.5`. The neutral transform gives
 * the identity, so a plate at rest samples exactly where an untransformed plate does.
 */
export function plateUniforms(transform: PlateTransform, plate: PlateInfo, width: number, height: number) {
  const effective = effectiveTransform(transform, plate, width, height);
  const { a, b, c, d } = inverseLinear(effective.rotation, width, height, effective.scale);
  return {
    uPlateMatrix: [a, b, c, d],
    uPlateOffset: [effective.x, effective.y],
    uPlateOpacity: effective.opacity,
  } satisfies UniformValues;
}

export const NEUTRAL_PLATE_UNIFORMS: UniformValues = {
  uPlateMatrix: [1, 0, 0, 1],
  uPlateOffset: [0, 0],
  uPlateOpacity: 1,
};

/**
 * Column-major 2 × 2 matrix (`a`, `b` the first column) of the inverse rotation and scale in texture coordinates:
 * `S⁻¹ R(-θ) S / scale`, where `S` is the frame size, so a rotation stays a rotation on a frame that is not square.
 */
function inverseLinear(rotationDegrees: number, width: number, height: number, scale: number) {
  if (rotationDegrees === 0) return { a: 1 / scale, b: 0, c: 0, d: 1 / scale };
  const radians = (rotationDegrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    a: cos / scale,
    b: (-sin * width) / height / scale,
    c: (sin * height) / width / scale,
    d: cos / scale,
  };
}

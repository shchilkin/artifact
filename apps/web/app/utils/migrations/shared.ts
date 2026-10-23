/** A stored document before `normalizeDocument` has validated it. */
export type StoredDocument = Record<string, unknown>;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Shader kinds removed from the product, mapped to the kind that replaced them. */
const REMOVED_SHADER_KINDS: Record<string, string> = {
  customSpec: 'aiShader',
  staticMeshGradient: 'meshGradient',
  pulsingBorder: 'borderRings',
  flutedGlass: 'waves',
  warp: 'waves',
  imageDithering: 'dotGrid',
  dithering: 'dotGrid',
  halftone: 'dotGrid',
  halftoneDots: 'dotGrid',
  halftoneCmyk: 'dotGrid',
  godRays: 'smokeRing',
};

/** The current shader kind for a stored kind, resolving removed kinds. Unknown kinds pass through. */
export function replacementShaderKind(value: unknown): unknown {
  return typeof value === 'string' && value in REMOVED_SHADER_KINDS ? REMOVED_SHADER_KINDS[value] : value;
}

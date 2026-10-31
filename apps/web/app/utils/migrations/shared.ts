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

/** A stack entry's parameters rewritten as another effect's. */
export type EffectEntryMigration = (params: Record<string, unknown>) => {
  effect: string;
  params: Record<string, unknown>;
};

/**
 * Rewrites the stack entries of effect layers whose effect has a migration, keeping each entry's id and switch.
 * Used by the steps that merge effects into one effect with a mode; each step freezes its own table.
 */
export function migrateEffectEntries(
  raw: StoredDocument,
  schemaVersion: number,
  migrations: Readonly<Record<string, EffectEntryMigration>>,
): StoredDocument {
  if (!Array.isArray(raw.layers)) return { ...raw, schemaVersion };
  const layers = raw.layers.map((layer) => {
    if (!isRecord(layer) || layer.kind !== 'effect' || !Array.isArray(layer.effects)) return layer;
    const effects = layer.effects.map((entry) => {
      if (!isRecord(entry) || typeof entry.effect !== 'string') return entry;
      const migrate = migrations[entry.effect];
      if (!migrate) return entry;
      return { ...entry, ...migrate(isRecord(entry.params) ? entry.params : {}) };
    });
    return { ...layer, effects };
  });
  return { ...raw, schemaVersion, layers };
}

import { type EffectEntryMigration, migrateEffectEntries, type StoredDocument } from './shared';

/** Frozen: schema-9 effects and how each becomes one Color Overlay effect with tint, gradient, and haze styles. */
const MIGRATIONS: Readonly<Record<string, EffectEntryMigration>> = {
  tint: (params) => ({
    effect: 'colorOverlay',
    params: { mode: 'multiply', amount: params.tintOp, color: params.tint },
  }),
  gradientOverlay: (params) => ({
    effect: 'colorOverlay',
    params: {
      mode: 'gradient',
      amount: params.gradMix,
      color: params.gradA,
      colorB: params.gradB,
      angle: params.gradAngle,
    },
  }),
  fog: (params) => ({ effect: 'colorOverlay', params: { mode: 'haze', amount: params.fog, color: params.fogColor } }),
};

/** Schema 9 -> 10: one Color Overlay effect with tint, gradient, and haze styles */
export function migrateV9ToV10(raw: StoredDocument): StoredDocument {
  return migrateEffectEntries(raw, 10, MIGRATIONS);
}

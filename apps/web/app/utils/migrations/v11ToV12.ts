import { type EffectEntryMigration, migrateEffectEntries, type StoredDocument } from './shared';

/** Frozen: schema-11 effects and how each becomes Glow (bloom, neon) and Rays (beams, speed lines) effects with a style mode. */
const MIGRATIONS: Readonly<Record<string, EffectEntryMigration>> = {
  bloom: (params) => ({ effect: 'glow', params: { mode: 'bloom', amount: params.bloom } }),
  neonGlow: (params) => ({
    effect: 'glow',
    params: { mode: 'neon', amount: params.neonGlow, color: params.neonColor },
  }),
  rays: (params) => ({ effect: 'rays', params: { ...params, mode: 'beams' } }),
  speedLines: (params) => ({ effect: 'rays', params: { ...params, mode: 'lines' } }),
};

/** Schema 11 -> 12: Glow (bloom, neon) and Rays (beams, speed lines) effects with a style mode */
export function migrateV11ToV12(raw: StoredDocument): StoredDocument {
  return migrateEffectEntries(raw, 12, MIGRATIONS);
}

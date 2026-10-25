import { type EffectEntryMigration, migrateEffectEntries, type StoredDocument } from './shared';

/** Frozen: schema-14 effects and how each becomes Displace (noise, liquid, wave, ripple, pattern), Lens (barrel, swirl, squeeze), and Symmetry (mirror, kaleidoscope) effects. */
const MIGRATIONS: Readonly<Record<string, EffectEntryMigration>> = {
  noiseWarp: (params) => ({ effect: 'displace', params: { ...params, mode: 'noise' } }),
  morph: (params) => ({ effect: 'displace', params: { ...params, mode: 'liquid' } }),
  wave: (params) => ({ effect: 'displace', params: { ...params, mode: 'wave' } }),
  ripple: (params) => ({ effect: 'displace', params: { ...params, mode: 'ripple' } }),
  patternRefraction: (params) => ({ effect: 'displace', params: { ...params, mode: 'pattern' } }),
  barrel: (params) => ({ effect: 'lens', params: { ...params, mode: 'barrel' } }),
  vortex: (params) => ({ effect: 'lens', params: { ...params, mode: 'swirl' } }),
  squeeze: (params) => ({ effect: 'lens', params: { ...params, mode: 'squeeze' } }),
  mirror: (params) => ({ effect: 'symmetry', params: { ...params, mode: 'mirror' } }),
  kaleidoscope: (params) => ({ effect: 'symmetry', params: { ...params, mode: 'kaleidoscope' } }),
};

/** Schema 14 -> 15: Displace (noise, liquid, wave, ripple, pattern), Lens (barrel, swirl, squeeze), and Symmetry (mirror, kaleidoscope) effects */
export function migrateV14ToV15(raw: StoredDocument): StoredDocument {
  return migrateEffectEntries(raw, 15, MIGRATIONS);
}

import { type EffectEntryMigration, migrateEffectEntries, type StoredDocument } from './shared';

/** Frozen: schema-10 effects and how each becomes one Posterize effect with levels, dither, linocut, threshold, and palette styles. */
const MIGRATIONS: Readonly<Record<string, EffectEntryMigration>> = {
  posterize: (params) => ({ effect: 'posterize', params: { ...params, mode: 'levels' } }),
  dither: (params) => ({ effect: 'posterize', params: { ...params, mode: 'dither' } }),
  linocut: (params) => ({ effect: 'posterize', params: { ...params, mode: 'linocut' } }),
  threshold: (params) => ({ effect: 'posterize', params: { ...params, mode: 'threshold' } }),
  indexedPalette: (params) => ({ effect: 'posterize', params: { ...params, mode: 'palette' } }),
};

/** Schema 10 -> 11: one Posterize effect with levels, dither, linocut, threshold, and palette styles */
export function migrateV10ToV11(raw: StoredDocument): StoredDocument {
  return migrateEffectEntries(raw, 11, MIGRATIONS);
}

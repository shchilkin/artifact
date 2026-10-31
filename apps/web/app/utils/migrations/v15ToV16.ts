import { type EffectEntryMigration, migrateEffectEntries, type StoredDocument } from './shared';

/** Frozen: schema-15 effects and how each becomes Blur (soft, lens, zoom, motion), Pixelate (blocks, retro resolution), and Alpha Crush (harden, chip) effects. */
const MIGRATIONS: Readonly<Record<string, EffectEntryMigration>> = {
  blur: (params) => ({ effect: 'blur', params: { ...params, mode: 'gaussian' } }),
  bokehBlur: (params) => ({ effect: 'blur', params: { ...params, mode: 'lens' } }),
  zoomBlur: (params) => ({ effect: 'blur', params: { ...params, mode: 'zoom' } }),
  pixelStretch: (params) => ({ effect: 'blur', params: { ...params, mode: 'motion' } }),
  pixelate: (params) => ({ effect: 'pixelate', params: { ...params, mode: 'blocks' } }),
  retroResolution: (params) => ({ effect: 'pixelate', params: { ...params, mode: 'retro' } }),
  edgeCrush: (params) => ({ effect: 'alphaCrush', params: { mode: 'harden', amount: params.edgeCrush } }),
  silhouetteCrush: (params) => ({ effect: 'alphaCrush', params: { mode: 'chip', amount: params.silhouetteCrush } }),
};

/** Schema 15 -> 16: Blur (soft, lens, zoom, motion), Pixelate (blocks, retro resolution), and Alpha Crush (harden, chip) effects */
export function migrateV15ToV16(raw: StoredDocument): StoredDocument {
  return migrateEffectEntries(raw, 16, MIGRATIONS);
}

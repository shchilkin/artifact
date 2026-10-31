import { type EffectEntryMigration, migrateEffectEntries, type StoredDocument } from './shared';

/** Frozen: schema-12 effects and how each becomes Grain (fine, coarse), Halftone (dots, lines, stipple), and Edges (emboss, outline) effects with a mode. */
const MIGRATIONS: Readonly<Record<string, EffectEntryMigration>> = {
  grain: (params) => ({ effect: 'grain', params: { mode: 'fine', amount: params.grain } }),
  matte: (params) => ({ effect: 'grain', params: { mode: 'coarse', amount: params.matte } }),
  halftone: (params) => ({ effect: 'halftone', params: { ...params, mode: 'dots' } }),
  hatching: (params) => ({ effect: 'halftone', params: { ...params, mode: 'lines' } }),
  dotGrain: (params) => ({ effect: 'halftone', params: { ...params, mode: 'stochastic' } }),
  emboss: (params) => ({ effect: 'edges', params: { mode: 'emboss', amount: params.emboss } }),
  edgeDetect: (params) => ({ effect: 'edges', params: { mode: 'outline', amount: params.edgeDetect } }),
};

/** Schema 12 -> 13: Grain (fine, coarse), Halftone (dots, lines, stipple), and Edges (emboss, outline) effects with a mode */
export function migrateV12ToV13(raw: StoredDocument): StoredDocument {
  return migrateEffectEntries(raw, 13, MIGRATIONS);
}

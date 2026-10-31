import { type EffectEntryMigration, migrateEffectEntries, type StoredDocument } from './shared';

/** Frozen: schema-13 effects and how each becomes Channel Split (diagonal, radial), Line Glitch (streaks, tear, interlace, tracking), and Compression (bad stream, data mosh) effects. */
const MIGRATIONS: Readonly<Record<string, EffectEntryMigration>> = {
  rgbSplit: (params) => ({ effect: 'channelSplit', params: { mode: 'linear', amount: params.rgbSplit } }),
  ca: (params) => ({ effect: 'channelSplit', params: { mode: 'radial', amount: params.ca } }),
  glitch: (params) => ({ effect: 'lineGlitch', params: { ...params, mode: 'streaks' } }),
  tear: (params) => ({ effect: 'lineGlitch', params: { ...params, mode: 'tear' } }),
  interlace: (params) => ({ effect: 'lineGlitch', params: { ...params, mode: 'interlace' } }),
  vhsTracking: (params) => ({ effect: 'lineGlitch', params: { ...params, mode: 'tracking' } }),
  badStream: (params) => ({ effect: 'compression', params: { ...params, mode: 'codec' } }),
  dataMosh: (params) => ({ effect: 'compression', params: { ...params, mode: 'blocks' } }),
};

/** Schema 13 -> 14: Channel Split (diagonal, radial), Line Glitch (streaks, tear, interlace, tracking), and Compression (bad stream, data mosh) effects */
export function migrateV13ToV14(raw: StoredDocument): StoredDocument {
  return migrateEffectEntries(raw, 14, MIGRATIONS);
}

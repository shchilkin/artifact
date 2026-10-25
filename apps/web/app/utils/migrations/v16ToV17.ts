import { type EffectEntryMigration, migrateEffectEntries, type StoredDocument } from './shared';

/** Frozen: schema-16 effects and how each becomes Hue Shift becomes the Hue control of the new Adjust effect. */
const MIGRATIONS: Readonly<Record<string, EffectEntryMigration>> = {
  hueShift: (params) => ({ effect: 'adjust', params: { hue: params.hueShift } }),
};

/** Schema 16 -> 17: Hue Shift becomes the Hue control of the new Adjust effect */
export function migrateV16ToV17(raw: StoredDocument): StoredDocument {
  return migrateEffectEntries(raw, 17, MIGRATIONS);
}

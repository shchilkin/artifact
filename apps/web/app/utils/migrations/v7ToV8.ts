import { type EffectEntryMigration, migrateEffectEntries, type StoredDocument } from './shared';

/** Frozen: schema-7 effects and how each becomes one Color Filter effect with a look mode. */
const MIGRATIONS: Readonly<Record<string, EffectEntryMigration>> = {
  sepia: (params) => ({ effect: 'colorFilter', params: { mode: 'sepia', amount: params.sepia } }),
  infrared: (params) => ({ effect: 'colorFilter', params: { mode: 'infrared', amount: params.infrared } }),
  bleachBypass: (params) => ({ effect: 'colorFilter', params: { mode: 'bleach', amount: params.bleachBypass } }),
  solarize: (params) => ({ effect: 'colorFilter', params: { mode: 'solarize', amount: params.solarize } }),
  cyanotype: (params) => ({ effect: 'colorFilter', params: { mode: 'cyanotype', amount: params.cyanotype } }),
  channelMixer: (params) => ({
    effect: 'colorFilter',
    params: {
      mode: 'mixer',
      amount: params.channelMixer,
      channelRedMix: params.channelRedMix,
      channelGreenMix: params.channelGreenMix,
      channelBlueMix: params.channelBlueMix,
    },
  }),
};

/** Schema 7 -> 8: one Color Filter effect with a look mode */
export function migrateV7ToV8(raw: StoredDocument): StoredDocument {
  return migrateEffectEntries(raw, 8, MIGRATIONS);
}

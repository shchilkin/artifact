import { type EffectEntryMigration, migrateEffectEntries, type StoredDocument } from './shared';

/** Frozen: schema-8 effects and how each becomes one Gradient Map effect with two-color, three-color, and split-tone stops. */
const MIGRATIONS: Readonly<Record<string, EffectEntryMigration>> = {
  duotone: (params) => ({
    effect: 'gradientMap',
    params: { mode: 'duo', amount: params.duotone, shadow: params.duoA, highlight: params.duoB },
  }),
  gradientMap: (params) => ({
    effect: 'gradientMap',
    params: {
      mode: 'tri',
      amount: params.gradientMap,
      shadow: params.gradientMapShadow,
      mid: params.gradientMapMid,
      highlight: params.gradientMapHighlight,
    },
  }),
  splitTone: (params) => ({
    effect: 'gradientMap',
    params: {
      mode: 'split',
      amount: params.splitToneAmt,
      shadow: params.splitShadow,
      highlight: params.splitHighlight,
    },
  }),
};

/** Schema 8 -> 9: one Gradient Map effect with two-color, three-color, and split-tone stops */
export function migrateV8ToV9(raw: StoredDocument): StoredDocument {
  return migrateEffectEntries(raw, 9, MIGRATIONS);
}

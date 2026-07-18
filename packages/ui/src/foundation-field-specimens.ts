export const FIELD_FOUNDATION_SPECIMEN_IDS = [
  'input-default',
  'input-focus',
  'input-error',
  'input-disabled',
  'input-readonly',
  'textarea-default',
  'textarea-error',
  'textarea-disabled',
  'textarea-readonly',
  'native-select-default',
  'native-select-error',
  'native-select-disabled',
] as const;

export type FieldFoundationSpecimenId = (typeof FIELD_FOUNDATION_SPECIMEN_IDS)[number];

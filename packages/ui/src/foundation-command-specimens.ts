export const COMMAND_FOUNDATION_SPECIMEN_IDS = [
  'button-primary',
  'button-secondary',
  'button-quiet',
  'button-danger',
  'button-danger-filled',
  'button-active',
  'button-disabled',
  'button-loading',
  'button-busy-label',
  'button-link-primary',
  'button-link-disabled',
  'icon-button-default',
  'icon-button-primary',
  'icon-button-danger',
  'icon-button-disabled',
] as const;

export type CommandFoundationSpecimenId = (typeof COMMAND_FOUNDATION_SPECIMEN_IDS)[number];

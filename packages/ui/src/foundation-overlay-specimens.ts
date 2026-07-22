export const OVERLAY_FOUNDATION_SPECIMEN_IDS = [
  'tooltip-closed',
  'tooltip-open',
  'tooltip-keyboard',
  'tooltip-long-content',
  'popover-closed',
  'popover-open',
  'popover-keyboard',
  'popover-long-content',
] as const;

export type OverlayFoundationSpecimenId = (typeof OVERLAY_FOUNDATION_SPECIMEN_IDS)[number];

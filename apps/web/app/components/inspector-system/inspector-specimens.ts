export const INSPECTOR_SPECIMEN_IDS = {
  ordinary: 'ordinary',
  dense: 'dense',
} as const;

export type InspectorSpecimenId = (typeof INSPECTOR_SPECIMEN_IDS)[keyof typeof INSPECTOR_SPECIMEN_IDS];

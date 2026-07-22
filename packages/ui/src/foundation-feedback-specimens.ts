export const FEEDBACK_FOUNDATION_SPECIMEN_IDS = [
  'notice-info',
  'notice-success',
  'notice-warning',
  'notice-danger',
  'skeleton-line',
  'skeleton-block',
  'progress-indeterminate',
  'progress-determinate',
] as const;

export type FeedbackFoundationSpecimenId = (typeof FEEDBACK_FOUNDATION_SPECIMEN_IDS)[number];

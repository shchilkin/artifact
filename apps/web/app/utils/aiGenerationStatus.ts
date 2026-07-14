import type { ImageAiGenerationMetadata } from '../types/config';

export type AiGenerationUiState = 'loading' | 'failed' | 'done' | 'idle';

const LOADING_GENERATION_STATUSES = new Set(['queued', 'running', 'importing']);
const FAILED_GENERATION_STATUSES = new Set(['failed', 'cancelled', 'expired']);
const GENERATION_STATUS_LABELS: Record<string, string> = {
  queued: 'Waiting',
  running: 'Generating',
  importing: 'Finishing',
  failed: 'Failed',
  cancelled: 'Cancelled',
  expired: 'Expired',
};
const GENERATION_STATUS_DETAILS: Record<string, string> = {
  queued: 'Your creation will start shortly',
  running: 'Creating your image',
  importing: 'Preparing your image',
  cancelled: 'Creation was cancelled',
  expired: 'This creation is no longer available',
};

export function getAiGenerationUiState(generation: ImageAiGenerationMetadata | undefined): AiGenerationUiState {
  const status = generation?.status;
  if (!status) return generation?.prompt ? 'done' : 'idle';
  if (LOADING_GENERATION_STATUSES.has(status)) return 'loading';
  if (FAILED_GENERATION_STATUSES.has(status)) return 'failed';
  return 'done';
}

export function getAiGenerationStatusLabel(generation: ImageAiGenerationMetadata | undefined) {
  const status = generation?.status;
  if (!status) return null;
  return GENERATION_STATUS_LABELS[status] ?? 'Ready';
}

export function getAiGenerationStatusDetail(generation: ImageAiGenerationMetadata | undefined) {
  if (!generation) return null;
  if (generation.errorMessage) return generation.errorMessage;
  return GENERATION_STATUS_DETAILS[generation.status ?? ''] ?? generation.prompt;
}

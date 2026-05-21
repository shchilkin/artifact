import type { ImageAiGenerationMetadata } from '../types/config';

export type AiGenerationUiState = 'loading' | 'failed' | 'done' | 'idle';

export function getAiGenerationUiState(generation: ImageAiGenerationMetadata | undefined): AiGenerationUiState {
  if (!generation?.status) return generation?.prompt ? 'done' : 'idle';
  if (generation.status === 'queued' || generation.status === 'running' || generation.status === 'importing') {
    return 'loading';
  }
  if (generation.status === 'failed' || generation.status === 'cancelled' || generation.status === 'expired') {
    return 'failed';
  }
  return 'done';
}

export function getAiGenerationStatusLabel(generation: ImageAiGenerationMetadata | undefined) {
  if (!generation?.status) return null;
  if (generation.status === 'queued') return 'Queued';
  if (generation.status === 'running') return 'Generating';
  if (generation.status === 'importing') return 'Importing';
  if (generation.status === 'failed') return 'Failed';
  if (generation.status === 'cancelled') return 'Cancelled';
  if (generation.status === 'expired') return 'Expired';
  return 'Ready';
}

export function getAiGenerationStatusDetail(generation: ImageAiGenerationMetadata | undefined) {
  if (!generation) return null;
  if (generation.errorMessage) return generation.errorMessage;
  if (generation.status === 'queued') return 'Waiting for worker';
  if (generation.status === 'running') return 'Image job is running';
  if (generation.status === 'importing') return 'Saving generated asset';
  if (generation.status === 'cancelled') return 'Generation was cancelled';
  if (generation.status === 'expired') return 'Generation expired';
  return generation.prompt;
}

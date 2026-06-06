import { describe, expect, it } from 'vitest';
import type { ImageAiGenerationMetadata } from '../types/config';
import { getAiGenerationStatusDetail, getAiGenerationStatusLabel, getAiGenerationUiState } from './aiGenerationStatus';

function generation(status: ImageAiGenerationMetadata['status'], extra: Partial<ImageAiGenerationMetadata> = {}) {
  return { prompt: 'cover art', status, ...extra } as ImageAiGenerationMetadata;
}

describe('aiGenerationStatus', () => {
  it('maps loading, failed, done, and idle UI states', () => {
    expect(getAiGenerationUiState(undefined)).toBe('idle');
    expect(getAiGenerationUiState({ prompt: 'cover art' } as ImageAiGenerationMetadata)).toBe('done');
    expect(getAiGenerationUiState(generation('queued'))).toBe('loading');
    expect(getAiGenerationUiState(generation('running'))).toBe('loading');
    expect(getAiGenerationUiState(generation('importing'))).toBe('loading');
    expect(getAiGenerationUiState(generation('failed'))).toBe('failed');
    expect(getAiGenerationUiState(generation('cancelled'))).toBe('failed');
    expect(getAiGenerationUiState(generation('expired'))).toBe('failed');
    expect(getAiGenerationUiState(generation('succeeded'))).toBe('done');
  });

  it('maps status labels and details with error messages taking priority', () => {
    expect(getAiGenerationStatusLabel(undefined)).toBeNull();
    expect(getAiGenerationStatusLabel(generation('running'))).toBe('Generating');
    expect(getAiGenerationStatusLabel(generation('succeeded'))).toBe('Ready');
    expect(getAiGenerationStatusDetail(undefined)).toBeNull();
    expect(getAiGenerationStatusDetail(generation('queued'))).toBe('Waiting for worker');
    expect(getAiGenerationStatusDetail(generation('failed', { errorMessage: 'provider unavailable' }))).toBe(
      'provider unavailable',
    );
    expect(getAiGenerationStatusDetail(generation('succeeded'))).toBe('cover art');
  });
});

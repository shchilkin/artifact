import { describe, expect, it } from 'vitest';
import { AiGenerationApiError } from '../../../utils/aiGenerationClient';
import { shaderGenerationError } from './aiShaderGenerationMessages';

describe('AI shader generation messages', () => {
  it('classifies an occupied account operation as blocked rather than failed', () => {
    const error = new AiGenerationApiError('Operation in progress.', 409, 'operation_in_progress');

    expect(shaderGenerationError(error, 'openai')).toEqual({
      message: 'Another AI creation is still running. Wait for it to finish, then try again.',
      offerFallback: false,
      blocked: true,
    });
  });
});

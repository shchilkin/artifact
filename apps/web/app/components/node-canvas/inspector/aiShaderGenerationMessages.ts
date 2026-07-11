import {
  AI_SHADER_PROMPT_MAX_LENGTH,
  type AiShaderGenerationResponse,
  type AiShaderRequestMode,
} from '../../../types/aiGeneration';
import { AiGenerationApiError } from '../../../utils/aiGenerationClient';

interface ShaderGenerationFailureMessage {
  message: string;
  offerFallback: boolean;
}

type ErrorMessageFactory = (mode: AiShaderRequestMode) => ShaderGenerationFailureMessage;

const fixedFailure =
  (message: string, offerFallback = false): ErrorMessageFactory =>
  () => ({
    message,
    offerFallback,
  });

const SHADER_ERROR_MESSAGES: Record<string, ErrorMessageFactory> = {
  unauthenticated: fixedFailure('Sign in, then try again.'),
  unauthorized: fixedFailure('Sign in, then try again.'),
  missing_auth: fixedFailure('Sign in, then try again.'),
  not_enabled: fixedFailure('AI creation is not available for this account.'),
  ai_disabled: fixedFailure('AI creation is not available for this account.'),
  provider_disabled: fixedFailure('AI creation is not available for this account.'),
  shader_provider_unavailable: fixedFailure(
    'AI creation is not connected here. Try again after setup, or make a local version.',
    true,
  ),
  invalid_prompt: fixedFailure('Add a little more detail to the prompt.'),
  prompt_too_short: fixedFailure('Add a little more detail to the prompt.'),
  prompt_too_long: fixedFailure(`Shorten the prompt to ${AI_SHADER_PROMPT_MAX_LENGTH} characters or fewer.`),
  rate_limited: fixedFailure('Too many requests. Wait a moment, then try again.'),
  quota_exceeded: fixedFailure('The monthly AI creation limit has been reached.'),
  shader_provider_timeout: fixedFailure('Creation took too long. Try again.', true),
  shader_request_in_progress: fixedFailure('This shader is already being created. Wait a moment, then try again.'),
  invalid_response: fixedFailure('Creation returned an incomplete result. Try again.', true),
  invalid_shader: fixedFailure('Creation returned an incomplete result. Try again.', true),
  shader_provider_failed: providerFailure,
  provider_failed: providerFailure,
  invalid_fallback_reference: fixedFailure('Try creating with AI again before making a local draft.'),
  fallback_not_available: fixedFailure('Try creating with AI again before making a local draft.'),
};

export function shaderGenerationError(error: unknown, mode: AiShaderRequestMode): ShaderGenerationFailureMessage {
  if (!(error instanceof AiGenerationApiError)) return unknownFailure(mode);
  const factory = error.code ? SHADER_ERROR_MESSAGES[error.code] : undefined;
  return factory ? factory(mode) : statusFailure(error.status);
}

function providerFailure(mode: AiShaderRequestMode): ShaderGenerationFailureMessage {
  return mode === 'openai'
    ? {
        message: 'Could not create this shader. Try again, or make a local draft from the same prompt.',
        offerFallback: true,
      }
    : { message: 'The local version could not be created. Try a simpler prompt.', offerFallback: false };
}

function statusFailure(status: number): ShaderGenerationFailureMessage {
  return status >= 500
    ? { message: 'Could not create this shader right now. Try again.', offerFallback: true }
    : { message: 'Check the prompt and try again.', offerFallback: false };
}

function unknownFailure(mode: AiShaderRequestMode): ShaderGenerationFailureMessage {
  return mode === 'openai'
    ? { message: 'Could not create this shader. Try again.', offerFallback: false }
    : { message: 'The local version could not be created. Try again.', offerFallback: false };
}

export function browserValidationFailureMessage(mode: AiShaderRequestMode, repaired: boolean) {
  if (mode === 'localFallback') return 'The local draft did not work in this browser. Try a different prompt.';
  return repaired
    ? 'The repaired result still did not work in this browser. Your previous shader was kept.'
    : 'The result did not work in this browser. Your previous shader was kept.';
}

export function shaderRepairError(error: unknown) {
  if (error instanceof AiGenerationApiError && error.code === 'shader_provider_timeout') {
    return 'Repair took too long. Your previous shader was kept.';
  }
  return 'The result could not be repaired. Your previous shader was kept.';
}

export function shaderGenerationSuccessMessage(
  attempt: AiShaderGenerationResponse['attempt'],
  source: AiShaderGenerationResponse['source'],
) {
  const attemptMessages: Partial<Record<AiShaderGenerationResponse['attempt'], string>> = {
    repair: 'Created with AI and repaired for this browser. You can tune it below.',
    refineRepair: 'Created with AI and repaired for this browser. You can tune it below.',
    refine: 'Refined the current shader. The previous version stayed active until this one passed.',
  };
  const sourceMessages: Record<AiShaderGenerationResponse['source'], string> = {
    localFallback: 'Made a local draft from this prompt. It stays labeled as local.',
    openai: 'Made an editable shader from this prompt. You can tune it below.',
  };
  return attemptMessages[attempt] ?? sourceMessages[source];
}

export type {
  AiAccessResponse,
  AiErrorResponse,
  AiGenerationAssetResponse,
  AiGenerationJobResponse,
  AiGenerationSettings,
  AiProvider,
  AiQuotaSnapshot,
  AiShaderSpecGenerationResponse,
  AiShaderSpecRequestMode,
  AiShaderSpecSource,
  ApiHealthResponse,
  CreateAiShaderSpecRequest,
  CreateGenerationRequest,
  CustomShaderOperation,
  CustomShaderSpec,
  GenerationQueuePayload,
} from '@artifact/shared';

export {
  AI_API_PATHS,
  AI_PROVIDERS,
  AI_SHADER_PROMPT_MAX_LENGTH,
  normalizeCustomShaderSpec,
  validateCustomShaderSpec,
} from '@artifact/shared';

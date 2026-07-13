import type { AiGenerationSettings, AiProvider } from '../contracts.js';
import type { ProviderUsageMetrics } from '../db/types.js';

export interface ImageGenerationRequest {
  jobId: string;
  userId: string;
  provider: AiProvider;
  model: string;
  prompt: string;
  settings: AiGenerationSettings;
}

export interface ImageGenerationResult {
  provider: AiProvider;
  model: string;
  mimeType: string;
  bytes: Uint8Array;
  width: number;
  height: number;
  usage?: {
    estimatedCostUsd?: number;
    providerRequestId?: string;
    metrics: ProviderUsageMetrics;
    metadata?: Record<string, unknown>;
  };
  raw?: unknown;
}

export interface ImageGenerationProvider {
  readonly provider: AiProvider;
  readonly defaultModel: string;
  generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResult>;
}

export interface ProviderRegistry {
  get(provider: AiProvider): ImageGenerationProvider;
  list(): readonly ImageGenerationProvider[];
}

export function createProviderRegistry(providers: readonly ImageGenerationProvider[]): ProviderRegistry {
  const adapters = new Map<AiProvider, ImageGenerationProvider>();

  for (const provider of providers) {
    if (adapters.has(provider.provider)) {
      throw new Error(`Duplicate provider adapter registered: ${provider.provider}`);
    }
    adapters.set(provider.provider, provider);
  }

  return {
    get(provider) {
      const adapter = adapters.get(provider);
      if (!adapter) throw new Error(`No provider adapter registered for ${provider}`);
      return adapter;
    },
    list() {
      return Array.from(adapters.values());
    },
  };
}

export { createMockImageProvider } from './mock.js';
export { createOpenAiImageProvider } from './openai.js';
export {
  createOpenAiShaderProvider,
  isOpenAiShaderTimeoutError,
  OpenAiShaderResponseError,
  OpenAiShaderTimeoutError,
  type ShaderGenerationProvider,
  type ShaderGenerationResult,
} from './openaiShader.js';
export { createXAiImageProvider } from './xai.js';

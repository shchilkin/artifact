import type { AspectRatio } from './config';

export const AI_GENERATION_PROVIDERS = ['openai', 'xai'] as const;
export type AiGenerationProvider = (typeof AI_GENERATION_PROVIDERS)[number];

export const AI_GENERATION_JOB_STATUSES = ['queued', 'running', 'succeeded', 'failed', 'cancelled', 'expired'] as const;
export type AiGenerationJobStatus = (typeof AI_GENERATION_JOB_STATUSES)[number];

export type AiGenerationQuality = 'draft' | 'standard' | 'high';

export interface AiGenerationSettings {
  aspect: AspectRatio;
  quality: AiGenerationQuality;
  stylePreset?: string;
  negativePrompt?: string;
  sourceAssetId?: string;
}

export interface CreateAiGenerationRequest {
  prompt: string;
  provider?: AiGenerationProvider;
  model?: string;
  settings: AiGenerationSettings;
  idempotencyKey: string;
}

export interface AiGenerationAsset {
  id: string;
  uri: string;
  mimeType: string;
  width: number;
  height: number;
  sizeBytes: number;
  createdAt: string;
  metadata: AiGeneratedAssetMetadata;
}

export interface AiGeneratedAssetMetadata {
  provider: AiGenerationProvider;
  model: string;
  prompt: string;
  negativePrompt?: string;
  settings: AiGenerationSettings;
  seed?: string | number;
  sourceAssetIds?: string[];
  licenseNote?: string;
  createdAt: string;
}

export interface AiGenerationQuotaSnapshot {
  period: string;
  limit: number;
  used: number;
  remaining: number;
}

export interface AiGenerationJobError {
  code: string;
  message: string;
  retryable?: boolean;
}

export interface AiGenerationJob {
  id: string;
  status: AiGenerationJobStatus;
  provider: AiGenerationProvider;
  model: string;
  prompt: string;
  settings: AiGenerationSettings;
  asset?: AiGenerationAsset;
  quota?: AiGenerationQuotaSnapshot;
  error?: AiGenerationJobError;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface AiGenerationAccessState {
  authenticated: boolean;
  enabled: boolean;
  disabledReason?: 'anonymous' | 'invalid_session' | 'not_enabled' | 'quota_exhausted' | 'maintenance';
  user?: {
    id: string;
    email?: string;
    role?: string;
  };
  quota?: AiGenerationQuotaSnapshot;
  providers?: AiGenerationProvider[];
}

export function isAiGenerationProvider(value: unknown): value is AiGenerationProvider {
  return typeof value === 'string' && AI_GENERATION_PROVIDERS.includes(value as AiGenerationProvider);
}

export function isAiGenerationJobStatus(value: unknown): value is AiGenerationJobStatus {
  return typeof value === 'string' && AI_GENERATION_JOB_STATUSES.includes(value as AiGenerationJobStatus);
}

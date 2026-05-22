export const AI_API_PATHS = {
  health: '/api/health',
  access: '/api/ai/access',
  generations: '/api/ai/generations',
  generation: (id: string) => `/api/ai/generations/${encodeURIComponent(id)}`,
  generationCancel: (id: string) => `/api/ai/generations/${encodeURIComponent(id)}/cancel`,
  assetFile: (id: string) => `/api/assets/${encodeURIComponent(id)}/file`,
} as const;

export const AI_GENERATION_PROVIDERS = ['openai', 'xai'] as const;
export type AiGenerationProvider = (typeof AI_GENERATION_PROVIDERS)[number];

export const AI_GENERATION_JOB_STATUSES = ['queued', 'running', 'succeeded', 'failed', 'cancelled', 'expired'] as const;
export type AiGenerationJobStatus = (typeof AI_GENERATION_JOB_STATUSES)[number];

export const AI_GENERATION_QUALITIES = ['draft', 'standard', 'high'] as const;
export type AiGenerationQuality = (typeof AI_GENERATION_QUALITIES)[number];

export const AI_GENERATION_ASPECT_RATIOS = ['1:1', '4:5', '9:16', '16:9'] as const;
export type AiGenerationAspectRatio = (typeof AI_GENERATION_ASPECT_RATIOS)[number];

export interface AiGenerationSettings {
  aspect: AiGenerationAspectRatio;
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

export interface AiErrorResponse {
  code: string;
  message: string;
}

export interface ApiHealthResponse {
  ok: true;
  service: 'artifact-api';
  databaseDriver: 'memory' | 'postgres';
  queueDriver: 'memory' | 'bullmq';
  storageDriver: 'local' | 's3';
  providers: AiGenerationProvider[];
  bullBoardEnabled: boolean;
}

export interface GenerationQueuePayload {
  jobId: string;
  userId: string;
}

export type AiProvider = AiGenerationProvider;
export type AiJobStatus = AiGenerationJobStatus;
export type AiQuotaSnapshot = AiGenerationQuotaSnapshot;
export type CreateGenerationRequest = CreateAiGenerationRequest;
export type AiGenerationAssetResponse = AiGenerationAsset;
export type AiGenerationJobResponse = AiGenerationJob;
export type AiAccessResponse = AiGenerationAccessState;

export const AI_PROVIDERS = AI_GENERATION_PROVIDERS;
export const AI_JOB_STATUSES = AI_GENERATION_JOB_STATUSES;

export function isAiGenerationProvider(value: unknown): value is AiGenerationProvider {
  return typeof value === 'string' && AI_GENERATION_PROVIDERS.includes(value as AiGenerationProvider);
}

export function isAiGenerationJobStatus(value: unknown): value is AiGenerationJobStatus {
  return typeof value === 'string' && AI_GENERATION_JOB_STATUSES.includes(value as AiGenerationJobStatus);
}

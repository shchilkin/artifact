export const AI_API_PATHS = {
  health: '/api/health',
  access: '/api/ai/access',
  generations: '/api/ai/generations',
  generation: (id: string) => `/api/ai/generations/${encodeURIComponent(id)}`,
  generationCancel: (id: string) => `/api/ai/generations/${encodeURIComponent(id)}/cancel`,
  assetFile: (id: string) => `/api/assets/${encodeURIComponent(id)}/file`,
} as const;

export const AI_JOB_STATUSES = ['queued', 'running', 'succeeded', 'failed', 'cancelled', 'expired'] as const;
export type AiJobStatus = (typeof AI_JOB_STATUSES)[number];

export const AI_PROVIDERS = ['openai', 'xai'] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

export interface AiQuotaSnapshot {
  period: string;
  limit: number;
  used: number;
  remaining: number;
}

export interface AiGenerationSettings {
  aspect: '1:1' | '4:5' | '9:16' | '16:9';
  quality: 'draft' | 'standard' | 'high';
  stylePreset?: string;
  negativePrompt?: string;
  sourceAssetId?: string;
}

export interface CreateGenerationRequest {
  prompt: string;
  provider?: AiProvider;
  model?: string;
  settings: AiGenerationSettings;
  idempotencyKey: string;
}

export interface AiGeneratedAssetMetadata {
  provider: AiProvider;
  model: string;
  prompt: string;
  negativePrompt?: string;
  settings: AiGenerationSettings;
  seed?: string | number;
  sourceAssetIds?: string[];
  licenseNote?: string;
  createdAt: string;
}

export interface AiGenerationAssetResponse {
  id: string;
  uri: string;
  mimeType: string;
  width: number;
  height: number;
  sizeBytes: number;
  createdAt: string;
  metadata: AiGeneratedAssetMetadata;
}

export interface AiGenerationJobError {
  code: string;
  message: string;
  retryable?: boolean;
}

export interface AiGenerationJobResponse {
  id: string;
  status: AiJobStatus;
  provider: AiProvider;
  model: string;
  prompt: string;
  settings: AiGenerationSettings;
  asset?: AiGenerationAssetResponse;
  quota?: AiQuotaSnapshot;
  error?: AiGenerationJobError;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface AiAccessResponse {
  authenticated: boolean;
  enabled: boolean;
  disabledReason?: 'anonymous' | 'not_enabled' | 'quota_exhausted' | 'maintenance';
  user?: {
    id: string;
    email?: string;
    role?: string;
  };
  quota?: AiQuotaSnapshot;
  providers?: AiProvider[];
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
  providers: AiProvider[];
  bullBoardEnabled: boolean;
}

export interface GenerationQueuePayload {
  jobId: string;
  userId: string;
}

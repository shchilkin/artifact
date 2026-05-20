export const AI_API_PATHS = {
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

export interface GenerationQueuePayload {
  jobId: string;
  userId: string;
}

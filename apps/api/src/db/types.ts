export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export type DbTimestamp = Date;
export type DbNumeric = string;

export type UserRole = 'user' | 'admin' | 'operator' | string;
export type PlusStatus = 'none' | 'active' | 'trialing' | 'past_due' | 'cancelled' | string;
export type AiGenerationJobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'expired';

export interface UserRow {
  id: string;
  email: string;
  role: UserRole;
  ai_enabled: boolean;
  plus_status: PlusStatus;
  created_at: DbTimestamp;
  updated_at: DbTimestamp;
  disabled_at: DbTimestamp | null;
}

export interface AiGenerationSettingsJson {
  [key: string]: JsonValue | undefined;
  aspect?: JsonValue;
  quality?: JsonValue;
  stylePreset?: JsonValue;
  sourceAssetId?: JsonValue;
}

export interface AiGenerationJobRow {
  id: string;
  user_id: string;
  provider: string;
  model: string;
  prompt: string;
  negative_prompt: string | null;
  settings_json: JsonObject;
  idempotency_key: string;
  status: AiGenerationJobStatus;
  output_asset_id: string | null;
  error_code: string | null;
  error_message: string | null;
  retryable: boolean | null;
  attempt_count: number;
  estimated_cost: DbNumeric | null;
  provider_usage_json: JsonObject | null;
  created_at: DbTimestamp;
  queued_at: DbTimestamp;
  started_at: DbTimestamp | null;
  completed_at: DbTimestamp | null;
  cancelled_at: DbTimestamp | null;
  expires_at: DbTimestamp | null;
}

export interface GeneratedAssetMetadata {
  [key: string]: JsonValue | undefined;
  provider?: JsonValue;
  model?: JsonValue;
  prompt?: JsonValue;
  negativePrompt?: JsonValue;
  settings?: JsonValue;
  seed?: JsonValue;
  sourceAssetIds?: JsonValue;
  licenseNote?: JsonValue;
  createdAt?: JsonValue;
}

export interface AssetRow {
  id: string;
  user_id: string;
  kind: string;
  storage_key: string;
  public_uri: string | null;
  mime_type: string;
  width: number;
  height: number;
  size_bytes: number;
  metadata_json: JsonObject;
  created_at: DbTimestamp;
  deleted_at: DbTimestamp | null;
}

export interface AiUsageMonthlyRow {
  user_id: string;
  period: string;
  generation_limit: number;
  generation_count: number;
  estimated_cost: DbNumeric;
  updated_at: DbTimestamp;
}

export interface AiRateLimitEventRow {
  id: string;
  user_id: string | null;
  ip_hash: string | null;
  event_type: string;
  created_at: DbTimestamp;
  metadata_json: JsonObject;
}

export interface CreateUserInput {
  id: string;
  email: string;
  role?: UserRole;
  aiEnabled?: boolean;
  plusStatus?: PlusStatus;
}

export interface CreateAiGenerationJobInput {
  id: string;
  userId: string;
  provider: string;
  model: string;
  prompt: string;
  negativePrompt?: string | null;
  settingsJson: JsonObject;
  idempotencyKey: string;
  expiresAt?: Date | null;
}

export interface CreateAssetInput {
  id: string;
  userId: string;
  kind: string;
  storageKey: string;
  publicUri?: string | null;
  mimeType: string;
  width: number;
  height: number;
  sizeBytes: number;
  metadataJson: JsonObject;
}

export interface UpsertAiUsageMonthlyInput {
  userId: string;
  period: string;
  generationLimit: number;
  generationCountDelta?: number;
  estimatedCostDelta?: DbNumeric;
}

export interface RecordAiRateLimitEventInput {
  id: string;
  userId?: string | null;
  ipHash?: string | null;
  eventType: string;
  metadataJson: JsonObject;
}

export interface UserRepository {
  findById(id: string): Promise<UserRow | null>;
  findByEmail(email: string): Promise<UserRow | null>;
  create(input: CreateUserInput): Promise<UserRow>;
  setAiEnabled(id: string, aiEnabled: boolean): Promise<UserRow>;
}

export interface AiGenerationJobRepository {
  create(input: CreateAiGenerationJobInput): Promise<AiGenerationJobRow>;
  findByIdForUser(id: string, userId: string): Promise<AiGenerationJobRow | null>;
  findByIdempotencyKey(userId: string, idempotencyKey: string): Promise<AiGenerationJobRow | null>;
  markRunning(id: string, startedAt: Date): Promise<AiGenerationJobRow>;
  markSucceeded(id: string, outputAssetId: string, completedAt: Date): Promise<AiGenerationJobRow>;
  markCancelled(id: string, cancelledAt: Date): Promise<AiGenerationJobRow>;
  markFailed(
    id: string,
    error: {
      code: string;
      message: string;
      retryable: boolean;
      providerUsageJson?: JsonObject | null;
      estimatedCost?: DbNumeric | null;
    },
  ): Promise<AiGenerationJobRow>;
}

export interface AssetRepository {
  create(input: CreateAssetInput): Promise<AssetRow>;
  findByIdForUser(id: string, userId: string): Promise<AssetRow | null>;
  softDelete(id: string, userId: string, deletedAt: Date): Promise<AssetRow>;
}

export interface AiUsageRepository {
  findMonthlyUsage(userId: string, period: string): Promise<AiUsageMonthlyRow | null>;
  upsertMonthlyUsage(input: UpsertAiUsageMonthlyInput): Promise<AiUsageMonthlyRow>;
}

export interface AiRateLimitEventRepository {
  record(input: RecordAiRateLimitEventInput): Promise<AiRateLimitEventRow>;
}

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export type DbTimestamp = Date;
export type DbNumeric = string;

export type UserRole = 'user' | 'admin' | 'operator' | string;
export type PlusStatus = 'none' | 'active' | 'trialing' | 'past_due' | 'cancelled' | string;
export type AiGenerationJobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'expired';
export type AiShaderRequestStatus = 'pending' | 'generated' | 'client_rejected' | 'repairing' | 'accepted' | 'failed';

export interface UserRow {
  id: string;
  email: string | null;
  role: UserRole;
  ai_enabled: boolean;
  plus_status: PlusStatus;
  created_at: DbTimestamp;
  updated_at: DbTimestamp;
  disabled_at: DbTimestamp | null;
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

export interface AiShaderRequestRow {
  id: string;
  user_id: string;
  idempotency_key: string;
  mode: 'openai' | 'localFallback';
  prompt: string;
  status: AiShaderRequestStatus;
  response_json: JsonObject | null;
  provider_request_id: string | null;
  provider_usage_json: JsonObject | null;
  error_status: number | null;
  error_code: string | null;
  error_message: string | null;
  compiler_diagnostic_json: JsonObject | null;
  repair_count: number;
  created_at: DbTimestamp;
  completed_at: DbTimestamp | null;
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

export interface CloudProjectRow {
  id: string;
  user_id: string;
  name: string;
  doc_json: JsonObject;
  thumbnail: string | null;
  created_at: DbTimestamp;
  updated_at: DbTimestamp;
}

export interface AiUsageMonthlyRow {
  user_id: string;
  period: string;
  generation_limit: number;
  generation_count: number;
  estimated_cost: DbNumeric;
  updated_at: DbTimestamp;
}

export interface CreateUserInput {
  id: string;
  email?: string | null;
  role?: UserRole;
  aiEnabled?: boolean;
  plusStatus?: PlusStatus;
}

export interface UpsertAuthenticatedUserInput {
  id: string;
  email?: string | null;
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

export interface ClaimAiShaderRequestInput {
  id: string;
  userId: string;
  idempotencyKey: string;
  mode: 'openai' | 'localFallback';
  prompt: string;
}

export interface CompleteAiShaderRequestInput {
  id: string;
  responseJson: JsonObject;
  providerRequestId?: string | null;
  providerUsageJson?: JsonObject | null;
}

export interface RejectAiShaderRequestInput {
  id: string;
  candidateRevision: number;
  diagnosticJson: JsonObject;
  terminal: boolean;
  completedAt: Date;
}

export interface CompleteAiShaderRepairInput extends CompleteAiShaderRequestInput {
  providerUsageJson?: JsonObject | null;
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

export interface UpsertCloudProjectInput {
  id: string;
  userId: string;
  name: string;
  docJson: JsonObject;
  thumbnail?: string | null;
}

export interface UpsertAiUsageMonthlyInput {
  userId: string;
  period: string;
  generationLimit: number;
  generationCountDelta?: number;
  estimatedCostDelta?: DbNumeric;
}

export interface UserRepository {
  findById(id: string): Promise<UserRow | null>;
  findByEmail(email: string): Promise<UserRow | null>;
  create(input: CreateUserInput): Promise<UserRow>;
  upsertFromAuth(input: UpsertAuthenticatedUserInput): Promise<UserRow>;
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

export interface AiShaderRequestRepository {
  claim(input: ClaimAiShaderRequestInput): Promise<{ row: AiShaderRequestRow; claimed: boolean }>;
  findByIdempotencyKey(userId: string, idempotencyKey: string): Promise<AiShaderRequestRow | null>;
  findByIdForUser(id: string, userId: string): Promise<AiShaderRequestRow | null>;
  markGenerated(input: CompleteAiShaderRequestInput): Promise<AiShaderRequestRow>;
  markAccepted(id: string, candidateRevision: number, completedAt: Date): Promise<AiShaderRequestRow>;
  markClientRejected(input: RejectAiShaderRequestInput): Promise<AiShaderRequestRow>;
  beginRepair(id: string): Promise<AiShaderRequestRow>;
  completeRepair(input: CompleteAiShaderRepairInput): Promise<AiShaderRequestRow>;
  markFailed(
    id: string,
    error: { status: number; code: string; message: string; completedAt: Date },
  ): Promise<AiShaderRequestRow>;
}

export interface AssetRepository {
  create(input: CreateAssetInput): Promise<AssetRow>;
  findByIdForUser(id: string, userId: string): Promise<AssetRow | null>;
  findProjectAssetByFingerprintForUser(input: {
    userId: string;
    kind: string;
    mimeType: string;
    sizeBytes: number;
    sha256: string;
  }): Promise<AssetRow | null>;
  listProjectAssetsForUser(userId: string): Promise<AssetRow[]>;
  softDelete(id: string, userId: string, deletedAt: Date): Promise<AssetRow>;
  softDeleteManyForUser(ids: readonly string[], userId: string, deletedAt: Date): Promise<AssetRow[]>;
}

export interface CloudProjectRepository {
  listForUser(userId: string): Promise<CloudProjectRow[]>;
  upsert(input: UpsertCloudProjectInput): Promise<CloudProjectRow>;
  deleteForUser(id: string, userId: string): Promise<boolean>;
}

export interface AiUsageRepository {
  findMonthlyUsage(userId: string, period: string): Promise<AiUsageMonthlyRow | null>;
  upsertMonthlyUsage(input: UpsertAiUsageMonthlyInput): Promise<AiUsageMonthlyRow>;
  reserveMonthlyGeneration(input: {
    userId: string;
    period: string;
    generationLimit: number;
  }): Promise<AiUsageMonthlyRow | null>;
  releaseMonthlyGeneration(userId: string, period: string): Promise<AiUsageMonthlyRow | null>;
}

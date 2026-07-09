import { ActiveGenerationJobExistsError, CloudProjectOwnershipConflictError } from './errors.js';
import type { ApiRepositories } from './repositories.js';
import type {
  AiGenerationJobRow,
  AiShaderSpecRequestRow,
  AiUsageMonthlyRow,
  AssetRow,
  ClaimAiShaderSpecRequestInput,
  CloudProjectRow,
  CompleteAiShaderSpecRequestInput,
  CreateAiGenerationJobInput,
  CreateAssetInput,
  CreateUserInput,
  JsonObject,
  UpsertAuthenticatedUserInput,
  UpsertCloudProjectInput,
  UserRow,
} from './types.js';

export class InMemoryApiStore {
  private readonly users = new Map<string, UserRow>();
  private readonly jobs = new Map<string, AiGenerationJobRow>();
  private readonly shaderSpecs = new Map<string, AiShaderSpecRequestRow>();
  private readonly assets = new Map<string, AssetRow>();
  private readonly projects = new Map<string, CloudProjectRow>();
  private readonly monthlyUsage = new Map<string, AiUsageMonthlyRow>();

  seedUser(input: CreateUserInput): UserRow {
    const existing = this.users.get(input.id);
    if (existing) return existing;
    const now = new Date();
    const row: UserRow = {
      id: input.id,
      email: input.email ?? null,
      role: input.role ?? 'user',
      ai_enabled: input.aiEnabled ?? false,
      plus_status: input.plusStatus ?? 'none',
      created_at: now,
      updated_at: now,
      disabled_at: null,
    };
    this.users.set(row.id, row);
    return row;
  }

  async findById(id: string): Promise<UserRow | null> {
    return this.users.get(id) ?? null;
  }

  async upsertUserFromAuth(input: UpsertAuthenticatedUserInput): Promise<UserRow> {
    const existing = this.users.get(input.id);
    const now = new Date();
    if (existing) {
      const updated: UserRow = {
        ...existing,
        email: input.email ?? existing.email,
        updated_at: now,
      };
      this.users.set(input.id, updated);
      return updated;
    }

    const row: UserRow = {
      id: input.id,
      email: input.email ?? null,
      role: 'user',
      ai_enabled: false,
      plus_status: 'none',
      created_at: now,
      updated_at: now,
      disabled_at: null,
    };
    this.users.set(row.id, row);
    return row;
  }

  async findGenerationJobByIdForUser(id: string, userId: string): Promise<AiGenerationJobRow | null> {
    const job = this.jobs.get(id);
    if (job && job.user_id === userId) return job;
    return null;
  }

  async findAssetByIdForUser(id: string, userId: string): Promise<AssetRow | null> {
    const asset = this.assets.get(id);
    if (asset && asset.user_id === userId) return asset;
    return null;
  }

  async findProjectAssetByFingerprintForUser(input: {
    userId: string;
    kind: string;
    mimeType: string;
    sizeBytes: number;
    sha256: string;
  }): Promise<AssetRow | null> {
    return (
      Array.from(this.assets.values()).find(
        (asset) =>
          asset.user_id === input.userId &&
          asset.kind === input.kind &&
          asset.mime_type === input.mimeType &&
          asset.size_bytes === input.sizeBytes &&
          asset.metadata_json.sha256 === input.sha256 &&
          !asset.deleted_at,
      ) ?? null
    );
  }

  async listProjectAssetsForUser(userId: string): Promise<AssetRow[]> {
    return Array.from(this.assets.values()).filter(
      (asset) => asset.user_id === userId && asset.kind.startsWith('project-') && !asset.deleted_at,
    );
  }

  async softDeleteAsset(id: string, userId: string, deletedAt: Date): Promise<AssetRow> {
    const asset = this.assets.get(id);
    if (!asset || asset.user_id !== userId) throw new Error(`Asset not found: ${id}`);
    const updated = { ...asset, deleted_at: deletedAt };
    this.assets.set(id, updated);
    return updated;
  }

  async softDeleteAssetsForUser(ids: readonly string[], userId: string, deletedAt: Date): Promise<AssetRow[]> {
    const deleted: AssetRow[] = [];
    for (const id of ids) {
      const asset = this.assets.get(id);
      if (!asset || asset.user_id !== userId || !asset.kind.startsWith('project-') || asset.deleted_at) continue;
      const updated = { ...asset, deleted_at: deletedAt };
      this.assets.set(id, updated);
      deleted.push(updated);
    }
    return deleted;
  }

  async findByIdempotencyKey(userId: string, idempotencyKey: string): Promise<AiGenerationJobRow | null> {
    return (
      Array.from(this.jobs.values()).find((job) => job.user_id === userId && job.idempotency_key === idempotencyKey) ??
      null
    );
  }

  async claimShaderSpecRequest(
    input: ClaimAiShaderSpecRequestInput,
  ): Promise<{ row: AiShaderSpecRequestRow; claimed: boolean }> {
    const existing = Array.from(this.shaderSpecs.values()).find(
      (request) => request.user_id === input.userId && request.idempotency_key === input.idempotencyKey,
    );
    if (existing) return { row: existing, claimed: false };
    const row: AiShaderSpecRequestRow = {
      id: input.id,
      user_id: input.userId,
      idempotency_key: input.idempotencyKey,
      mode: input.mode,
      prompt: input.prompt,
      status: 'pending',
      response_json: null,
      provider_request_id: null,
      provider_usage_json: null,
      error_status: null,
      error_code: null,
      error_message: null,
      created_at: new Date(),
      completed_at: null,
    };
    this.shaderSpecs.set(row.id, row);
    return { row, claimed: true };
  }

  async findShaderSpecByIdempotencyKey(userId: string, idempotencyKey: string): Promise<AiShaderSpecRequestRow | null> {
    return (
      Array.from(this.shaderSpecs.values()).find(
        (request) => request.user_id === userId && request.idempotency_key === idempotencyKey,
      ) ?? null
    );
  }

  async completeShaderSpecRequest(input: CompleteAiShaderSpecRequestInput): Promise<AiShaderSpecRequestRow> {
    const request = this.shaderSpecs.get(input.id);
    if (!request || request.status !== 'pending') {
      throw new Error(`Pending shader spec request not found: ${input.id}`);
    }
    const completed: AiShaderSpecRequestRow = {
      ...request,
      status: 'succeeded',
      response_json: input.responseJson,
      provider_request_id: input.providerRequestId ?? null,
      provider_usage_json: input.providerUsageJson ?? null,
      completed_at: input.completedAt,
    };
    this.shaderSpecs.set(request.id, completed);
    if (input.usage) {
      await this.upsertMonthlyUsage({
        userId: request.user_id,
        period: input.usage.period,
        generationLimit: input.usage.generationLimit,
        generationCountDelta: 1,
      });
    }
    return completed;
  }

  async failShaderSpecRequest(
    id: string,
    error: { status: number; code: string; message: string; completedAt: Date },
  ): Promise<AiShaderSpecRequestRow> {
    const request = this.shaderSpecs.get(id);
    if (!request || request.status !== 'pending') {
      throw new Error(`Pending shader spec request not found: ${id}`);
    }
    const failed: AiShaderSpecRequestRow = {
      ...request,
      status: 'failed',
      error_status: error.status,
      error_code: error.code,
      error_message: error.message,
      completed_at: error.completedAt,
    };
    this.shaderSpecs.set(id, failed);
    return failed;
  }

  async markRunning(id: string, startedAt: Date): Promise<AiGenerationJobRow> {
    const job = await this.requireJob(id);
    const updated: AiGenerationJobRow = {
      ...job,
      status: 'running',
      attempt_count: job.attempt_count + 1,
      started_at: startedAt,
    };
    this.jobs.set(id, updated);
    return updated;
  }

  async markSucceeded(id: string, outputAssetId: string, completedAt: Date): Promise<AiGenerationJobRow> {
    const job = await this.requireJob(id);
    const updated: AiGenerationJobRow = {
      ...job,
      status: 'succeeded',
      output_asset_id: outputAssetId,
      completed_at: completedAt,
    };
    this.jobs.set(id, updated);
    return updated;
  }

  async markCancelled(id: string, cancelledAt: Date): Promise<AiGenerationJobRow> {
    const job = await this.requireJob(id);
    const updated: AiGenerationJobRow = {
      ...job,
      status: 'cancelled',
      cancelled_at: cancelledAt,
      completed_at: cancelledAt,
    };
    this.jobs.set(id, updated);
    return updated;
  }

  async markFailed(
    id: string,
    error: {
      code: string;
      message: string;
      retryable: boolean;
      providerUsageJson?: JsonObject | null;
      estimatedCost?: string | null;
    },
  ): Promise<AiGenerationJobRow> {
    const job = await this.requireJob(id);
    const updated: AiGenerationJobRow = {
      ...job,
      status: 'failed',
      error_code: error.code,
      error_message: error.message,
      retryable: error.retryable,
      provider_usage_json: error.providerUsageJson ?? null,
      estimated_cost: error.estimatedCost ?? null,
      completed_at: new Date(),
    };
    this.jobs.set(id, updated);
    return updated;
  }

  async createAsset(input: CreateAssetInput): Promise<AssetRow> {
    const now = new Date();
    const row: AssetRow = {
      id: input.id,
      user_id: input.userId,
      kind: input.kind,
      storage_key: input.storageKey,
      public_uri: input.publicUri ?? null,
      mime_type: input.mimeType,
      width: input.width,
      height: input.height,
      size_bytes: input.sizeBytes,
      metadata_json: input.metadataJson,
      created_at: now,
      deleted_at: null,
    };
    this.assets.set(row.id, row);
    return row;
  }

  async findMonthlyUsage(userId: string, period: string): Promise<AiUsageMonthlyRow | null> {
    return this.monthlyUsage.get(monthlyUsageKey(userId, period)) ?? null;
  }

  async upsertMonthlyUsage(input: {
    userId: string;
    period: string;
    generationLimit: number;
    generationCountDelta?: number;
    estimatedCostDelta?: string;
  }): Promise<AiUsageMonthlyRow> {
    const key = monthlyUsageKey(input.userId, input.period);
    const existing = this.monthlyUsage.get(key);
    const row: AiUsageMonthlyRow = {
      user_id: input.userId,
      period: input.period,
      generation_limit: input.generationLimit,
      generation_count: (existing?.generation_count ?? 0) + (input.generationCountDelta ?? 0),
      estimated_cost: addNumericStrings(existing?.estimated_cost ?? '0', input.estimatedCostDelta ?? '0'),
      updated_at: new Date(),
    };
    this.monthlyUsage.set(key, row);
    return row;
  }

  async countMonthlyGenerations(userId: string, period: string): Promise<number> {
    return (await this.findMonthlyUsage(userId, period))?.generation_count ?? 0;
  }

  async countActiveJobs(userId: string): Promise<number> {
    return Array.from(this.jobs.values()).filter(
      (job) => job.user_id === userId && (job.status === 'queued' || job.status === 'running'),
    ).length;
  }

  async listCloudProjectsForUser(userId: string): Promise<CloudProjectRow[]> {
    return Array.from(this.projects.values())
      .filter((project) => project.user_id === userId)
      .sort((left, right) => right.updated_at.getTime() - left.updated_at.getTime());
  }

  async upsertCloudProject(input: UpsertCloudProjectInput): Promise<CloudProjectRow> {
    const existing = this.projects.get(input.id);
    if (existing && existing.user_id !== input.userId) {
      throw new CloudProjectOwnershipConflictError(input.id);
    }
    const now = new Date();
    const row: CloudProjectRow = {
      id: input.id,
      user_id: input.userId,
      name: input.name,
      doc_json: input.docJson,
      thumbnail: input.thumbnail ?? null,
      created_at: existing?.created_at ?? now,
      updated_at: now,
    };
    this.projects.set(row.id, row);
    return row;
  }

  async deleteCloudProjectForUser(id: string, userId: string): Promise<boolean> {
    const existing = this.projects.get(id);
    if (!existing || existing.user_id !== userId) return false;
    return this.projects.delete(id);
  }

  repositories(): ApiRepositories {
    return {
      users: {
        findById: (id) => this.findById(id),
        upsertFromAuth: (input) => this.upsertUserFromAuth(input),
      },
      jobs: {
        create: (input) => this.createGenerationJob(input),
        findByIdForUser: (id, userId) => this.findGenerationJobByIdForUser(id, userId),
        findByIdempotencyKey: (userId, idempotencyKey) => this.findByIdempotencyKey(userId, idempotencyKey),
        countActiveJobs: (userId) => this.countActiveJobs(userId),
        markRunning: (id, startedAt) => this.markRunning(id, startedAt),
        markSucceeded: (id, outputAssetId, completedAt) => this.markSucceeded(id, outputAssetId, completedAt),
        markCancelled: (id, cancelledAt) => this.markCancelled(id, cancelledAt),
        markFailed: (id, error) => this.markFailed(id, error),
      },
      shaderSpecs: {
        claim: (input) => this.claimShaderSpecRequest(input),
        findByIdempotencyKey: (userId, idempotencyKey) => this.findShaderSpecByIdempotencyKey(userId, idempotencyKey),
        complete: (input) => this.completeShaderSpecRequest(input),
        markFailed: (id, error) => this.failShaderSpecRequest(id, error),
      },
      assets: {
        create: (input) => this.createAsset(input),
        findByIdForUser: (id, userId) => this.findAssetByIdForUser(id, userId),
        findProjectAssetByFingerprintForUser: (input) => this.findProjectAssetByFingerprintForUser(input),
        listProjectAssetsForUser: (userId) => this.listProjectAssetsForUser(userId),
        softDelete: (id, userId, deletedAt) => this.softDeleteAsset(id, userId, deletedAt),
        softDeleteManyForUser: (ids, userId, deletedAt) => this.softDeleteAssetsForUser(ids, userId, deletedAt),
      },
      projects: {
        listForUser: (userId) => this.listCloudProjectsForUser(userId),
        upsert: (input) => this.upsertCloudProject(input),
        deleteForUser: (id, userId) => this.deleteCloudProjectForUser(id, userId),
      },
      usage: {
        findMonthlyUsage: (userId, period) => this.findMonthlyUsage(userId, period),
        upsertMonthlyUsage: (input) => this.upsertMonthlyUsage(input),
        countMonthlyGenerations: (userId, period) => this.countMonthlyGenerations(userId, period),
      },
    };
  }

  async createGenerationJob(input: CreateAiGenerationJobInput): Promise<AiGenerationJobRow> {
    if (this.jobs.has(input.id)) throw new Error(`Generation job already exists: ${input.id}`);
    const activeJob = Array.from(this.jobs.values()).find(
      (job) => job.user_id === input.userId && (job.status === 'queued' || job.status === 'running'),
    );
    if (activeJob) throw new ActiveGenerationJobExistsError(input.userId);
    const now = new Date();
    const row: AiGenerationJobRow = {
      id: input.id,
      user_id: input.userId,
      provider: input.provider,
      model: input.model,
      prompt: input.prompt,
      negative_prompt: input.negativePrompt ?? null,
      settings_json: input.settingsJson,
      idempotency_key: input.idempotencyKey,
      status: 'queued',
      output_asset_id: null,
      error_code: null,
      error_message: null,
      retryable: null,
      attempt_count: 0,
      estimated_cost: null,
      provider_usage_json: null,
      created_at: now,
      queued_at: now,
      started_at: null,
      completed_at: null,
      cancelled_at: null,
      expires_at: input.expiresAt ?? null,
    };
    this.jobs.set(row.id, row);
    return row;
  }

  private async requireJob(id: string): Promise<AiGenerationJobRow> {
    const job = this.jobs.get(id);
    if (!job) throw new Error(`Generation job not found: ${id}`);
    return job;
  }
}

function monthlyUsageKey(userId: string, period: string) {
  return `${userId}:${period}`;
}

function addNumericStrings(a: string, b: string) {
  return String(Number(a) + Number(b));
}

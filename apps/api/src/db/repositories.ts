import type {
  AiGenerationJobRow,
  AiUsageMonthlyRow,
  AssetRow,
  CreateAiGenerationJobInput,
  CreateAssetInput,
  JsonObject,
  UpsertAiUsageMonthlyInput,
  UserRow,
} from './types.js';

export interface ApiRepositories {
  users: UserReadRepository;
  jobs: JobReadWriteRepository;
  assets: AssetReadWriteRepository;
  usage: UsageReadWriteRepository;
}

export interface UserReadRepository {
  findById(id: string): Promise<UserRow | null>;
}

export interface JobReadWriteRepository {
  create(input: CreateAiGenerationJobInput): Promise<AiGenerationJobRow>;
  findByIdForUser(id: string, userId: string): Promise<AiGenerationJobRow | null>;
  findByIdempotencyKey(userId: string, idempotencyKey: string): Promise<AiGenerationJobRow | null>;
  countActiveJobs(userId: string): Promise<number>;
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
      estimatedCost?: string | null;
    },
  ): Promise<AiGenerationJobRow>;
}

export interface AssetReadWriteRepository {
  create(input: CreateAssetInput): Promise<AssetRow>;
  findByIdForUser(id: string, userId: string): Promise<AssetRow | null>;
}

export interface UsageReadWriteRepository {
  findMonthlyUsage(userId: string, period: string): Promise<AiUsageMonthlyRow | null>;
  upsertMonthlyUsage(input: UpsertAiUsageMonthlyInput): Promise<AiUsageMonthlyRow>;
  countMonthlyGenerations(userId: string, period: string): Promise<number>;
}

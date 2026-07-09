import type {
  AiGenerationJobRepository,
  AiShaderSpecRequestRepository,
  AiUsageRepository,
  AssetRepository,
  CloudProjectRepository,
  UserRepository,
} from './types.js';

export interface ApiRepositories {
  users: UserReadWriteRepository;
  jobs: JobReadWriteRepository;
  shaderSpecs: ShaderSpecRequestReadWriteRepository;
  assets: AssetReadWriteRepository;
  projects: ProjectReadWriteRepository;
  usage: UsageReadWriteRepository;
}

export type UserReadWriteRepository = Pick<UserRepository, 'findById' | 'upsertFromAuth'>;

export type JobReadWriteRepository = Pick<
  AiGenerationJobRepository,
  | 'create'
  | 'findByIdForUser'
  | 'findByIdempotencyKey'
  | 'markRunning'
  | 'markSucceeded'
  | 'markCancelled'
  | 'markFailed'
> & {
  countActiveJobs(userId: string): Promise<number>;
};

export type ShaderSpecRequestReadWriteRepository = Pick<
  AiShaderSpecRequestRepository,
  'claim' | 'findByIdempotencyKey' | 'complete' | 'markFailed'
>;

export type AssetReadWriteRepository = Pick<
  AssetRepository,
  | 'create'
  | 'findByIdForUser'
  | 'findProjectAssetByFingerprintForUser'
  | 'listProjectAssetsForUser'
  | 'softDelete'
  | 'softDeleteManyForUser'
>;

export type ProjectReadWriteRepository = Pick<CloudProjectRepository, 'listForUser' | 'upsert' | 'deleteForUser'>;

export type UsageReadWriteRepository = Pick<AiUsageRepository, 'findMonthlyUsage' | 'upsertMonthlyUsage'> & {
  countMonthlyGenerations(userId: string, period: string): Promise<number>;
};

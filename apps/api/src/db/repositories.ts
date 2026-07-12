import type {
  AccountTierRepository,
  AdminAuditRepository,
  AdminReadRepository,
  AiGenerationJobRepository,
  AiOperationRepository,
  AiShaderRequestRepository,
  AiUsageEventRepository,
  AiUsageRepository,
  AssetRepository,
  CloudProjectRepository,
  ProviderReconciliationRepository,
  UserRepository,
} from './types.js';

export interface ApiRepositories {
  users: UserReadWriteRepository;
  accountTiers: AccountTierRepository;
  operations: AiOperationRepository;
  usageEvents: AiUsageEventRepository;
  adminAudit: AdminAuditRepository;
  adminRead: AdminReadRepository;
  reconciliations: ProviderReconciliationRepository;
  jobs: JobReadWriteRepository;
  shaderRequests: ShaderRequestReadWriteRepository;
  assets: AssetReadWriteRepository;
  projects: ProjectReadWriteRepository;
  usage: UsageReadWriteRepository;
}

export type UserReadWriteRepository = Pick<UserRepository, 'findById' | 'upsertFromAuth' | 'setRole'>;

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

export type ShaderRequestReadWriteRepository = Pick<
  AiShaderRequestRepository,
  | 'claim'
  | 'attachOperation'
  | 'findByIdempotencyKey'
  | 'findByIdForUser'
  | 'markGenerated'
  | 'markAccepted'
  | 'markClientRejected'
  | 'beginRepair'
  | 'completeRepair'
  | 'markFailed'
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

export type UsageReadWriteRepository = Pick<
  AiUsageRepository,
  'findMonthlyUsage' | 'upsertMonthlyUsage' | 'reserveMonthlyGeneration' | 'releaseMonthlyGeneration'
> & {
  countMonthlyGenerations(userId: string, period: string): Promise<number>;
};

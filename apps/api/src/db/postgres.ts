import { PostgresAccountTierRepository } from './postgresAccountTiers.js';
import { PostgresAdminReadRepository } from './postgresAdminRead.js';
import {
  PostgresAdminAuditRepository,
  PostgresAiUsageEventRepository,
  PostgresProviderReconciliationRepository,
} from './postgresAiAccounting.js';
import { PostgresAiOperationRepository } from './postgresAiOperations.js';
import { PostgresAssetRepository } from './postgresAssets.js';
import { PostgresAiGenerationJobRepository } from './postgresJobs.js';
import { PostgresCloudProjectRepository } from './postgresProjects.js';
import { PostgresAiShaderRequestRepository } from './postgresShaderRequests.js';
import { PostgresUsageRepository } from './postgresUsage.js';
import { PostgresUserRepository } from './postgresUsers.js';
import type { ApiRepositories } from './repositories.js';

export interface PostgresQueryClient {
  query<Row>(sql: string, values?: readonly unknown[]): Promise<{ rows: Row[] }>;
}

export function createPostgresRepositories(client: PostgresQueryClient): ApiRepositories {
  return {
    users: new PostgresUserRepository(client),
    accountTiers: new PostgresAccountTierRepository(client),
    operations: new PostgresAiOperationRepository(client),
    usageEvents: new PostgresAiUsageEventRepository(client),
    adminAudit: new PostgresAdminAuditRepository(client),
    adminRead: new PostgresAdminReadRepository(client),
    reconciliations: new PostgresProviderReconciliationRepository(client),
    jobs: new PostgresAiGenerationJobRepository(client),
    shaderRequests: new PostgresAiShaderRequestRepository(client),
    assets: new PostgresAssetRepository(client),
    projects: new PostgresCloudProjectRepository(client),
    usage: new PostgresUsageRepository(client),
  };
}

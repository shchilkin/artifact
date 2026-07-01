import { PostgresAssetRepository } from './postgresAssets.js';
import { PostgresAiGenerationJobRepository } from './postgresJobs.js';
import { PostgresCloudProjectRepository } from './postgresProjects.js';
import { PostgresUsageRepository } from './postgresUsage.js';
import { PostgresUserRepository } from './postgresUsers.js';
import type { ApiRepositories } from './repositories.js';

export interface PostgresQueryClient {
  query<Row>(sql: string, values?: readonly unknown[]): Promise<{ rows: Row[] }>;
}

export function createPostgresRepositories(client: PostgresQueryClient): ApiRepositories {
  return {
    users: new PostgresUserRepository(client),
    jobs: new PostgresAiGenerationJobRepository(client),
    assets: new PostgresAssetRepository(client),
    projects: new PostgresCloudProjectRepository(client),
    usage: new PostgresUsageRepository(client),
  };
}

export interface ApiConfig {
  port: number;
  webOrigin: string;
  databaseDriver: 'memory' | 'postgres';
  databaseUrl: string;
  queueDriver: 'memory' | 'bullmq';
  redisUrl: string;
  authJwtSecret: string;
  authJwtIssuer?: string;
  authJwtAudience?: string;
  devBearerToken?: string;
  openAiApiKey?: string;
  xAiApiKey?: string;
  assetStorageDriver: 'local' | 's3';
  assetStorageDir: string;
  monthlyGenerationLimit: number;
  maxActiveJobsPerUser: number;
}

function requiredEnv(env: NodeJS.ProcessEnv, name: string) {
  const value = env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function numberEnv(env: NodeJS.ProcessEnv, name: string, fallback: number) {
  const value = env[name];
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Environment variable ${name} must be a non-negative number`);
  }
  return parsed;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const driver = env.ASSET_STORAGE_DRIVER ?? 'local';
  if (driver !== 'local' && driver !== 's3') {
    throw new Error('ASSET_STORAGE_DRIVER must be local or s3');
  }
  const databaseDriver = env.API_DATABASE_DRIVER ?? 'memory';
  if (databaseDriver !== 'memory' && databaseDriver !== 'postgres') {
    throw new Error('API_DATABASE_DRIVER must be memory or postgres');
  }
  const queueDriver = env.API_QUEUE_DRIVER ?? 'memory';
  if (queueDriver !== 'memory' && queueDriver !== 'bullmq') {
    throw new Error('API_QUEUE_DRIVER must be memory or bullmq');
  }

  return {
    port: numberEnv(env, 'PORT', 4000),
    webOrigin: env.WEB_ORIGIN ?? 'http://localhost:5173',
    databaseDriver,
    databaseUrl: databaseDriver === 'postgres' ? requiredEnv(env, 'DATABASE_URL') : (env.DATABASE_URL ?? ''),
    queueDriver,
    redisUrl: queueDriver === 'bullmq' ? requiredEnv(env, 'REDIS_URL') : (env.REDIS_URL ?? ''),
    authJwtSecret: requiredEnv(env, 'AUTH_JWT_SECRET'),
    authJwtIssuer: env.AUTH_JWT_ISSUER,
    authJwtAudience: env.AUTH_JWT_AUDIENCE,
    devBearerToken: env.API_DEV_BEARER_TOKEN,
    openAiApiKey: env.OPENAI_API_KEY,
    xAiApiKey: env.XAI_API_KEY,
    assetStorageDriver: driver,
    assetStorageDir: env.ASSET_STORAGE_DIR ?? './storage',
    monthlyGenerationLimit: numberEnv(env, 'AI_MONTHLY_GENERATION_LIMIT', 10),
    maxActiveJobsPerUser: numberEnv(env, 'AI_MAX_ACTIVE_JOBS_PER_USER', 1),
  };
}

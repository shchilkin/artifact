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
  betterAuthSecret: string;
  betterAuthUrl?: string;
  devBearerToken?: string;
  bullBoardEnabled: boolean;
  openAiApiKey?: string;
  openAiImageModel: string;
  xAiApiKey?: string;
  xAiImageModel: string;
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

function booleanEnv(env: NodeJS.ProcessEnv, name: string, fallback: boolean) {
  const value = env[name];
  if (!value) return fallback;
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  throw new Error(`Environment variable ${name} must be true or false`);
}

function enumEnv<T extends string>(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: T,
  allowed: readonly T[],
  label: string,
) {
  const value = env[name] ?? fallback;
  if (allowed.includes(value as T)) return value as T;
  throw new Error(`Environment variable ${name} must be ${label}`);
}

function driverUrl(env: NodeJS.ProcessEnv, enabled: boolean, name: string) {
  return enabled ? requiredEnv(env, name) : (env[name] ?? '');
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const assetStorageDriver = enumEnv(env, 'ASSET_STORAGE_DRIVER', 'local', ['local', 's3'], 'local or s3');
  const databaseDriver = enumEnv(env, 'API_DATABASE_DRIVER', 'memory', ['memory', 'postgres'], 'memory or postgres');
  const queueDriver = enumEnv(env, 'API_QUEUE_DRIVER', 'memory', ['memory', 'bullmq'], 'memory or bullmq');

  return {
    port: numberEnv(env, 'PORT', 4000),
    webOrigin: env.WEB_ORIGIN ?? 'http://localhost:5173',
    databaseDriver,
    databaseUrl: driverUrl(env, databaseDriver === 'postgres', 'DATABASE_URL'),
    queueDriver,
    redisUrl: driverUrl(env, queueDriver === 'bullmq', 'REDIS_URL'),
    authJwtSecret: requiredEnv(env, 'AUTH_JWT_SECRET'),
    authJwtIssuer: env.AUTH_JWT_ISSUER,
    authJwtAudience: env.AUTH_JWT_AUDIENCE,
    betterAuthSecret: env.BETTER_AUTH_SECRET ?? requiredEnv(env, 'AUTH_JWT_SECRET'),
    betterAuthUrl: env.BETTER_AUTH_URL,
    devBearerToken: env.API_DEV_BEARER_TOKEN,
    bullBoardEnabled: booleanEnv(env, 'API_BULL_BOARD_ENABLED', false),
    openAiApiKey: env.OPENAI_API_KEY,
    openAiImageModel: env.OPENAI_IMAGE_MODEL ?? 'gpt-image-2',
    xAiApiKey: env.XAI_API_KEY,
    xAiImageModel: env.XAI_IMAGE_MODEL ?? 'grok-imagine-image-quality',
    assetStorageDriver,
    assetStorageDir: env.ASSET_STORAGE_DIR ?? './storage',
    monthlyGenerationLimit: numberEnv(env, 'AI_MONTHLY_GENERATION_LIMIT', 10),
    maxActiveJobsPerUser: numberEnv(env, 'AI_MAX_ACTIVE_JOBS_PER_USER', 1),
  };
}

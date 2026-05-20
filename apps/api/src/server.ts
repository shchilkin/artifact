import { createServer } from 'node:http';
import { createJwtBearerVerifier, resolveRequestUser } from './auth.js';
import { loadConfig } from './config.js';
import { InMemoryApiStore } from './db/memory.js';
import { createPostgresPool } from './db/pool.js';
import { createPostgresRepositories } from './db/postgres.js';
import { errorJson, writeApiResponse } from './http.js';
import { createMockImageProvider, createOpenAiImageProvider, createProviderRegistry } from './providers/index.js';
import { createBullMqGenerationQueue, createInMemoryGenerationQueue } from './queue.js';
import { createInMemoryRateLimiter } from './rateLimit.js';
import { handleAiRequest } from './routes/ai.js';
import { handleAssetRequest } from './routes/assets.js';
import { LocalAssetStorage } from './storage/index.js';

const config = loadConfig();
const store = config.databaseDriver === 'memory' ? new InMemoryApiStore() : null;
const pool = config.databaseDriver === 'postgres' ? createPostgresPool(config.databaseUrl) : null;
const repositories = pool ? createPostgresRepositories(pool) : store?.repositories();
if (!repositories) throw new Error('No API repository backend configured.');
const queue =
  config.queueDriver === 'bullmq' ? createBullMqGenerationQueue(config.redisUrl) : createInMemoryGenerationQueue();
const storage = new LocalAssetStorage(config.assetStorageDir);
const providers = createProviderRegistry([
  config.openAiApiKey
    ? createOpenAiImageProvider({ apiKey: config.openAiApiKey, defaultModel: config.openAiImageModel })
    : createMockImageProvider({ provider: 'openai' }),
  createMockImageProvider({ provider: 'xai' }),
]);
const createRateLimiter = createInMemoryRateLimiter({ limit: 10, windowMs: 60_000 });
const verifyJwtBearerToken = createJwtBearerVerifier({
  secret: config.authJwtSecret,
  issuer: config.authJwtIssuer,
  audience: config.authJwtAudience,
});

if (config.devBearerToken && store) {
  store.seedUser({
    id: 'dev-user',
    email: 'dev@artifact.local',
    role: 'admin',
    aiEnabled: true,
    plusStatus: 'active',
  });
}

const server = createServer(async (req, res) => {
  try {
    const resolveAuth = (request: Parameters<typeof resolveRequestUser>[0]) =>
      resolveRequestUser(request, {
        verifyBearerToken: async (token) => {
          if (config.devBearerToken && token === config.devBearerToken) {
            return { id: 'dev-user', email: 'dev@artifact.local', role: 'admin' };
          }
          return verifyJwtBearerToken(token);
        },
      });
    const response =
      (await handleAiRequest(req, {
        repositories,
        queue,
        providers,
        createRateLimiter,
        monthlyGenerationLimit: config.monthlyGenerationLimit,
        maxActiveJobsPerUser: config.maxActiveJobsPerUser,
        resolveAuth,
      })) ??
      (await handleAssetRequest(req, {
        repositories,
        storage,
        resolveAuth,
      }));
    writeApiResponse(res, response ?? errorJson(404, 'not_found', 'API route not found.'));
  } catch (error) {
    console.error('Artifact API request failed', error);
    writeApiResponse(res, errorJson(500, 'server_error', 'Unexpected API error.'));
  }
});

server.listen(config.port, () => {
  console.log(`Artifact API listening on :${config.port}`);
});

async function shutdown() {
  await queue.close?.();
  await pool?.end();
  server.close();
}

process.once('SIGINT', () => {
  void shutdown();
});
process.once('SIGTERM', () => {
  void shutdown();
});

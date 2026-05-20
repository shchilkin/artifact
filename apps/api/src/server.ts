import { createServer } from 'node:http';
import { createJwtBearerVerifier, resolveRequestUser } from './auth.js';
import { createBullBoardHandler } from './bullBoard.js';
import { loadConfig } from './config.js';
import { InMemoryApiStore } from './db/memory.js';
import { createPostgresPool } from './db/pool.js';
import { createPostgresRepositories } from './db/postgres.js';
import { loadApiEnv } from './env.js';
import { applyCorsHeaders, errorJson, writeApiResponse } from './http.js';
import { logError, logInfo } from './logger.js';
import {
  createMockImageProvider,
  createOpenAiImageProvider,
  createProviderRegistry,
  createXAiImageProvider,
} from './providers/index.js';
import { createBullMqGenerationQueue, createInMemoryGenerationQueue } from './queue.js';
import { createInMemoryRateLimiter } from './rateLimit.js';
import { handleAiRequest } from './routes/ai.js';
import { handleAssetRequest } from './routes/assets.js';
import { LocalAssetStorage } from './storage/index.js';

loadApiEnv();
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
  config.xAiApiKey
    ? createXAiImageProvider({ apiKey: config.xAiApiKey, defaultModel: config.xAiImageModel })
    : createMockImageProvider({ provider: 'xai' }),
]);
const bullBoard = config.bullBoardEnabled ? createBullBoardHandler(queue) : null;
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
  const startedAt = Date.now();
  applyCorsHeaders(req, res, config.webOrigin);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    logInfo('api.request', { method: req.method, path: req.url, status: 204, durationMs: Date.now() - startedAt });
    return;
  }

  if (bullBoard?.handle(req, res)) {
    logInfo('bull_board.request', { method: req.method, path: req.url, basePath: bullBoard.basePath });
    return;
  }

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
    const finalResponse = response ?? errorJson(404, 'not_found', 'API route not found.');
    writeApiResponse(res, finalResponse);
    logInfo('api.request', {
      method: req.method,
      path: req.url,
      status: finalResponse.status,
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    logError('api.request_failed', error, { method: req.method, path: req.url, durationMs: Date.now() - startedAt });
    writeApiResponse(res, errorJson(500, 'server_error', 'Unexpected API error.'));
  }
});

server.listen(config.port, () => {
  logInfo('api.started', {
    port: config.port,
    databaseDriver: config.databaseDriver,
    queueDriver: config.queueDriver,
    providers: providers
      .list()
      .map((provider) => provider.provider)
      .join(','),
    bullBoardPath: bullBoard?.basePath ?? null,
  });
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

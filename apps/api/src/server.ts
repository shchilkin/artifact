import { createServer } from 'node:http';
import { createClerkBearerVerifier, createJwtBearerVerifier, resolveRequestUser } from './auth.js';
import { createBullBoardHandler } from './bullBoard.js';
import { applyCorsHeaders, errorJson, writeApiResponse } from './http.js';
import { logError, logInfo } from './logger.js';
import { createInMemoryRateLimiter } from './rateLimit.js';
import { handleAiRequest } from './routes/ai.js';
import { handleAssetRequest } from './routes/assets.js';
import { handleHealthRequest } from './routes/health.js';
import { createApiRuntime } from './runtime.js';

const { config, store, pool, repositories, queue, storage, providers } = createApiRuntime();
const bullBoard = config.bullBoardEnabled ? createBullBoardHandler(queue) : null;
const createRateLimiter = createInMemoryRateLimiter({ limit: 10, windowMs: 60_000 });
const verifyJwtBearerToken = createJwtBearerVerifier({
  secret: config.authJwtSecret,
  issuer: config.authJwtIssuer,
  audience: config.authJwtAudience,
});
const verifyClerkBearerToken = createClerkBearerVerifier({
  secretKey: config.clerkSecretKey,
  jwtKey: config.clerkJwtKey,
  authorizedParties: config.clerkAuthorizedParties,
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
          return (await verifyClerkBearerToken(token)) ?? verifyJwtBearerToken(token);
        },
      });
    const response =
      handleHealthRequest(req, {
        databaseDriver: config.databaseDriver,
        queueDriver: config.queueDriver,
        storageDriver: config.assetStorageDriver,
        providers: providers.list().map((provider) => provider.provider),
        bullBoardEnabled: Boolean(bullBoard),
      }) ??
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

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { toNodeHandler } from 'better-auth/node';
import { createJwtBearerVerifier, resolveRequestUser } from './auth.js';
import { createArtifactBetterAuth } from './betterAuth.js';
import { createBullBoardHandler } from './bullBoard.js';
import { applyCorsHeaders, errorJson, writeApiResponse } from './http.js';
import { logError, logInfo } from './logger.js';
import { createInMemoryRateLimiter } from './rateLimit.js';
import { handleAiRequest } from './routes/ai.js';
import { handleAssetRequest } from './routes/assets.js';
import { handleHealthRequest } from './routes/health.js';
import { handleProjectAssetRequest } from './routes/projectAssets.js';
import { handleProjectRequest } from './routes/projects.js';
import { createApiRuntime } from './runtime.js';

const { config, store, pool, repositories, queue, storage, providers, shaderProvider } = createApiRuntime();
const bullBoard = config.bullBoardEnabled ? createBullBoardHandler(queue) : null;
const betterAuth = createArtifactBetterAuth(config, pool);
const betterAuthHandler = betterAuth ? toNodeHandler(betterAuth) : null;
const createRateLimiter = createInMemoryRateLimiter({ limit: 10, windowMs: 60_000 });
const verifyJwtBearerToken = createJwtBearerVerifier({
  secret: config.authJwtSecret,
  issuer: config.authJwtIssuer,
  audience: config.authJwtAudience,
});

if (config.devBearerToken) await seedDevelopmentAccount();

async function seedDevelopmentAccount() {
  if (store) {
    store.seedUser({
      id: 'dev-user',
      email: 'dev@artifact.local',
      role: 'admin',
      aiEnabled: true,
      plusStatus: 'active',
    });
    store.seedAccountAccess('dev-user', 'founder');
    return;
  }

  await repositories.users.upsertFromAuth({ id: 'dev-user', email: 'dev@artifact.local' });
  const access = await repositories.accountTiers.ensureAccess('dev-user');
  if (access.tier === 'founder') return;
  const assignmentId = `dev-user-founder-assignment-${access.version}`;
  await repositories.accountTiers.assignTier({
    id: assignmentId,
    userId: 'dev-user',
    expectedTier: access.tier,
    expectedVersion: access.version,
    newTier: 'founder',
    reason: 'Local development account',
    adminUserId: 'dev-user',
    idempotencyKey: assignmentId,
  });
}

function logRequest(method: string | undefined, path: string | undefined, status: number, startedAt: number) {
  logInfo('api.request', { method, path, status, durationMs: Date.now() - startedAt });
}

function handlePreflightRequest(req: IncomingMessage, res: ServerResponse, startedAt: number) {
  if (req.method !== 'OPTIONS') return false;
  res.writeHead(204);
  res.end();
  logRequest(req.method, req.url, 204, startedAt);
  return true;
}

function handleBullBoardRequest(req: IncomingMessage, res: ServerResponse) {
  if (!bullBoard?.handle(req, res)) return false;
  logInfo('bull_board.request', { method: req.method, path: req.url, basePath: bullBoard.basePath });
  return true;
}

async function verifyApiBearerToken(token: string) {
  if (config.devBearerToken && token === config.devBearerToken) {
    return { id: 'dev-user', email: 'dev@artifact.local', role: 'admin' };
  }
  return (await verifyBetterAuthBearerToken(token)) ?? verifyJwtBearerToken(token);
}

async function verifyBetterAuthBearerToken(token: string) {
  if (!betterAuth) return null;
  const session = await betterAuth.api.getSession({
    headers: new Headers({ authorization: `Bearer ${token}` }),
  });
  if (!session?.user.id) return null;
  return {
    id: session.user.id,
    email: session.user.email ?? undefined,
  };
}

const resolveAuth = (request: Parameters<typeof resolveRequestUser>[0]) =>
  resolveRequestUser(request, {
    verifyBearerToken: verifyApiBearerToken,
  });

async function resolveApiResponse(req: IncomingMessage) {
  return (
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
      shaderProvider,
      createRateLimiter,
      resolveAuth,
    })) ??
    (await handleAssetRequest(req, {
      repositories,
      storage,
      resolveAuth,
    })) ??
    (await handleProjectAssetRequest(req, {
      repositories,
      storage,
      resolveAuth,
    })) ??
    (await handleProjectRequest(req, {
      repositories,
      resolveAuth,
    })) ??
    errorJson(404, 'not_found', 'API route not found.')
  );
}

async function handleApiRequest(req: IncomingMessage, res: ServerResponse) {
  const startedAt = Date.now();
  applyCorsHeaders(req, res, config.webOrigins);
  if (handlePreflightRequest(req, res, startedAt)) return;
  if (handleBullBoardRequest(req, res)) return;

  try {
    if (betterAuthHandler && isBetterAuthRequest(req)) {
      await betterAuthHandler(req, res);
      logRequest(req.method, req.url, res.statusCode, startedAt);
      return;
    }
    const response = await resolveApiResponse(req);
    writeApiResponse(res, response);
    logRequest(req.method, req.url, response.status, startedAt);
  } catch (error) {
    logError('api.request_failed', error, { method: req.method, path: req.url, durationMs: Date.now() - startedAt });
    writeApiResponse(res, errorJson(500, 'server_error', 'Unexpected API error.'));
  }
}

const server = createServer(handleApiRequest);

function isBetterAuthRequest(req: IncomingMessage) {
  const pathname = req.url ? new URL(req.url, 'http://artifact.local').pathname : '';
  return pathname === '/api/auth' || pathname.startsWith('/api/auth/');
}

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

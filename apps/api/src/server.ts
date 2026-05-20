import { createServer } from 'node:http';
import { resolveRequestUser } from './auth.js';
import { loadConfig } from './config.js';
import { InMemoryApiStore } from './db/memory.js';
import { errorJson, writeJsonResponse } from './http.js';
import { createMockImageProvider, createProviderRegistry } from './providers/index.js';
import { createInMemoryGenerationQueue } from './queue.js';
import { createInMemoryRateLimiter } from './rateLimit.js';
import { handleAiRequest } from './routes/ai.js';

const config = loadConfig();
const store = new InMemoryApiStore();
const queue = createInMemoryGenerationQueue();
const providers = createProviderRegistry([
  createMockImageProvider({ provider: 'openai' }),
  createMockImageProvider({ provider: 'xai' }),
]);
const createRateLimiter = createInMemoryRateLimiter({ limit: 10, windowMs: 60_000 });

if (config.devBearerToken) {
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
    const response = await handleAiRequest(req, {
      repositories: store.repositories(),
      queue,
      providers,
      createRateLimiter,
      monthlyGenerationLimit: config.monthlyGenerationLimit,
      maxActiveJobsPerUser: config.maxActiveJobsPerUser,
      resolveAuth: (request) =>
        resolveRequestUser(request, {
          verifyBearerToken: (token) =>
            config.devBearerToken && token === config.devBearerToken
              ? { id: 'dev-user', email: 'dev@artifact.local', role: 'admin' }
              : null,
        }),
    });
    writeJsonResponse(res, response ?? errorJson(404, 'not_found', 'API route not found.'));
  } catch (error) {
    console.error('Artifact API request failed', error);
    writeJsonResponse(res, errorJson(500, 'server_error', 'Unexpected API error.'));
  }
});

server.listen(config.port, () => {
  console.log(`Artifact API listening on :${config.port}`);
});

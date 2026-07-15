import { describe, expect, it } from 'vitest';
import { AI_API_PATHS } from '../src/contracts.js';
import { handleHealthRequest } from '../src/routes/health.js';

describe('health route', () => {
  it('returns runtime configuration without requiring auth', () => {
    expect(
      handleHealthRequest(
        { method: 'GET', url: AI_API_PATHS.health },
        {
          buildSha: '0123456789abcdef0123456789abcdef01234567',
          databaseDriver: 'postgres',
          queueDriver: 'bullmq',
          storageDriver: 'local',
          providers: ['openai', 'xai'],
          bullBoardEnabled: true,
        },
      ),
    ).toEqual({
      status: 200,
      body: {
        ok: true,
        service: 'artifact-api',
        buildSha: '0123456789abcdef0123456789abcdef01234567',
        contractVersion: 1,
        databaseDriver: 'postgres',
        queueDriver: 'bullmq',
        storageDriver: 'local',
        providers: ['openai', 'xai'],
        bullBoardEnabled: true,
      },
    });
  });

  it('ignores other routes', () => {
    expect(
      handleHealthRequest(
        { method: 'POST', url: AI_API_PATHS.health },
        {
          buildSha: 'development',
          databaseDriver: 'memory',
          queueDriver: 'memory',
          storageDriver: 'local',
          providers: ['openai'],
          bullBoardEnabled: false,
        },
      ),
    ).toBeNull();
  });
});

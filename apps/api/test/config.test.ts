import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

const requiredEnv = {
  AUTH_JWT_SECRET: 'secret',
};

describe('loadConfig', () => {
  it('defaults to the in-memory database driver for local development', () => {
    expect(loadConfig(requiredEnv)).toMatchObject({
      databaseDriver: 'memory',
      databaseUrl: '',
    });
  });

  it('requires DATABASE_URL when Postgres is selected', () => {
    expect(() => loadConfig({ ...requiredEnv, API_DATABASE_DRIVER: 'postgres' })).toThrow(
      'Missing required environment variable: DATABASE_URL',
    );
  });

  it('accepts Postgres configuration for the VPS runtime', () => {
    expect(
      loadConfig({
        ...requiredEnv,
        API_DATABASE_DRIVER: 'postgres',
        DATABASE_URL: 'postgres://artifact:artifact@localhost:5432/artifact',
      }),
    ).toMatchObject({
      databaseDriver: 'postgres',
      databaseUrl: 'postgres://artifact:artifact@localhost:5432/artifact',
    });
  });

  it('requires REDIS_URL when BullMQ is selected', () => {
    expect(() => loadConfig({ ...requiredEnv, API_QUEUE_DRIVER: 'bullmq' })).toThrow(
      'Missing required environment variable: REDIS_URL',
    );
  });

  it('accepts BullMQ configuration for the VPS runtime', () => {
    expect(
      loadConfig({
        ...requiredEnv,
        API_QUEUE_DRIVER: 'bullmq',
        REDIS_URL: 'redis://localhost:6379',
      }),
    ).toMatchObject({
      queueDriver: 'bullmq',
      redisUrl: 'redis://localhost:6379',
    });
  });

  it('keeps optional JWT issuer and audience when configured', () => {
    expect(
      loadConfig({
        ...requiredEnv,
        AUTH_JWT_ISSUER: 'artifact-web',
        AUTH_JWT_AUDIENCE: 'artifact-api',
      }),
    ).toMatchObject({
      authJwtIssuer: 'artifact-web',
      authJwtAudience: 'artifact-api',
    });
  });

  it('defaults the OpenAI image model to the current configured provider target', () => {
    expect(loadConfig(requiredEnv)).toMatchObject({
      openAiImageModel: 'gpt-image-2',
    });
    expect(loadConfig({ ...requiredEnv, OPENAI_IMAGE_MODEL: 'gpt-image-1.5' })).toMatchObject({
      openAiImageModel: 'gpt-image-1.5',
    });
  });

  it('defaults the xAI image model to the current Grok Imagine target', () => {
    expect(loadConfig(requiredEnv)).toMatchObject({
      xAiImageModel: 'grok-imagine-image-quality',
    });
    expect(loadConfig({ ...requiredEnv, XAI_IMAGE_MODEL: 'grok-imagine-image' })).toMatchObject({
      xAiImageModel: 'grok-imagine-image',
    });
  });
});

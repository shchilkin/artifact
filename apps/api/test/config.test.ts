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

  it('keeps Better Auth settings when configured', () => {
    expect(
      loadConfig({
        ...requiredEnv,
        WEB_ORIGIN: 'https://artifact.example',
        BETTER_AUTH_SECRET: 'better-secret',
        BETTER_AUTH_URL: 'https://api.artifact.example/api/auth',
        EMAIL_FROM: 'Artifact <hello@artifact.example>',
        EMAIL_REPLY_TO: 'support@artifact.example',
        PASSWORD_RESET_LOG_URL: 'false',
        RESEND_API_KEY: 're_test',
      }),
    ).toMatchObject({
      betterAuthSecret: 'better-secret',
      betterAuthUrl: 'https://api.artifact.example/api/auth',
      emailFrom: 'Artifact <hello@artifact.example>',
      emailReplyTo: 'support@artifact.example',
      passwordResetLogUrl: false,
      resendApiKey: 're_test',
      webOrigin: 'https://artifact.example',
      webOrigins: ['https://artifact.example'],
    });
    expect(loadConfig({ ...requiredEnv })).toMatchObject({ betterAuthSecret: 'secret' });
  });

  it('logs password reset URLs locally but not by default in production', () => {
    expect(loadConfig({ ...requiredEnv, NODE_ENV: 'development' })).toMatchObject({ passwordResetLogUrl: true });
    expect(loadConfig({ ...requiredEnv, NODE_ENV: 'production' })).toMatchObject({ passwordResetLogUrl: false });
  });

  it('parses multiple web origins for Vercel production and preview deployments', () => {
    expect(
      loadConfig({
        ...requiredEnv,
        WEB_ORIGIN: 'https://artifact.example',
        WEB_ORIGINS: 'https://artifact.example, https://artifact-git-preview.vercel.app ',
      }),
    ).toMatchObject({
      webOrigin: 'https://artifact.example',
      webOrigins: ['https://artifact.example', 'https://artifact-git-preview.vercel.app'],
    });
  });

  it('parses Bull Board enablement explicitly', () => {
    expect(loadConfig(requiredEnv)).toMatchObject({ bullBoardEnabled: false });
    expect(loadConfig({ ...requiredEnv, API_BULL_BOARD_ENABLED: 'true' })).toMatchObject({ bullBoardEnabled: true });
    expect(() => loadConfig({ ...requiredEnv, API_BULL_BOARD_ENABLED: 'sometimes' })).toThrow(
      'Environment variable API_BULL_BOARD_ENABLED must be true or false',
    );
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

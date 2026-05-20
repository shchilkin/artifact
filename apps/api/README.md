# Artifact VPS API

This package is the planned VPS backend for v0.13 AI generation. It lives in
the same repository as the Vercel React Router app, but it is intentionally not
wired into the root build yet.

## Responsibilities

- Verify authenticated users.
- Enforce `ai_enabled` / plus access.
- Enforce monthly quota, rate limits, and one active generation per user.
- Create durable AI generation jobs.
- Publish jobs to BullMQ/Redis.
- Run workers that call OpenAI/xAI provider adapters.
- Store generated files and asset metadata.
- Serve authenticated generated asset downloads back to the frontend.

## Initial Runtime Shape

```text
apps/api
  src/
    contracts.ts      Shared backend-facing types and endpoint paths
    config.ts         Environment parsing
    http.ts           API route handler composition
    queue.ts          BullMQ queue boundary
    worker.ts         Generation worker boundary
    providers/        Provider adapters
    storage/          File/object storage adapters
    db/               Migrations and repositories
```

The first implementation should use mocked provider adapters before calling
paid providers. Keep provider keys and raw provider responses on the VPS only.

## Current Status

Implemented:

- Environment parsing.
- API contract types.
- PostgreSQL schema migration and repository contracts.
- Dependency-injected Postgres repository adapters.
- Configurable local memory or VPS Postgres repository backend.
- Pure auth/access, quota, active-job, and in-memory rate-limit helpers.
- HS256 JWT bearer verification with optional issuer/audience checks, plus
  dev bearer-token fallback.
- In-memory generation queue.
- BullMQ/Redis generation queue adapter behind `API_QUEUE_DRIVER=bullmq`.
- Mock image provider.
- OpenAI Image API provider adapter enabled when `OPENAI_API_KEY` is set.
- Local asset storage adapter.
- Mock-backed access, generation-create, generation-status, and
  generation-cancel route handlers.
- Authenticated generated-asset download route handler.
- Worker job processor that marks jobs running, writes mock provider output to
  storage, creates generated asset records, and marks success/failure.
- OpenAI and xAI provider adapters enabled by `OPENAI_API_KEY` and
  `XAI_API_KEY`.
- Provider output validation and storage cleanup around failed asset writes.
- Credentialed CORS/preflight handling for `WEB_ORIGIN`.
- API-local tests.

Next:

- Graph-native Image Generation node.
- VPS deployment/runbook.

## Contract

The API contract, DB shape, job lifecycle, and parallel implementation map are
defined in [`../../docs/version-plans/v0.13-backend-contract.md`](../../docs/version-plans/v0.13-backend-contract.md).

## Local Compose Smoke Test

Use the local Compose file to run the same infrastructure shape as the VPS API
without deploying anything:

```bash
cp .env.example .env
cp apps/api/.env.example apps/api/.env
npm run dev:ai:infra
npm run dev:ai:api
npm run dev:ai:worker
npm run dev:ai:web
```

Run those last three commands in separate terminals. The Compose database is
initialized with the v0.13 migration and a local `dev-user` with AI access. The
root `.env` exposes `VITE_AI_API_DEV_TOKEN=dev-token` so the browser can call
the local API as that seeded user.

The API server and worker load `apps/api/.env` and `apps/api/.env.local`
automatically. Shell-provided environment variables still take precedence, so
you can override a setting for one run without editing the file.

By default this uses the mock providers, so it does not spend provider tokens.
Set `OPENAI_API_KEY` or `XAI_API_KEY` in the API and worker terminals to test a
real provider.

To stop the infrastructure:

```bash
npm run dev:ai:infra:down
```

If you need to re-run the database init scripts, remove the Compose volume:

```bash
docker compose -f docker-compose.local.yml down -v
```

## Frontend Bridge

The Vercel app already has a client boundary in
[`../../app/utils/aiGenerationClient.ts`](../../app/utils/aiGenerationClient.ts)
and a generated asset import bridge in
[`../../app/utils/aiGeneratedAssetImport.ts`](../../app/utils/aiGeneratedAssetImport.ts).

Completed generated assets should be downloaded by the browser, stored in
IndexedDB, and inserted into the document as normal `artifact-asset://...`
image sources.

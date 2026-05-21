# Artifact VPS API

This package is the planned VPS backend for v0.13 AI generation. It lives in
the same repository as the Vercel React Router app in `apps/web`, but it builds
and deploys as a separate VPS service.

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
- Clerk bearer-token verification with `CLERK_SECRET_KEY` or `CLERK_JWT_KEY`.
- First-login user provisioning with AI disabled by default, plus
  `npm --workspace @artifact/api run grant:ai -- <clerk-user-id> [email]` for private
  alpha entitlement.
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
- Unauthenticated `GET /api/health` for liveness and VPS smoke checks.
- VPS/local operations runbook in [`RUNBOOK.md`](./RUNBOOK.md).
- Production `build`, `start`, and `worker:start` scripts for container
  runtime.
- API-local tests.

Next:

- Graph-native Image Generation node.
- Keep [`RUNBOOK.md`](./RUNBOOK.md) updated as deployment assumptions change.

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
npm --workspace @artifact/api run smoke
```

Run `dev:ai:api`, `dev:ai:worker`, and `dev:ai:web` in separate terminals. The
Compose database is
initialized with the v0.13 migration and a local `dev-user` with AI access. The
root `.env` exposes `VITE_AI_API_DEV_TOKEN=dev-token` so the browser can call
the local API as that seeded user.

To test real browser sign-in instead, leave `VITE_AI_API_DEV_TOKEN` empty, set
`VITE_CLERK_PUBLISHABLE_KEY` in the root `.env`, and configure either
`CLERK_SECRET_KEY` or `CLERK_JWT_KEY` in `apps/api/.env`.

The API server and worker load `apps/api/.env` and `apps/api/.env.local`
automatically. Shell-provided environment variables still take precedence, so
you can override a setting for one run without editing the file.

When `API_BULL_BOARD_ENABLED=true` and `API_QUEUE_DRIVER=bullmq`, Bull Board is
available at `http://localhost:4000/admin/queues`.

The API also exposes unauthenticated liveness metadata at
`http://localhost:4000/api/health`. Use this for local smoke tests, reverse
proxy checks, and VPS process monitoring.

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
[`../web/app/utils/aiGenerationClient.ts`](../web/app/utils/aiGenerationClient.ts)
and a generated asset import bridge in
[`../web/app/utils/aiGeneratedAssetImport.ts`](../web/app/utils/aiGeneratedAssetImport.ts).

Completed generated assets should be downloaded by the browser, stored in
IndexedDB, and inserted into the document as normal `artifact-asset://...`
image sources.

## VPS Runbook

Deployment and operations notes live in [`RUNBOOK.md`](./RUNBOOK.md).

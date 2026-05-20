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
- Local asset storage adapter.
- Mock-backed access, generation-create, generation-status, and
  generation-cancel route handlers.
- Authenticated generated-asset download route handler.
- Worker job processor that marks jobs running, writes mock provider output to
  storage, creates generated asset records, and marks success/failure.
- API-local tests.

Next:

- OpenAI/xAI provider adapters after the mocked path works end to end.

## Contract

The API contract, DB shape, job lifecycle, and parallel implementation map are
defined in [`../../docs/version-plans/v0.13-backend-contract.md`](../../docs/version-plans/v0.13-backend-contract.md).

## Frontend Bridge

The Vercel app already has a client boundary in
[`../../app/utils/aiGenerationClient.ts`](../../app/utils/aiGenerationClient.ts)
and a generated asset import bridge in
[`../../app/utils/aiGeneratedAssetImport.ts`](../../app/utils/aiGeneratedAssetImport.ts).

Completed generated assets should be downloaded by the browser, stored in
IndexedDB, and inserted into the document as normal `artifact-asset://...`
image sources.

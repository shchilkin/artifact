# Artifact API Runbook

This runbook covers the v0.13 private AI generation backend. The frontend stays
on Vercel; the API, worker, Postgres, Redis, provider keys, and generated image
storage live on the VPS.

## Processes

Run these as separate long-lived processes:

| Process | Command | Purpose |
| --- | --- | --- |
| API | `npm --prefix apps/api run dev` | HTTP API, auth, quota, job creation, asset downloads, Bull Board |
| Worker | `npm --prefix apps/api run worker:dev` | BullMQ consumer, provider calls, storage writes, job completion |
| Postgres | VPS service or container | users, jobs, assets, usage |
| Redis | VPS service or container | BullMQ queue |

For production, use a process manager such as systemd, PM2, Docker Compose, or
your existing VPS supervisor. The API and worker must share the same `.env`
values for database, queue, providers, and storage.

## Required Environment

Minimum VPS-like configuration:

```bash
NODE_ENV=production
PORT=4000
WEB_ORIGIN=https://your-vercel-domain.example

API_DATABASE_DRIVER=postgres
DATABASE_URL=postgres://artifact:change-me@127.0.0.1:5432/artifact

API_QUEUE_DRIVER=bullmq
REDIS_URL=redis://127.0.0.1:6379

AUTH_JWT_SECRET=change-me-long-random-secret
AUTH_JWT_ISSUER=
AUTH_JWT_AUDIENCE=
API_DEV_BEARER_TOKEN=

API_BULL_BOARD_ENABLED=false

OPENAI_API_KEY=
OPENAI_IMAGE_MODEL=gpt-image-2
XAI_API_KEY=
XAI_IMAGE_MODEL=grok-imagine-image-quality

ASSET_STORAGE_DRIVER=local
ASSET_STORAGE_DIR=/var/lib/artifact/generated-assets

AI_MONTHLY_GENERATION_LIMIT=10
AI_MAX_ACTIVE_JOBS_PER_USER=1
```

Local development can keep `API_DEV_BEARER_TOKEN=dev-token`; production should
prefer real bearer tokens verified by `AUTH_JWT_SECRET` and optional issuer /
audience checks.

## Database Bootstrap

Apply migrations before starting the API or worker:

```bash
psql "$DATABASE_URL" -f apps/api/src/db/migrations/001_initial_ai_generation.sql
```

For local Compose only, `docker-compose.local.yml` mounts the migration and
`apps/api/docker/init/002_local_dev_seed.sql` automatically. That seed creates
`dev-user` with AI access for browser smoke tests.

## Storage

The first storage driver is local disk. Create the directory and make it
writable by the API and worker user:

```bash
mkdir -p /var/lib/artifact/generated-assets
chown -R artifact:artifact /var/lib/artifact/generated-assets
```

Back this directory up with the database. Asset rows point at files through
`storage_key`, so losing either side breaks generated asset downloads.

## Health And Smoke Checks

Unauthenticated liveness:

```bash
curl http://127.0.0.1:4000/api/health
```

Expected shape:

```json
{
  "ok": true,
  "service": "artifact-api",
  "databaseDriver": "postgres",
  "queueDriver": "bullmq",
  "storageDriver": "local",
  "providers": ["openai", "xai"],
  "bullBoardEnabled": false
}
```

Access check with a local dev token:

```bash
curl -H 'Authorization: Bearer dev-token' http://127.0.0.1:4000/api/ai/access
```

Create a mock-backed job locally:

```bash
curl -X POST http://127.0.0.1:4000/api/ai/generations \
  -H 'Authorization: Bearer dev-token' \
  -H 'Content-Type: application/json' \
  -d '{
    "prompt": "grainy shoegaze album cover",
    "provider": "openai",
    "settings": { "aspect": "1:1", "quality": "standard" },
    "idempotencyKey": "manual-smoke-1"
  }'
```

Poll the returned job id:

```bash
curl -H 'Authorization: Bearer dev-token' http://127.0.0.1:4000/api/ai/generations/<job-id>
```

If the job stays queued, check that the worker process is running and points at
the same `DATABASE_URL` and `REDIS_URL` as the API.

You can run the same flow with the bundled smoke script after the API and
worker are running:

```bash
npm --prefix apps/api run smoke
```

Useful overrides:

```bash
API_SMOKE_BASE_URL=https://api.example.com \
API_SMOKE_TOKEN=<bearer-token> \
API_SMOKE_PROVIDER=openai \
npm --prefix apps/api run smoke
```

The smoke script checks `/api/health`, `/api/ai/access`, creates a generation
job, polls it to completion, and downloads the generated asset bytes.

## Bull Board

Enable only on trusted networks or behind your own auth:

```bash
API_BULL_BOARD_ENABLED=true
API_QUEUE_DRIVER=bullmq
```

Then open:

```text
http://127.0.0.1:4000/admin/queues
```

Bull Board is for queue debugging only. It should not be exposed publicly during
the private alpha.

## Operational Notes

- Run API and worker from the same git revision.
- Keep provider keys out of the frontend and Vercel client env.
- Set `WEB_ORIGIN` to the exact Vercel app origin. Credentialed CORS only echoes
  that configured origin.
- Failed provider calls should mark the job failed and not leave orphan files.
- If asset creation fails after writing bytes, storage cleanup should remove the
  just-written file.
- One active job per user and monthly quota are enforced server-side.
- Generated image bytes are downloaded by the browser through
  `/api/assets/:id/file`, then imported into local IndexedDB as normal
  `artifact-asset://...` editor assets.

## Local Commands

```bash
cp .env.example .env
cp apps/api/.env.example apps/api/.env
npm run dev:ai:infra
npm run dev:ai:api
npm run dev:ai:worker
npm run dev:ai:web
```

Stop local infrastructure:

```bash
npm run dev:ai:infra:down
```

Reset local Postgres/Redis volumes:

```bash
docker compose -f docker-compose.local.yml down -v
```

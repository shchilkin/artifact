# Artifact API Runbook

This runbook covers the v0.13 private AI generation backend. The frontend stays
on Vercel; the API, worker, Postgres, Redis, provider keys, and generated image
storage live on the VPS.

## Processes

Run these as separate long-lived processes:

| Process | Command | Purpose |
| --- | --- | --- |
| API | `npm --workspace @artifact/api run dev` | HTTP API, auth, quota, job creation, asset downloads, Bull Board |
| Worker | `npm --workspace @artifact/api run worker:dev` | BullMQ consumer, provider calls, storage writes, job completion |
| Postgres | VPS service or container | users, jobs, assets, usage |
| Redis | VPS service or container | BullMQ queue |

For local AI Shader-only development, prefer the repo-level launcher:

```bash
npm run dev:local-ai
```

It runs API and web together with memory-backed API state, a browser dev token,
free-port selection, and optional `OPENAI_API_KEY` discovery from the shell or
macOS Keychain. Use the Postgres/Redis flow below only when testing queues,
workers, cloud project persistence, or production-like auth storage.

For production, use a process manager such as systemd, PM2, Docker Compose, or
your existing VPS supervisor. The API and worker must share the same `.env`
values for database, queue, providers, and storage.

## Coolify Compose Resource

For the first Coolify deploy, create one Docker Compose resource for the whole
backend stack:

- Compose file: `docker-compose.coolify.yml`
- Services: `api`, `worker`, `bull-board`, `postgres`, `redis`
- Build context: repository root
- Branch: `development`
- Postgres image: `postgres:18-alpine`

This shape intentionally keeps the app processes and infrastructure inside the
same compose resource so Docker DNS and shared volumes stay simple:

```text
artifact-generated-assets -> /var/lib/artifact/generated-assets
artifact-postgres-data    -> /var/lib/postgresql
artifact-redis-data       -> /data
```

Postgres 18 uses the official image's versioned data layout. Mount the volume at
`/var/lib/postgresql`, not `/var/lib/postgresql/data`; the image stores the
cluster under `/var/lib/postgresql/18/docker`. If an earlier failed deploy
created data in `/var/lib/postgresql/data`, remove the empty/stale Postgres
volume before redeploying, or migrate real data with dump/restore or
`pg_upgrade` instead of reusing the old path.

The worker writes generated images to that volume and the API serves those same
files through `/api/assets/:id/file`. Creating API and worker as separate
Coolify applications is possible, but do not give them separate generated-asset
volumes or completed jobs will reference files that the API cannot read.

The compose file wires app services to `postgres` and `redis` by service name,
so do not set `DATABASE_URL` or `REDIS_URL` manually for this first setup. Set
`POSTGRES_PASSWORD` instead, and optionally override `POSTGRES_DB` /
`POSTGRES_USER` if needed.

Redis uses append-only file persistence for BullMQ state and disables RDB
snapshots in the Coolify compose file. If Redis logs `MISCONF ... unable to
persist to disk`, redeploy the current compose config before investigating queue
workers; old containers may still have the default RDB snapshot settings.

Expose the `api` service publicly on port `4000`. Keep `worker` private. Expose
`bull-board` only behind its dedicated operator domain. The compose file adds a
service-specific Traefik Basic Auth middleware, so set
`BULL_BOARD_BASIC_AUTH_USERS` to an htpasswd entry before deployment. For
example, generate the value with `htpasswd -nbB <username> <password>`. Keep the
plain password in a password manager and store only the generated htpasswd
entry in Coolify. Because the label reads an environment variable, disable
Coolify's **Escape special characters in labels** option for this Compose
resource. Do not enable Coolify's application-wide Basic Auth: that would also
protect the public API service.

After deployment, verify the boundary rather than only container health:

```bash
curl -I https://<bull-board-domain>/admin/queues
curl -u '<username>:<password>' -I https://<bull-board-domain>/admin/queues
```

The first request must return `401`; the authenticated request must return
`200`. Bull Board is an operator surface, not a public app feature.

The API and Bull Board services define container healthchecks against
`http://127.0.0.1:4000/api/health`; the Bull Board check also verifies that the
server booted with board routes enabled. Runtime checks verify Postgres, Redis
writes, and local generated-asset storage where each container depends on them.
Coolify/Traefik will not route public traffic while the resource is unhealthy,
so if the public API domain returns `503 no available server`, check the API,
worker, Postgres, and Redis container health first.

For Better Auth browser accounts, set `BETTER_AUTH_SECRET` and
`BETTER_AUTH_URL`. The URL should point at the public auth endpoint, for
example `https://api.example.com/api/auth`.

Password recovery uses Better Auth reset tokens and Resend email delivery. Set
`RESEND_API_KEY` and `EMAIL_FROM` in production. `PASSWORD_RESET_LOG_URL` should
stay unset or `false` in production; local development can set it to `true` to
print reset links in API logs when email delivery is not configured.

The Coolify API service starts with `npm run start:with-migrations`, which runs
`npm run migrate` before `node dist/server.js`. The worker and Bull Board wait
for the API healthcheck, so deploys do not serve traffic or process jobs against
an old schema. Migration state is recorded in the `schema_migrations` table with
checksums; if a previously applied migration file changes, startup fails instead
of silently applying drift. The migration runner owns the transaction for each
file, so SQL migration files must not include `BEGIN`, `COMMIT`, or `ROLLBACK`.

New verified accounts start on the Free tier. The legacy `grant:ai` command has
been removed because `ai_enabled` no longer grants provider-backed AI access.
Before the Admin API lands, inspect the intended tier cutover with:

```bash
npm run migrate:account-tiers:dry-run
```

Do not hand-edit `account_access` in production. Creator and Founder assignment
will move through the audited Admin API and backoffice flow.

## Required Environment

Minimum VPS-like configuration:

```bash
NODE_ENV=production
PORT=4000
WEB_ORIGIN=https://your-vercel-domain.example
WEB_ORIGINS=https://your-vercel-domain.example,https://backoffice.artifact.shchilkin.dev,https://your-preview-domain.vercel.app

API_DATABASE_DRIVER=postgres
DATABASE_URL=postgres://artifact:change-me@127.0.0.1:5432/artifact

API_QUEUE_DRIVER=bullmq
REDIS_URL=redis://127.0.0.1:6379

AUTH_JWT_SECRET=change-me-long-random-secret
AUTH_JWT_ISSUER=
AUTH_JWT_AUDIENCE=
BETTER_AUTH_SECRET=change-me-long-random-secret
BETTER_AUTH_URL=https://your-api-domain.example/api/auth
PASSWORD_RESET_LOG_URL=false
RESEND_API_KEY=
EMAIL_FROM="Artifact <hello@your-domain.example>"
EMAIL_REPLY_TO=

API_BULL_BOARD_ENABLED=false

OPENAI_API_KEY=
OPENAI_ADMIN_KEY=
OPENAI_IMAGE_MODEL=gpt-image-2
OPENAI_SHADER_MODEL=gpt-5.5
OPENAI_SHADER_TIMEOUT_MS=20000
XAI_API_KEY=
XAI_IMAGE_MODEL=grok-imagine-image-quality

AI_SAFETY_BUDGET_USD=30

ASSET_STORAGE_DRIVER=local
ASSET_STORAGE_DIR=/var/lib/artifact/generated-assets

```

`OPENAI_ADMIN_KEY` is only used by `npm --workspace @artifact/api run reconcile:openai-costs`.
Run it daily after midnight UTC to import the previous completed UTC day's
OpenAI organization cost. Keep this key server-side and separate from
`OPENAI_API_KEY`.

Local development can keep `API_DEV_BEARER_TOKEN=dev-token`. Production rejects
any non-empty `API_DEV_BEARER_TOKEN` during configuration loading and must use
Better Auth sessions or bearer tokens verified by `AUTH_JWT_SECRET` and
optional issuer / audience checks. Do not add the development token to Coolify
environment variables.

For Better Auth-backed browser accounts, set `VITE_AUTH_API_BASE_URL` in the
root `.env` to the API origin. Better Auth sign-in identifies the browser user
and enables cloud project saves. The API creates or refreshes the matching
`users` row and `account_access` defaults it to Free. Provider-backed AI access
comes from the explicit Account Tier, not `ai_enabled` or `plus_status`.

```bash
FOUNDER_ACCOUNT_ID=user_xxx npm --workspace @artifact/api run migrate:account-tiers:dry-run
```

The Better Auth user id is the durable account key. The command above reports
the intended cutover and does not mutate production data.

## Cloud Project Assets

Cloud project saves keep the editable project record in Postgres and upload
large project dependencies separately:

- `cloud_projects.doc_json` stores lightweight `artifact-cloud-asset://...`
  references.
- `assets` stores the authenticated owner, MIME type, byte size, storage key,
  and metadata for each uploaded image, font, model, or environment asset.
- `ASSET_STORAGE_DIR` stores the bytes on the persistent Coolify volume.

For the Coolify compose deployment, `artifact-generated-assets` must stay
mounted at `/var/lib/artifact/generated-assets` for the API and worker. Back up
both Postgres and this volume together; a database backup without the asset
volume will leave cloud project references pointing at missing files.

`ASSET_STORAGE_DRIVER=s3` is reserved for a future object-storage adapter. Until
that adapter exists, production should keep `ASSET_STORAGE_DRIVER=local`.

## Database Bootstrap

Production Coolify deploys apply migrations automatically through the API
container startup command. For local development, one-off debugging, or a
manually managed VPS process, apply migrations before starting the API or
worker:

```bash
npm --workspace @artifact/api run migrate
```

The active-generation guard migration is self-healing for private-alpha
duplicates. Before creating the one-active-job-per-user partial unique index, it
keeps one `queued` / `running` job per user, preferring `running` over `queued`
and then the newest job, and marks the other active duplicates as `expired` with
`error_code = active_job_guard_migration_expired`. This prevents deploy-time
failure from old stuck duplicate jobs while leaving an auditable database trail.

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
npm --workspace @artifact/api run smoke
```

Useful overrides:

```bash
API_SMOKE_BASE_URL=https://api.example.com \
API_SMOKE_TOKEN=<bearer-token> \
API_SMOKE_PROVIDER=openai \
npm --workspace @artifact/api run smoke
```

The smoke script checks `/api/health`, `/api/ai/access`, creates a generation
job, polls it to completion, and downloads the generated asset bytes.

If smoke fails with:

```text
GET /api/health failed with 404
```

then the script reached a server that does not have the current API routes.
Usually this means an old `dev:api` process is still running on port `4000`,
or `API_SMOKE_BASE_URL` points at the React Router/Vercel web server instead of
the API server. Stop and restart the API process from the current checkout, then
check:

```bash
curl http://127.0.0.1:4000/api/health
```

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

## Cleanup

The AI cleanup command is intentionally manual for the private alpha. It is safe
to run as a dry run first, inspect the JSON summary, then apply the same command
when the candidates look right.

Dry run:

```bash
npm --workspace @artifact/api run cleanup:ai
```

Apply:

```bash
npm --workspace @artifact/api run cleanup:ai -- --apply
```

Production/dist equivalent:

```bash
npm --workspace @artifact/api run build
npm --workspace @artifact/api run cleanup:ai:start -- --apply
```

The command:

- commits active operations that already have a usable job or accepted shader;
- expires abandoned AI operations and releases their reserved Generation;
- marks stale `queued` / `running` jobs as `expired`;
- soft-deletes generated asset rows that are not referenced by any generation
  job;
- deletes local files for old soft-deleted generated assets;
- deletes local generated files that do not have a matching database asset row.

Useful knobs:

```bash
npm --workspace @artifact/api run cleanup:ai -- \
  --stale-active-hours=6 \
  --orphan-asset-hours=24 \
  --deleted-asset-file-days=7 \
  --limit=100
```

Only run `--apply` against the intended `DATABASE_URL` and `ASSET_STORAGE_DIR`.
For private alpha, run cleanup after investigating stuck jobs in Bull Board or
before freeing old generated files on the VPS.

## Operational Notes

- Run API and worker from the same git revision.
- Keep provider keys out of the frontend and Vercel client env.
- Set `WEB_ORIGIN` to the primary Vercel app origin. Use `WEB_ORIGINS` when the
  API must also trust preview or dev frontends; it is a comma-separated list and
  overrides the single-origin fallback. Prefer exact preview domains, or a narrow
  project-owned wildcard such as `https://artifact-git-*-owner.vercel.app`.
  Credentialed CORS only echoes a matched configured origin.
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
npm run dev:infra
npm run dev:api
npm run dev:worker
npm run dev:web
```

The local Compose database is initialized with a `dev-user`; when
`API_DEV_BEARER_TOKEN` is configured outside production, API startup assigns
that account the Founder tier explicitly. The root `.env` can expose
`VITE_AI_API_DEV_TOKEN=dev-token` so the browser calls the local API as that
seeded user without signing in. Leave that Vite dev token empty to test the
Better Auth sign-in flow instead.

Stop local infrastructure:

```bash
npm run dev:infra:down
```

Reset local Postgres/Redis volumes:

```bash
docker compose -f docker-compose.local.yml down -v
```

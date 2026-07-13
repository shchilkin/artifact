# Artifact Backoffice

`apps/backoffice` is the separate Admin application for account access,
Generation allowances, provider usage, and reconciliation. It reads and mutates
data only through the authenticated `/api/admin/*` contract. It has no database
client and does not expose prompts, shader code, generated assets, or project
documents.

## Local Development

Start local infrastructure and apply migrations once:

```bash
npm run dev:infra
DATABASE_URL=postgres://artifact:artifact@127.0.0.1:5432/artifact npm --workspace @artifact/api run migrate
```

Then run the API and backoffice in separate terminals:

```bash
npm run dev:api
npm run dev:backoffice
```

The backoffice opens at `http://127.0.0.1:4030` and uses
`http://127.0.0.1:4000` as its default API origin. Override the API origin when
needed:

```bash
VITE_BACKOFFICE_API_BASE_URL=http://127.0.0.1:4000 npm run dev:backoffice
```

Use an Artifact account whose Better Auth user record has `role=admin`. The
first Admin is assigned through the audited bootstrap CLI described in
[`admin-api.md`](./admin-api.md), not through the browser application.
The bootstrap command now accepts the ID of an existing Better Auth account and
creates its domain account record when needed.

If ports `5432` or `6379` are already occupied, set
`ARTIFACT_POSTGRES_PORT`/`ARTIFACT_REDIS_PORT` for Compose and use the same
ports in `DATABASE_URL`/`REDIS_URL` when starting the API.

## Routes

- `/` shows Account Tier distribution, Generation volume, Provider Usage, and
  the Safety Budget for one UTC month.
- `/accounts` searches accounts and summarizes Tier, Generation, failure, and
  provider-cost metadata.
- `/accounts/:userId` provides audited Tier Assignment, Quota Grant, and Quota
  Grant Reversal controls.
- `/usage` shows metadata-only Provider Usage Events and daily reconciliation.
- `/sign-in` uses the existing Better Auth email/password account flow.

Mutations require a reason and an idempotency key. Tier Assignment also sends
the expected Tier and version so concurrent changes fail with a visible stable
conflict instead of overwriting newer state.

## Validation

```bash
npm run check:backoffice
npm run build:backoffice
npm run test:browser:backoffice
```

The browser suite covers normal desktop navigation, denied access, optimistic
concurrency conflicts, and mobile layout without page-level horizontal
overflow.

## Production Deployment

The production SPA is built into `apps/backoffice/build/client` and served by
an unprivileged Nginx container on port `8080`. The container provides
`/healthz`, immutable caching for hashed assets, no-cache navigation responses,
and an `index.html` fallback for React Router paths such as `/accounts` and
`/usage`.

GitHub Actions builds the image from `docker/backoffice.Dockerfile` and
publishes immutable references alongside the backend images:

```text
ghcr.io/shchilkin/artifact/artifact-backoffice:sha-<shortsha>
```

Use the SHA tag or workflow digest in Coolify, never `latest`. Create the
backoffice as a separate image-based service on the same VPS as the API:

```text
domain:       backoffice.artifact.shchilkin.dev
container:    8080
health path:  /healthz
image:        ghcr.io/shchilkin/artifact/artifact-backoffice:sha-<shortsha>
```

The production API origin is baked into the browser bundle at build time and
defaults to `https://api.artifact.shchilkin.dev`. A source build can override
the public value with the `VITE_BACKOFFICE_API_BASE_URL` Docker build argument.
Setting a Vite variable only at container runtime has no effect on an already
built SPA.

Do not put OpenAI keys, database credentials, Admin bootstrap credentials, or
Cloudflare service tokens in build arguments or `VITE_*` variables.
Browser-visible configuration contains only the public API origin.

Before exposing the service:

1. Add `https://backoffice.artifact.shchilkin.dev` to API `WEB_ORIGINS`; the
   same allow-list drives credentialed CORS and Better Auth trusted origins.
2. Keep `BETTER_AUTH_URL=https://api.artifact.shchilkin.dev/api/auth` and
   `API_DEV_BEARER_TOKEN` unset in production.
3. Protect the full backoffice hostname with a Cloudflare Access Allow policy
   for the founder email and no Bypass policy.
4. Keep Better Auth Admin authorization enabled for every `/api/admin/*`
   request; Cloudflare Access is an additional boundary, not a replacement.

Deploy the API first when its schema or Admin contract changed, wait for
`/api/health`, then deploy the matching backoffice image and verify sign-in,
overview, account detail, and usage routes. The backoffice is stateless, so
rollback means restoring its previous immutable image reference. Database and
provider-usage rollback procedures remain owned by the API runbook.

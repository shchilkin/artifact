# Artifact Backoffice

`apps/backoffice` is the separate Admin application for account access,
Generation allowances, provider usage, and reconciliation. It reads and mutates
data only through the authenticated `/api/admin/*` contract. It has no database
client and does not expose prompts, shader code, generated assets, or project
documents.

## Local Development

Run the API and backoffice in separate terminals:

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

## Production Boundary

The production SPA is built into `apps/backoffice/build/client`. Deployment is
a separate VPS service at `backoffice.artifact.shchilkin.dev`, behind both
Cloudflare Access and Better Auth Admin authorization. Production must set
`VITE_BACKOFFICE_API_BASE_URL` to the API origin and configure that origin in
API CORS, Better Auth trusted origins, and cookie settings.

Do not put OpenAI keys, database credentials, Admin bootstrap credentials, or
Cloudflare service tokens in `VITE_*` variables. Browser-visible configuration
contains only the API origin.

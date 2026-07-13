# Monorepo, Turborepo, And Container CI Plan

This plan describes how to move Artifact from a root frontend plus same-repo API
scaffold into a workspace-based monorepo with Turborepo task orchestration,
dedicated backend containers, GitHub-built images, and Coolify/VPS deployments
that pull prebuilt images.

This is an infrastructure track. It should not block the first private AI
alpha merge unless deploy instability becomes the blocker.

## Implementation Status

Workspace and container foundation is in progress.

Completed in the first slice:

- Root npm workspaces include `apps/api`.
- Root lockfile owns API workspace dependencies; the old nested API lockfile is
  removed.
- Turborepo is installed with API-scoped build/typecheck/test scripts.
- `@artifact/api` has production `build`, `start`, and `worker:start` scripts
  that emit and run compiled `dist` output.
- Dedicated API, worker, Bull Board, and backoffice Dockerfiles exist under
  `docker/`.
- GitHub Actions has an additive container image workflow for API, worker,
  Bull Board, and backoffice images.
- Docker context excludes local agent/cache/build artifacts and env secrets.

Completed in the web relocation slice:

- Root npm workspaces include `apps/web`.
- The React Router app source, public assets, Vite/React Router config,
  web TypeScript config, and web Vitest config live under `apps/web`.
- Root `dev`, `build`, `build:ci`, `preview`, `typecheck`, `test`,
  `test:browser`, and `favicon` scripts are stable wrappers around
  `@artifact/web`.
- Vercel remains rooted at the repository and points output to
  `apps/web/build/client`, preserving the root `api/og.tsx` function.
- Vercel's repo config now explicitly uses the `vite` framework preset for
  deployment output while the app itself remains React Router. This prevents
  stale project-level framework detection from applying Remix/React Router
  build assumptions to the monorepo output.
- A root `tsconfig.json` covers only the Vercel `api/**/*.tsx` function surface
  so the root Open Graph Edge Function compiles JSX during Vercel builds.
- Vite loads root `.env` values through `envDir: '../..'`, so existing local
  `VITE_*` setup still works.
- Playwright starts the web dev server from `apps/web` directly and clears the
  Clerk publishable key for browser tests, keeping unauthenticated QA stable.
- `packages/shared` owns the browser/server-neutral AI API contract, generation
  status/provider enums, health response, and queue payload types. Web and API
  local contract files now re-export from it.
- Validation passed for `npm run check`, `npm run build`, `npm run turbo:check`,
  the focused AI image multi-generation browser regression, and local Docker
  builds for API, worker, and Bull Board images.
- GitHub PR validation passed for quality, browser tests, Vercel preview, and
  GHCR API/worker/Bull Board image builds. The accidental `album-cover-utils`
  Vercel project created during CLI validation was removed; future PR pushes
  should only produce the real `artifact` Vercel deployment check.

Still pending:

- Finish converting the main web validation path to Turborepo where it improves
  CI/runtime ergonomics.
- Wire Coolify/VPS to pull CI-built image tags.
- Add migration/release deployment orchestration around the containers.

Documented in this plan:

- GHCR package visibility, token, and package access requirements for pull-only
  deploys.
- Concrete Coolify image references and environment expectations for API,
  worker, and Bull Board services.
- Release order, migration handling, and rollback by image tag/digest.

## Goals

- Keep the web app deployable on Vercel.
- Build API, worker, and Bull Board as dedicated containers.
- Move expensive container builds out of Coolify and into GitHub PR/CI.
- Push immutable image tags keyed by commit SHA, branch, PR number, or release.
- Make Coolify deploy by pulling known-good images instead of rebuilding all
  services on the VPS.
- Share stable API contracts and config through workspace packages without
  coupling editor internals to backend runtime code.
- Use Turborepo for task graph execution, affected builds, and cacheable
  validation.

## Non-Goals

- Do not rewrite the frontend framework as part of this migration.
- Do not introduce Turbopack; the intended tool here is Turborepo.
- Do not move every helper into shared packages. Only extract stable contracts,
  schemas, and build config when reuse is real.
- Do not require Vercel remote caching before local and GitHub Actions builds
  work reliably.
- Do not change AI generation product behavior during the infrastructure move.

## Target Layout

Start from the current repo shape and move in small steps:

```text
apps/
  web/
    app/
    public/
    package.json
    react-router.config.ts
    vite.config.ts
    tsconfig.json
  api/
    src/
    package.json
    tsconfig.json

packages/
  shared/
    src/
      index.ts
    package.json
    tsconfig.json
  config/
    tsconfig/
    eslint/
    package.json

docker/
  api.Dockerfile
  backoffice.Dockerfile
  backoffice.nginx.conf
  worker.Dockerfile
  bull-board.Dockerfile

turbo.json
package.json
package-lock.json
docker-compose.local.yml
```

The final layout can still keep API and worker code in one `apps/api` package
if the worker imports the same repositories, providers, and config. The worker
container can run a different command from the same package. Split into
`apps/worker` only if package boundaries become useful.

## Package Boundaries

| Package | Owns | Should not own |
| --- | --- | --- |
| `apps/web` | React Router app, editor UI, local IndexedDB assets, Vercel build | Provider keys, direct DB/Redis access |
| `apps/api` | HTTP API, auth verification, quotas, jobs, assets, Bull Board server, worker entry point | Browser UI, editor-local state |
| `packages/shared` | API contract types, generation status enums, serializable asset metadata, optional validation schemas | React components, Node-only adapters |
| `packages/config` | Shared tsconfig/eslint/base tool config | Runtime code |

Shared code should be serializable and environment-neutral. If a module imports
`fs`, `pg`, `ioredis`, `express`, `window`, React, Canvas, or DOM APIs, it
probably does not belong in `packages/shared`.

## Turborepo Task Model

Root scripts should become thin wrappers around Turborepo:

```json
{
  "scripts": {
    "dev": "turbo dev --parallel",
    "build": "turbo build",
    "check": "turbo format:check lint typecheck test",
    "test": "turbo test",
    "test:browser": "turbo test:browser --filter=@artifact/web",
    "typecheck": "turbo typecheck"
  }
}
```

Initial `turbo.json` shape:

```json
{
  "$schema": "https://turborepo.dev/schema.json",
  "globalDependencies": [".env.example"],
  "globalEnv": ["CI", "NODE_ENV"],
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["build/**", "dist/**"]
    },
    "typecheck": {
      "dependsOn": ["^build"],
      "outputs": []
    },
    "lint": {
      "outputs": []
    },
    "format:check": {
      "outputs": []
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"]
    },
    "test:browser": {
      "dependsOn": ["build"],
      "cache": false
    },
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

Use `--filter` for service-specific work:

```bash
npx turbo build --filter=@artifact/web
npx turbo typecheck --filter=@artifact/api
npx turbo test --filter=@artifact/api
npx turbo build --filter=@artifact/api...
```

After the basic migration works, CI can use affected builds:

```bash
npx turbo build lint typecheck test --affected
```

## Container Strategy

Use dedicated images for production processes:

| Image | Source | Runtime command | Notes |
| --- | --- | --- | --- |
| `artifact-api` | `apps/api` | `node dist/server.js` | Public HTTP API and optional Bull Board |
| `artifact-worker` | `apps/api` | `node dist/worker.js` | BullMQ consumer only |
| `artifact-bull-board` | `apps/api` or API image | `node dist/server.js` with board enabled | Can be a separate container or protected API route |

The worker and Bull Board can reuse the same compiled API package at first.
Separate Dockerfiles are still useful because each service gets its own
command, environment, healthcheck, and deploy policy.

Docker builds should use workspace-aware install steps and copy only the files
needed for the target service. If the repo adopts Turborepo prune later, the
container build can use a pruned workspace for smaller images:

```bash
npx turbo prune @artifact/api --docker
```

Do not require prune in the first migration. A simple workspace-aware Dockerfile
is easier to validate.

## GitHub PR/CI Image Flow

GitHub Actions should become the build authority for service images:

1. Checkout with full history where `--affected` is needed.
2. Install with the root lockfile.
3. Run Turborepo quality gates.
4. Build service containers.
5. Push images to the registry.
6. Attach image tags/digests to the PR or deployment summary.

Recommended tags:

```text
ghcr.io/<owner>/<repo>/artifact-api:sha-<short-commit>
ghcr.io/<owner>/<repo>/artifact-worker:sha-<short-commit>
ghcr.io/<owner>/<repo>/artifact-bull-board:sha-<short-commit>
ghcr.io/<owner>/<repo>/artifact-api:pr-<number>
```

For `development` or release tags, add stable aliases:

```text
artifact-api:development
artifact-api:v0.13.0
```

Coolify should deploy immutable SHA tags for preview environments and release
tags for stable environments. Avoid deploying `latest`.

The current container workflow uses `docker/metadata-action` with
`latest=false`, so the expected tags are:

- `sha-<shortsha>` for every built ref.
- `<branch-name>` for branch pushes.
- `pr-<number>` for pull requests.
- `<semver>` for `v*` tags.

Pull-only deployments should prefer immutable `sha-<shortsha>` tags, or an
image digest copied from the workflow summary, for all three services at once.
Branch aliases are useful for disposable staging only. Semver tags are release
aliases. Do not deploy `latest`.

### GHCR Permissions

GitHub Actions publishes with the repository `GITHUB_TOKEN`, so the image
workflow needs:

```yaml
permissions:
  contents: read
  packages: write
```

For Coolify pulls, choose one of these GHCR access patterns:

- Preferred private-package setup: create a GitHub token for a machine account
  with read-only package access to this repository's packages. Store it in
  Coolify as the registry password. The username is the GitHub user or machine
  account that owns the token.
- Public package setup: make the three container packages public in GitHub
  Packages, then Coolify can pull without registry credentials. This is
  simplest operationally but exposes image metadata and layers.

For private packages, each GHCR package must be connected to the repository or
grant the Coolify token account explicit package read access:

- `artifact-api`
- `artifact-worker`
- `artifact-bull-board`

The Coolify registry entry should use:

```text
Registry: ghcr.io
Username: <github-user-or-machine-account>
Password: <read:packages token>
```

Keep the token read-only for packages. It should not need repository write,
workflow, or delete-package permissions.

## Coolify/VPS Deploy Shape

Coolify should own runtime configuration, not compilation:

- Pull prebuilt image tags from GitHub Container Registry or the selected
  registry.
- Inject environment variables from Coolify secrets.
- Mount persistent local storage for generated assets when using the local
  storage driver.
- Connect API and worker to the same Postgres, Redis, and asset storage.
- Run migrations as an explicit release step before replacing long-lived
  services.
- Healthcheck API through `/api/health`.

Suggested services:

```text
web       -> Vercel, not Coolify, unless a VPS web fallback is desired
backoffice -> Coolify container, public only behind Cloudflare Access
api       -> Coolify container, public behind domain/proxy
worker    -> Coolify container, private long-running process
bullboard -> Coolify container or API route, private/admin protected
postgres  -> VPS/Coolify managed service
redis     -> VPS/Coolify managed service
storage   -> local volume first, object storage later
```

### Coolify Service Image References

Configure API, worker, Bull Board, and backoffice as image-based services, not
Git/source build services. For one release, all four should point at the same
pushed ref:

```text
api image:
  ghcr.io/<owner>/<repo>/artifact-api:sha-<shortsha>

worker image:
  ghcr.io/<owner>/<repo>/artifact-worker:sha-<shortsha>

bullboard image:
  ghcr.io/<owner>/<repo>/artifact-bull-board:sha-<shortsha>

backoffice image:
  ghcr.io/<owner>/<repo>/artifact-backoffice:sha-<shortsha>
```

Use the lowercase owner/repo path shown in the GitHub workflow summary. If
Coolify supports digest pinning for the service type in use, pin the digest
from the workflow summary instead of a mutable alias:

```text
ghcr.io/<owner>/<repo>/artifact-api@sha256:<digest>
```

The API service should be public behind the Coolify proxy and healthchecked at
`/api/health`. Backoffice listens on `8080`, is healthchecked at `/healthz`, and
must sit behind Cloudflare Access plus API-side Admin authorization. The worker
should be private, long-running, and not exposed over HTTP. Bull Board should
be private/admin-only; either expose it through a protected internal domain/VPN,
or keep it disabled until auth/proxy protection
is configured.

### Runtime Environment Expectations

Production-like Coolify services should share the same Postgres, Redis, auth,
provider, and storage configuration. The baseline environment is:

```text
PORT=4000
WEB_ORIGIN=https://<vercel-or-web-origin>

API_DATABASE_DRIVER=postgres
DATABASE_URL=postgres://...

API_QUEUE_DRIVER=bullmq
REDIS_URL=redis://...

AUTH_JWT_SECRET=<long-random-secret>
AUTH_JWT_ISSUER=<optional>
AUTH_JWT_AUDIENCE=<optional>
CLERK_SECRET_KEY=<optional-if-using-clerk>
CLERK_JWT_KEY=<optional-if-using-clerk>
CLERK_AUTHORIZED_PARTIES=https://<vercel-or-web-origin>
# API_DEV_BEARER_TOKEN is local-only and must remain unset in production.

OPENAI_API_KEY=<optional-provider-key>
OPENAI_IMAGE_MODEL=gpt-image-2
XAI_API_KEY=<optional-provider-key>
XAI_IMAGE_MODEL=grok-imagine-image-quality

ASSET_STORAGE_DRIVER=local
ASSET_STORAGE_DIR=/var/lib/artifact/generated-assets

AI_MONTHLY_GENERATION_LIMIT=10
AI_MAX_ACTIVE_JOBS_PER_USER=1
```

Service-specific notes:

- API: set `API_BULL_BOARD_ENABLED=false` unless Bull Board is intentionally
  served from the API container.
- Worker: use the same `DATABASE_URL`, `REDIS_URL`, provider keys, auth
  defaults, quota limits, and storage settings as API. It does not need a
  public route, but it still loads the same config module.
- Bull Board: set `API_BULL_BOARD_ENABLED=true` and
  `API_QUEUE_DRIVER=bullmq`. It must share `REDIS_URL` with the API and worker.
  If it uses the API server entry point, give it a separate internal/admin
  domain and route protection.
- Local asset storage: mount a persistent volume at `ASSET_STORAGE_DIR` for
  both API and worker. If Bull Board only reads queue state, it does not need
  the asset volume.
- Object storage later: when `ASSET_STORAGE_DRIVER=s3` becomes real, replace
  the local volume expectation with bucket credentials and document the required
  variables in the API runbook before enabling it.

### Migration And Deploy Order

Deploy one immutable image set at a time:

1. Pick the GitHub workflow run and record the `sha-<shortsha>` tag or digest
   for `artifact-api`, `artifact-worker`, `artifact-bull-board`, and
   `artifact-backoffice`.
2. Confirm Coolify can pull all four images with the configured GHCR registry
   credentials before changing running services.
3. Pause or scale down the worker so no generation job is mid-write during a
   schema migration.
4. Apply database migrations once against the production database. Until there
   is a dedicated migration image/service, run
   `npm --workspace @artifact/api run migrate` from a trusted release checkout
   or an equivalent one-off container/command using the same image contents and
   `DATABASE_URL`.
5. Deploy the API image and wait for `/api/health` to return `200`.
6. Deploy the worker image and verify it connects to Redis/Postgres without
   repeated restarts.
7. Deploy or re-enable Bull Board last, then confirm the queue view points at
   the same Redis instance.
8. Deploy backoffice after the API is healthy, verify `/healthz`, and smoke-test
   sign-in plus a direct React Router path such as `/usage`.
9. Run the API smoke flow and one AI generation smoke test before moving the
   Vercel web app or announcing the release.

Migration scripts must be forward-safe for the old worker during the short
pause window. If a migration requires incompatible code on both sides, keep the
worker stopped until API and worker are both on the new image set.

### Rollback Notes

Rollback is an image reference change, not a source rebuild:

- Record the previous working API, worker, and Bull Board image tags/digests in
  the deploy notes before every release.
- Roll back all long-running services to the previous compatible image set
  together. Avoid mixing a new worker with an old API unless the change was
  explicitly tested as compatible.
- If the failure happened before migrations, switch the image references back
  and redeploy API, worker, then Bull Board.
- If migrations already ran, only roll back to an older image that is compatible
  with the migrated schema. Prefer additive migrations and feature flags so
  schema rollback is rarely needed.
- If a worker deploy is bad, pause/scale down the worker first to stop job
  churn, then redeploy the previous worker image. API can usually stay up if
  the job schema and queue payloads are compatible.
- If Bull Board is bad, disable or roll back only Bull Board. It should not be
  required for user-facing generation.
- If local asset storage is involved, do not delete or remount the
  `ASSET_STORAGE_DIR` volume during rollback. The database and asset directory
  must remain paired.

## Migration Phases

### Phase 0: Baseline And Freeze Points

- Confirm current alpha branch validation state.
- Record current root scripts, env files, and deploy commands.
- Keep a rollback branch/tag before moving files.
- Decide registry: GitHub Container Registry is the default candidate.

Exit criteria:

- Existing `npm run check`, `npm run build`, and AI-focused browser tests pass
  before workspace migration starts.

### Phase 1: Introduce Workspaces Without Moving Web Files

- Add root `workspaces` for `apps/api` and future `packages/*`.
- Keep frontend at root temporarily.
- Make root scripts call `npm --workspace @artifact/api ...` instead of
  `npm --prefix apps/api ...` where useful.
- Confirm Vercel/root build behavior is unchanged.

Exit criteria:

- Root install uses one lockfile.
- API package scripts work through workspace commands.
- Existing local AI stack still runs.

### Phase 2: Add Turborepo

- Add `turbo` as a root dev dependency.
- Add `turbo.json` with `build`, `typecheck`, `lint`, `format:check`, `test`,
  `test:browser`, and `dev` tasks.
- Keep old script names as wrappers where possible.
- Add filters for web/API validation.

Exit criteria:

- `npm run check`, `npm run build`, API typecheck/tests, and browser tests pass
  through Turborepo wrappers.
- `npx turbo build --filter=@artifact/api...` works.

### Phase 3: Move Web Into `apps/web`

- Move root frontend files into `apps/web`.
- Update Vercel project root/build settings.
- Update Playwright, TypeScript, React Router, Vite, ESLint, Biome, and import
  paths as needed.
- Keep public document/export behavior unchanged.

Exit criteria:

- Vercel preview build works from `apps/web`.
- Local `npm run dev --workspace @artifact/web` works.
- Existing browser tests pass.

### Phase 4: Extract Stable Shared Package

- Create `packages/shared`.
- Move stable API contracts and generation status/asset metadata types there.
- Keep environment-specific API repositories and browser asset stores out of
  shared.
- Add tests for shared schemas/types if runtime validators are introduced.

Exit criteria:

- Web and API both import shared contract code.
- No shared package import pulls browser-only or Node-only dependencies into
  the wrong runtime.

### Phase 5: Add Dedicated Service Containers

- Add Dockerfiles for API, worker, and optional Bull Board.
- Build images locally from the monorepo root.
- Add container smoke commands for `/api/health`, worker processing, and Bull
  Board loading.
- Update local Compose or add a production-like Compose file for smoke tests.

Exit criteria:

- API and worker containers run locally against Postgres/Redis.
- A real generation job can complete through containerized API and worker.
- Generated asset file download works from the API container.

### Phase 6: GitHub Image Builds

- Add GitHub Actions workflow for service images.
- Build and push images for PRs and protected branches.
- Publish image tags/digests in workflow summary.
- Keep quality and browser test workflows separate enough that a browser-test
  failure is distinguishable from an image-build failure.

Exit criteria:

- PR produces `artifact-api`, `artifact-worker`, and optional
  `artifact-bull-board` images.
- Images are tagged by commit SHA and can be pulled manually.

### Phase 7: Coolify Pull-Only Deploy

- Reconfigure Coolify services to pull the CI-built tags.
- Disable VPS-side source builds for API/worker/Bull Board.
- Add healthchecks and the migration/deploy order above to the API deployment
  runbook.
- Document the previous working image set before each deploy and roll back by
  image tag or digest.

Exit criteria:

- Coolify deploy no longer builds service images on the VPS.
- Deploy failure logs point to runtime/env/health issues, not long Docker build
  compilation.
- API, worker, and Bull Board can be advanced or rolled back by changing only
  their Coolify image references.

## Parallel Work Plan For Subagents

This migration can be split cleanly once the alpha branch is stable.

| Track | Owner | Write scope | Can run in parallel with |
| --- | --- | --- | --- |
| Workspace/Turbo foundation | Worker A | root `package.json`, `package-lock.json`, `turbo.json`, package scripts | Container design, CI draft docs |
| Web relocation | Worker B | `apps/web/**`, Vercel/build/test config | Shared package extraction after boundaries are agreed |
| Shared contracts | Worker C | `packages/shared/**`, API/web contract imports | Container Dockerfiles if import paths are stable |
| API/worker containers | Worker D | `docker/**`, `apps/api` build scripts, Compose files | GitHub Actions draft |
| GitHub image CI | Worker E | `.github/workflows/**` | Dockerfiles after image names/targets are agreed |
| Coolify runbook | Worker F | `apps/api/RUNBOOK.md`, deploy docs | GitHub image CI |

Coordination rules:

- Do not move frontend files and extract shared imports in the same unreviewed
  patch unless one worker owns both scopes.
- Docker/CI workers should depend on agreed package names and build scripts
  before editing workflows.
- Keep root script names stable until the final compatibility pass, so local
  developer commands do not break mid-migration.
- Validate each phase before starting the next file-moving phase.

## Risks And Mitigations

| Risk | Mitigation |
| --- | --- |
| Vercel build breaks after moving web files | Move web only after workspaces and Turbo are already green; update Vercel root explicitly |
| Shared package pulls Node code into browser | Keep shared package dependency-free at first; add tests/build checks for both web and API imports |
| Docker builds become slower before prune | Start simple, then add `turbo prune` only after baseline images work |
| CI image tags drift from deployed app | Deploy immutable SHA tags and write digests into workflow summary |
| Coolify deploy fails after source builds are disabled | Keep old source-build config documented until pull-only deploy passes twice |
| Large migration hides AI regressions | Run AI Image browser tests before and after each phase |

## Validation Gate

Before considering the infrastructure migration complete:

```bash
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:browser -- --grep "AI image node"
```

Additional infra validation:

- `npx turbo build --filter=@artifact/web`
- `npx turbo typecheck --filter=@artifact/api`
- API container returns `200` from `/api/health`.
- Worker container completes one mock generation job.
- Real local-stack smoke test can create, complete, download, and import a
  generated asset.
- GitHub PR publishes images tagged by commit SHA.
- Coolify deploy pulls the prebuilt image tag and passes healthcheck.

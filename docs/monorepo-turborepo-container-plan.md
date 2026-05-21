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
- Dedicated API, worker, and Bull Board Dockerfiles exist under `docker/`.
- GitHub Actions has an additive container image workflow for API, worker, and
  Bull Board images.
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
- Vite loads root `.env` values through `envDir: '../..'`, so existing local
  `VITE_*` setup still works.
- Playwright starts the web dev server from `apps/web` directly and clears the
  Clerk publishable key for browser tests, keeping unauthenticated QA stable.
- Validation passed for `npm run check`, `npm run build`, `npm run turbo:check`,
  the focused AI image multi-generation browser regression, and local Docker
  builds for API, worker, and Bull Board images.

Still pending:

- Extract stable shared contracts into `packages/shared`.
- Finish converting the main web validation path to Turborepo where it improves
  CI/runtime ergonomics.
- Wire Coolify/VPS to pull CI-built image tags.
- Add migration/release deployment orchestration around the containers.

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
    package.json
    tsconfig.json
  config/
    tsconfig/
    eslint/
    package.json

docker/
  api.Dockerfile
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
ghcr.io/<owner>/<repo>/artifact-api:sha-<commit>
ghcr.io/<owner>/<repo>/artifact-worker:sha-<commit>
ghcr.io/<owner>/<repo>/artifact-bull-board:sha-<commit>
ghcr.io/<owner>/<repo>/artifact-api:pr-<number>
```

For `development` or release tags, add stable aliases:

```text
artifact-api:development
artifact-api:v0.13.0
```

Coolify should deploy immutable SHA tags for preview environments and release
tags for stable environments. Avoid deploying `latest`.

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
api       -> Coolify container, public behind domain/proxy
worker    -> Coolify container, private long-running process
bullboard -> Coolify container or API route, private/admin protected
postgres  -> VPS/Coolify managed service
redis     -> VPS/Coolify managed service
storage   -> local volume first, object storage later
```

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
- Add healthchecks and migration runbook.
- Document rollback by image tag.

Exit criteria:

- Coolify deploy no longer builds service images on the VPS.
- Deploy failure logs point to runtime/env/health issues, not long Docker build
  compilation.

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

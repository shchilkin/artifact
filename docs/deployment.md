# Deployment And Release Flow

Artifact uses two long-lived environments and ephemeral pull-request previews.
The branch model matches the PopChoice deployment shape while preserving
Artifact's stricter exact-revision production release gate.

## Environment Matrix

| Environment | Source | Trigger | Web | VPS services |
| --- | --- | --- | --- | --- |
| Pull-request preview | Feature branch | Vercel Git integration | Ephemeral Vercel URL | No dedicated stack |
| Staging | `development` | Successful `CI` workflow, or manual rollback | Stable staging alias | Dedicated Coolify staging application |
| Production | `main` plus release tag | Manual `Release` workflow | Production Vercel domains | Dedicated Coolify production application |

`development` remains the default integration branch. `main` is the production
branch and should only receive reviewed release-candidate revisions promoted
from `development`.

## Staging Deployment

`.github/workflows/staging.yml` listens for a successful `CI` run on
`development`. It uses the exact CI `head_sha`; it does not deploy whatever
happens to be at the branch tip when the deployment starts.

The workflow runs in this order:

1. Confirm that the requested revision belongs to `development` and that every
   required `staging` GitHub Environment setting exists.
2. Pull branch-specific Vercel Preview settings, build the web app, and create a
   deployment without changing the stable staging alias.
3. Verify that the staged HTML reports the requested build SHA.
4. Pin the dedicated Coolify staging application to `development` and the same
   exact SHA, deploy it, and verify the public API build SHA and contract.
5. Move the stable staging alias to the verified Vercel deployment and verify
   the alias again.

This ordering keeps the previous stable staging web deployment reachable if the
new web build or staging API fails. Staging deploys share one non-cancelling
concurrency lock so a newer run cannot interrupt an in-progress external
mutation.

### Required GitHub Configuration

Create a GitHub Environment named `staging` with these values. Staging must use
its own Coolify application, database, Redis, asset storage, credentials, and
hostnames; do not point these values at production services.

Repository variable:

- `STAGING_ENABLED` (`false` until all settings and external resources are
  ready; set to `true` last)

Environment variables:

- `COOLIFY_APPLICATION_UUID`
- `COOLIFY_BASE_URL`
- `STAGING_API_URL`
- `STAGING_WEB_URL`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

Secrets:

- `COOLIFY_API_TOKEN`
- `VERCEL_TOKEN`

Configure Vercel Preview environment variables specifically for the
`development` branch. In particular, browser API/auth URLs must target the
staging API and staging origins. Add `STAGING_WEB_URL` as a domain or alias on
the Artifact Vercel project before the first workflow run.

The Coolify staging application should build from this repository's
`development` branch. The workflow disables Coolify auto-deploy and pins the
exact revision itself, so GitHub Actions remains the deployment authority.

### Manual Redeploy Or Rollback

Run the `Staging` workflow from the `development` ref. Leave `revision` empty to
deploy the current `development` SHA, or enter an older full SHA that is still
an ancestor of `development`. The workflow redeploys both the Coolify stack and
Vercel web build at that same revision, then moves the stable alias only after
verification.

## Production Release

Production stays deliberately manual:

1. Prepare `docs/releases/vX.Y.Z.md` from `docs/release-template.md`, update
   package metadata and release status docs, and merge the release-prep PR into
   `development`.
2. Verify the release candidate on the stable staging environment.
3. Promote the reviewed `development` revision to `main` through a PR.
4. Run `.github/workflows/release.yml` from `main` with
   `tag-and-create-draft` (or `create-draft` when the tag already exists).
5. Review the draft GitHub Release, run `deploy-production`, and only then
   publish the draft.
6. Merge the released `main` revision back into `development` so both long-lived
   branches contain release status and deployment fixes.

`deploy-production` requires an existing release tag. It reruns the release
gate, stages Vercel without production domains, deploys Coolify at the exact
verified SHA, verifies the production API, optionally runs one provider-backed
AI smoke, promotes the same web deployment, and verifies the production domain.

The `production-release` GitHub Environment is the production approval and
credential boundary. It must remain separate from `staging`.

## Rollback Boundaries

- Staging rollback is a manual `Staging` workflow run for a previous
  `development` ancestor.
- Vercel production rollback may repoint domains quickly, but the public web
  must remain API-compatible with the currently deployed VPS revision.
- Full production rollback should redeploy a known release SHA through the
  production workflow rather than changing Coolify or Vercel independently.
- Database migrations must remain backward compatible across the web/API
  overlap window unless a release includes a separately reviewed maintenance
  plan.

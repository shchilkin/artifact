# Database

Database files for the private AI generation API described in
`docs/version-plans/v0.13-backend-contract.md`.

## Migrations

- `migrations/001_initial_ai_generation.sql` creates:
  - `users`
  - `assets`
  - `ai_generation_jobs`
  - `ai_usage_monthly`
  - `ai_rate_limit_events`
- `migrations/009_account_tiers_and_usage_foundation.sql` adds the additive
  v0.41 foundation for Account Tiers, Quota Grants and reversals, shared AI
  Operations, append-only Usage Events, provider reconciliation, and Admin
  audit records. It seeds existing API users as Free but does not switch
  authorization away from the legacy flags.

The first migration is plain PostgreSQL SQL so the deployment target can run it
with any migration runner or `psql` wrapper the VPS stack chooses later.

## Types

- `types.ts` exports row shapes and repository interfaces for DB adapters.

## Account Tier Migration Dry Run

Before entitlement cutover, inspect the exact Founder assignment and the
legacy AI-enabled review list without changing data:

```bash
DATABASE_URL=postgresql://... \
FOUNDER_ACCOUNT_ID=<exact-user-id> \
npm --workspace @artifact/api run migrate:account-tiers:dry-run
```

The command is intentionally read-only and exits if the exact Founder account
does not exist. It does not assign Creator, Founder, or Admin access.

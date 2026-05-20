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

The first migration is plain PostgreSQL SQL so the deployment target can run it
with any migration runner or `psql` wrapper the VPS stack chooses later.

## Types

- `types.ts` exports row shapes and repository interfaces for DB adapters.

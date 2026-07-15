# Admin API

The v0.41 Admin API is the only data source for the separate Artifact
backoffice. Every `/api/admin/*` request requires an authenticated account whose
persisted User Role is `admin`. Founder remains an Account Tier and does not
grant access to these routes.

## Read Routes

- `GET /api/admin/overview?period=YYYY-MM`
- `GET /api/admin/accounts?period=YYYY-MM&q=&limit=&offset=`
- `GET /api/admin/accounts/:userId?period=YYYY-MM`
- `GET /api/admin/usage?userId=&provider=&status=&limit=&offset=`
- `GET /api/admin/reconciliations?limit=`

Responses contain account identity, Tier state, Generation counts, Provider
Usage, reconciliation, and audit metadata. They do not contain prompts, shader
code, generated assets, or project documents.

## Mutation Routes

- `POST /api/admin/accounts/:userId/tier`
- `POST /api/admin/accounts/:userId/quota-grants`
- `POST /api/admin/quota-grants/:grantId/reversals`

Every mutation requires a non-empty `reason` and `idempotencyKey`. Tier
Assignments also require `expectedTier` and `expectedVersion`. The API returns
`409 admin_state_conflict` when the loaded Tier state is stale and keeps
completed idempotent retries read-only. Production executes each mutation and
its immutable audit event in one Postgres transaction.

The API does not expose User Role changes or account suspension.

## First Admin

Assign the first Admin out of band after the account exists:

```bash
npm --workspace @artifact/api run bootstrap:admin -- \
  --user-id ACCOUNT_ID \
  --confirm-user-id ACCOUNT_ID \
  --yes
```

Both account identifiers must match exactly. The command requires Postgres,
updates the User Role and writes an audit event in one transaction, then prints
metadata-only JSON. Repeating it for an existing Admin makes no change.

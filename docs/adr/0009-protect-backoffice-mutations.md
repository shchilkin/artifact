# Protect and audit backoffice mutations

Every backoffice mutation is authorized and validated by the API and produces
an immutable audit record containing the Admin, timestamp, reason, operation,
target account, and before and after state.

Tier Assignment requests include the expected current tier. If the account has
changed since the Admin loaded it, the API rejects the mutation with
`409 admin_state_conflict` and returns the current state for review rather than
silently overwriting it.

Quota Grant and other retryable mutations require an idempotency key scoped to
the Admin operation. Repeating a completed request returns its original result
and does not create another grant. Client-side pending controls improve the
interaction but never replace server-side concurrency and idempotency checks.

A successful mutation response includes the updated account summary and the
new audit record so the backoffice can reconcile its visible state immediately.

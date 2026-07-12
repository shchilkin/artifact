# Expose distinct AI access states

Artifact will present tier access, account allowance, and global service
availability as distinct user-facing states rather than one generic AI error.

- Free accounts can discover AI capabilities but cannot start them. The UI
  explains that Creator access is required and does not enter a loading state.
  The first release does not show Upgrade, checkout, or Request Access actions;
  access requests remain a future workflow rather than a non-functional CTA.
- Creator accounts see their remaining successful Generations out of 20 and
  the next UTC reset date near AI actions.
- Founder accounts see that AI access is active without an "unlimited" claim or
  a numeric allowance, because operational limits and the Safety Budget still
  apply.
- Exhausting an account allowance blocks only new AI operations and preserves
  prior results.
- A global Safety Budget stop is presented as temporary AI service
  unavailability, not as an account-quota problem.

API responses use stable machine-readable denial reasons so every AI surface
can render the same state and avoid inferring access from message text.

The initial denial contract is:

- `403 ai_tier_required` when the account has no provider-backed AI access;
- `429 generation_allowance_exhausted` with `resetAt` when the monthly account
  allowance is exhausted;
- `429 ai_rate_limited` with `retryAfter` for short-window request limits;
- `503 ai_budget_exhausted` when the global Safety Budget has stopped new work;
- `503 ai_provider_unavailable` for temporary provider failures.

Human-readable response messages are not API identifiers and may change without
requiring clients to reinterpret access state.

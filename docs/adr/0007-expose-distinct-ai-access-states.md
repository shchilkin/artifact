# Expose distinct AI access states

Artifact will present tier access, account allowance, and global service
availability as distinct user-facing states rather than one generic AI error.

- Free accounts can discover AI capabilities but cannot start them. The UI
  explains that Creator access is required and does not enter a loading state.
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

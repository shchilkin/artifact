# Preserve monthly usage across Tier Assignments

A Tier Assignment takes effect immediately but never resets or deletes the
account's Generation usage for the current UTC month.

- Free to Creator grants the Creator base allowance minus Generations already
  consumed in the month, plus any applicable Quota Grants.
- Creator to Free disables new provider-backed AI operations immediately while
  preserving usage and existing results.
- Creator to Founder removes the finite product allowance while usage and
  Provider Usage continue to be recorded.
- Founder to Creator is rejected when current-month committed usage and active
  reservations already meet or exceed the resulting Creator allowance.
- Repeated tier changes do not restore allowance or create rollover credit.

This prevents tier toggling from becoming a quota-reset mechanism and keeps all
monthly reporting continuous.

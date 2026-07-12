# Enforce a global AI Safety Budget

Artifact will enforce one monthly Safety Budget across all provider-backed AI
operations and all Account Tiers, including Founder. The budget is independent
of per-account Generation allowances.

The system warns administrators when estimated monthly provider spend reaches
80 percent of the configured budget. At 100 percent it rejects new
provider-backed AI operations before they start. Operations already in flight
are allowed to finish, and non-AI editor workflows remain available.

The first release reads the budget from server configuration. The backoffice
shows current spend, warning state, and stopped state, but cannot change the
budget. A later operational-policy feature may add audited configuration
without requiring a deployment.

This boundary favors predictable cost containment over uninterrupted AI access.
Provider totals can arrive later than internal Usage Events, so reconciliation
must surface unattributed or delayed spend instead of silently treating the
internal estimate as exact.

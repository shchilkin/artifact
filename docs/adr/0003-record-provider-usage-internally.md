# Record provider usage internally and reconcile provider totals

Artifact will persist append-only, user-attributed Usage Events for every AI
provider call and use them for backoffice detail. Provider admin APIs will be
used separately to reconcile total spend and reveal unattributed usage. Provider
totals alone cannot reliably explain which account or product operation caused
a cost, while an internal ledger alone cannot prove that every provider charge
was captured.

Detailed Usage Events are retained for 24 months. Monthly aggregates for
Generations, tokens, provider cost, status, provider, and model are retained
indefinitely, as are Tier Assignment and Quota Grant audit records. The schema
must support retention from its first release even if the scheduled purge or
archive job ships later. Creative Content is not copied into usage records or
aggregates.

Each Usage Event stores normalized provider usage without Creative Content:
provider, model, product feature, status, provider request identifier, relevant
input and output token counts, and image size or quality where they affect
pricing. Estimated cost is stored as an integer number of micro-USD together
with the pricing version or effective date used for the calculation. Historical
events are never repriced when provider prices change; new pricing applies only
to new events. Reconciliation differences remain explicit rather than mutating
past event costs.

Internal usage becomes visible as soon as a provider call completes. A
server-side daily job imports OpenAI aggregate usage for the previous completed
UTC day and records the reconciliation difference and last successful sync
time. An Admin may request a rate-limited refresh from the backoffice, but the
OpenAI Admin API credential remains only in API or worker environment
configuration and is never exposed to the browser. Reconciliation failures are
visible to Admins and retried without blocking user Generations.

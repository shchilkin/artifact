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

# Record provider usage internally and reconcile provider totals

Artifact will persist append-only, user-attributed Usage Events for every AI
provider call and use them for backoffice detail. Provider admin APIs will be
used separately to reconcile total spend and reveal unattributed usage. Provider
totals alone cannot reliably explain which account or product operation caused
a cost, while an internal ledger alone cannot prove that every provider charge
was captured.

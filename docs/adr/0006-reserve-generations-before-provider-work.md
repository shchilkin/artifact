# Reserve Generations before provider work

Artifact will reserve one Generation atomically before starting a
user-initiated provider-backed AI operation. A successful usable result commits
the reservation as consumed usage. A provider failure, rejected result, or
other operation that produces no usable result releases the reservation.

The reservation check uses the account's monthly allowance derived from its
Tier Policy, month-specific Quota Grants, committed Generations, and active
reservations. This prevents concurrent requests from spending the same final
Generation.

Each user action carries an idempotency key. Repeating the same action with the
same key returns or resumes its existing operation rather than reserving or
consuming another Generation.

Automatic shader repair calls remain Provider Usage and are recorded as their
own Usage Events, but they belong to the original user operation and do not
reserve or consume another Generation. Reservation state changes and expiry are
auditable so abandoned jobs can be recovered without manually editing used or
remaining balances.

The closed-alpha operational limits are shared across image and shader
features: one active provider-backed AI operation per account, ten operation
starts per account per rolling minute, and two concurrent provider calls per
worker. Creator and Founder use the same operational limits. These values are
server configuration rather than Tier Policy and may be tuned without changing
product allowances. A queued operation keeps only its existing Generation
reservation.

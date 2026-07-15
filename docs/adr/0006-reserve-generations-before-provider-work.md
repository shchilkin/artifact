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

Shader operations move from `running` to `awaiting_validation` after provider
work finishes. Browser compilation can still commit, reject, or repair the
reserved Generation, but this client-side validation wait does not consume an
active provider-operation slot. Repair moves the operation back to `running`
only while provider work is in flight.

Automatic shader repair calls remain Provider Usage and are recorded as their
own Usage Events, but they belong to the original user operation and do not
reserve or consume another Generation. Reservation state changes and expiry are
auditable so abandoned jobs can be recovered without manually editing used or
remaining balances.

The active-operation limit is shared across image and shader features and is
part of Tier Policy: Free accepts 0 active provider-backed operations, Creator
accepts 3, and Founder accepts 15. PostgreSQL serializes reservations per user
before checking active capacity and monthly allowance, so concurrent requests
cannot cross either limit. Ten operation starts per rolling minute and two
concurrent provider calls per worker remain operational safeguards independent
of Tier Policy. A queued operation keeps only its existing Generation
reservation.

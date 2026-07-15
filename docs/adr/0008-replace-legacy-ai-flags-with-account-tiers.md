# Replace legacy AI flags with Account Tiers

The Account Tier becomes the only source of product AI entitlement. The legacy
`ai_enabled` and `plus_status` fields do not map automatically to Creator or
Founder because they do not carry reliable product or billing meaning.

During migration, the founder's exact account identifier is assigned Founder
Tier and is separately granted the Admin User Role through the server-side
bootstrap flow. Every other existing account starts on Free Tier. The migration
produces a review report of accounts that previously had `ai_enabled=true`, so
an Admin can make explicit Tier Assignments where appropriate.

After cutover, authorization code reads Account Tier and Tier Policy only.
Legacy fields stop participating in access decisions and are removed in a
separate cleanup migration after the cutover has been verified. The old values
are not silently preserved as subscriptions.

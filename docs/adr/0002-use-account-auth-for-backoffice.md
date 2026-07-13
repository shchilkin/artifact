# Use account authentication for backoffice access

The Artifact backoffice will authenticate administrators through the existing
Better Auth account flow and authorize every admin API request by User Role.
It will not use a shared Basic Auth credential like the PopChoice backoffice,
because Tier Assignments and future account operations must be attributable to
a specific Admin.

The production backoffice domain also sits behind Cloudflare Access, initially
restricted to the founder's email. Cloudflare Access is a second perimeter and
does not replace Better Auth or the API's Admin-role check. Local development
and automated tests do not require Cloudflare Access; production does not offer
an application route or query-parameter bypass for it.

The first Admin is assigned out of band with a server-side CLI command that
requires an exact account identifier and explicit confirmation. The backoffice
MVP cannot change User Roles, and an Admin cannot promote another account from
the UI. Founder is an Account Tier and never grants Admin authority. Future
role-management workflows require a separate audited design.

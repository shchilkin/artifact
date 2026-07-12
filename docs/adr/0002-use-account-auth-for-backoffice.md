# Use account authentication for backoffice access

The Artifact backoffice will authenticate administrators through the existing
Better Auth account flow and authorize every admin API request by User Role.
It will not use a shared Basic Auth credential like the PopChoice backoffice,
because Tier Assignments and future account operations must be attributable to
a specific Admin. A deployment-level access proxy may add a second perimeter,
but it does not replace application authorization.

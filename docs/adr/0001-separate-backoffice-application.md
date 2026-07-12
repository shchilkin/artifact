# Run the backoffice as a separate application

Artifact will keep its admin-only backoffice in a dedicated monorepo workspace
and deployment instead of adding admin routes to the public editor. The
backoffice will reuse shared contracts and the existing API, but will have its
own runtime configuration, release checks, and browser tests. This adds a
deployment boundary, but keeps operational UI and future usage analytics out of
the editor bundle and allows the entire admin surface to receive an additional
network-access boundary.

Production serves the backoffice at `backoffice.artifact.shchilkin.dev` from a
dedicated service on the same VPS as the Artifact API. Sharing a host does not
merge their runtimes: the backoffice has its own container or service,
configuration, health check, deployment step, and rollback boundary. The API
explicitly allows the backoffice origin and configures Better Auth cookies and
trusted origins for both Artifact clients.

`apps/backoffice` will use the repository's React Router framework and Vite
toolchain in SPA mode. It may reuse shared contracts and UI primitives, but it
does not connect directly to Postgres. Reads and mutations go through
`/api/admin/*`, where the API authenticates the Better Auth session and checks
the Admin role for every request. The workspace has its own development,
build, check, and focused browser-test commands.

The first backoffice release contains four operational views:

1. **Overview** shows account counts by tier, monthly Generations, provider
   spend, failures, and Safety Budget health.
2. **Accounts** provides account search and shows tier, monthly allowance
   usage, and registration metadata.
3. **Account Detail** supports Tier Assignments and Quota Grants and shows their
   audit history alongside monthly usage.
4. **Provider Usage** breaks down tokens, cost, status, provider, and model and
   supports reconciliation against provider totals.

These views do not expose Creative Content such as prompts, shader code,
generated assets, or project documents.

# Run the backoffice as a separate application

Artifact will keep its admin-only backoffice in a dedicated monorepo workspace
and deployment instead of adding admin routes to the public editor. The
backoffice will reuse shared contracts and the existing API, but will have its
own runtime configuration, release checks, and browser tests. This adds a
deployment boundary, but keeps operational UI and future usage analytics out of
the editor bundle and allows the entire admin surface to receive an additional
network-access boundary.

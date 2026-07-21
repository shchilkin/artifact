# Publish Artifact Runtime as an independent experimental package

Artifact Runtime will be developed in this monorepo under `packages/runtime`
and published independently from Artifact product releases. Artifact versions
continue to describe editor/product release theses, while runtime package
versions describe the external playback API. A runtime release therefore does
not need to match the Artifact version that created a compatible document.

The first releases use the public npm package
`@shchilkin/artifact-runtime`, prerelease versions such as
`0.1.0-alpha.1`, and the `experimental` dist-tag. Consumers pin an exact
version without a range. The package must not be published as `latest` while
the portfolio validation is active.

The consumer boundary is framework-independent and browser-safe. React,
React Router, editor UI, account state, cloud project storage, and private
workspace packages are not part of the public runtime API. The package may
reuse canonical renderer source inside the monorepo, but its published output
must install and run as a self-contained consumer dependency.

The runtime consumes a portable Artifact project package and declares which
document schema versions it supports. `createdWith` product metadata may aid
diagnostics, but exact Artifact application versions do not gate playback.

This keeps a disposable experiment out of Artifact's product release contract.
If the validation fails, the prerelease can be deprecated and consumers can
remove it without migrating Artifact documents. If it succeeds, stable package
versioning and durable motion authoring require separate decisions.

The first portfolio validation succeeded on 2026-07-21. Publication remains
deferred until a second real cover validates the API and the packed-consumer,
performance, and repeated-cleanup gates pass. Until then the portfolio pins a
checked-in `0.1.0-alpha.3` tarball rather than depending on a registry release.

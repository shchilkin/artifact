---
name: artifact-release
description: Prepare, verify, draft or publish Artifact core, Web or macOS releases. Enforces component version sources, compatibility checks and release notes before publication.
---

# Artifact Release

Read `AGENTS.md`, `docs/component-releases.md`, `docs/release-template.md`,
`docs/production-readiness.md`, `docs/version-planning.md`, `docs/roadmap.md`
and the selected component plan before release work. Read
`docs/native-builds.md` for core/Mac artifacts and `docs/deployment.md` for Web
deployment. Run repository commands from the root.

## Preparation

1. Establish the component (`core`, `web`, `macos`), approved version and scope.
   For tooling-only work, preserve current versions; example numbers are not
   authorization to choose or bump a release.
2. Follow version sources and synchronized adapter/lock metadata in
   `docs/component-releases.md`. Mac has a separate build number. Root package
   metadata is not an app version; document schema is a separate contract.
3. Prepare `docs/version-plans/<component>/vX.Y.md` with completed acceptance
   criteria and `Status: release-ready`. Fill
   `docs/releases/<component>/vX.Y.Z.md` from `docs/release-template.md`, with
   validation, manual QA, compatibility boundaries and accepted risks. Record
   the component tag in roadmap/readiness. Keep public notes free of internal
   checklists. Preserve historical `vX.Y.Z` files/tags.
4. Run `npm run release:verify -- --metadata-only`, `npm run test:release`,
   then `npm run release:verify -- --component <component> --version X.Y.Z`.
   Metadata verification is not the build/test gate. Do not mark unexecuted
   checks passed or create release facts to make the verifier green.
5. Run common Rust/WASM/Swift document compatibility checks plus the selected
   application gate from `docs/component-releases.md`. Keep the exact source
   commit and embedded-core content/runtime identity with build evidence.
   Record relevant performance checks or why they are not required.

## Publication boundaries

Use the manual component `Release` workflow's `verify` action before mutation.
Tag/draft creation, publication, and Web deployment are separately authorized
actions. Existing session authorization applies; do not request it again.

- `tag-and-create-draft` creates a new `<component>/vX.Y.Z` tag and draft.
- `create-draft` requires an existing tag at the exact checked commit.
- `publish-draft` requires that tag, a draft with verified notes and required
  assets, and passed gates.
- `deploy-production` is Web only and preserves its exact-SHA Web/API flow.

Writes require a clean release commit on `main` and the protected
`production-release` environment. Never move existing tags, publish npm/crates
packages or deploy core/Mac as a side effect. A core release does not update
clients or establish full native parity. If notes, evidence, identity, metadata
or approvals required for the requested action are missing, complete available
preparation and report the specific missing facts before publication.

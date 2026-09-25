# Independent component releases

Core, Web and macOS have independent release versions and dates. Core is an
embedded client dependency: publishing core does not update installed Mac apps
or deployed Web assets. Public crates.io/npm publication is disabled.

## Sources of truth

| Stream | Version source | Tag | Release notes |
| --- | --- | --- | --- |
| Core and Rust/WASM/Swift adapters | `Cargo.toml` workspace package | `core/vX.Y.Z` | `docs/releases/core/vX.Y.Z.md` |
| Web | `apps/web/package.json` | `web/vX.Y.Z` | `docs/releases/web/vX.Y.Z.md` |
| macOS | `apps/macos/app-version.json` | `macos/vX.Y.Z` | `docs/releases/macos/vX.Y.Z.md` |

Rust core, `artifact-wasm` and `artifact-ffi` inherit one workspace version;
`packages/artifact-core-web/package.json`, Cargo.lock and npm workspace lock
metadata must agree. When that version changes, update the Web workspace's
adapter dependency and its lock entry without bumping the Web app version.
The dependency version selects workspace metadata; it does **not** pin local
path dependency contents. The build identity below records the actual inputs.

Root `package.json` is private workspace/tooling metadata. Its version and its
own lock entries remain internally consistent but do not version a client.
Web's version and lock entry can change independently. Mac has an independent
`version` (three numeric fields) and positive decimal string `buildNumber`.
Use a higher build number for each distributed Mac build, including a rebuild
of the same marketing version. The verifier checks its format; release prep
must compare it with the last distributed build.

The migration preserves existing values: core `0.1.0`, Web `0.48.0`, and the
Mac app's previously inherited `0.48.0`, now explicit with build number `1`.
These are development metadata, not approved upcoming release numbers. The
previously discussed `0.2.0 / 0.49.0 / 0.1.0` examples do not choose releases.
No new release notes are fabricated for these versions. Existing `vX.Y.Z`
tags and `docs/releases/vX.Y.Z.md` remain historical, unmodified artifacts.

`.artifact` package version, document schema version, API contract version,
core version and client version are separate contracts. A component release
must state supported document formats and migration effects without changing
the schema merely because a component version changed.

## Build identity

Every client build records `build-identity.json`: Web emits it in
`apps/web/build/client/`; Mac embeds it in `Contents/Resources/`. It contains:

- client component/version, full source commit, local dirty flag;
- Mac build number, also used in `CFBundleVersion`;
- core version plus a SHA-256 map of all Rust crate inputs, Cargo manifests,
  Cargo.lock and the pinned Rust toolchain;
- adapter source/binding hashes;
- exact generated WASM/runtime hashes for Web or the linked static library
  hash for Mac.

`node scripts/release/verify-build.mjs web|macos --require-clean` compares
the emitted identity with current inputs; native verification also checks the
plist version/build/SHA. Local diagnostic checks can omit `--require-clean`.

The aggregate digests include paths and content hashes in sorted order. Local
changes to path dependencies remain distinguishable at an unchanged version
and Git HEAD. Web first verifies the checked-in source/runtime manifest. A
full source SHA is mandatory; provider and Git SHAs must agree when both
exist. A provider source archive without Git records `dirty: null` (unknown),
not a false claim that the archive was a clean Git checkout. Release CI uses a
clean checkout; local dirty builds are diagnostic artifacts only.

Build identities are provenance records, not signatures or reproducible-build
attestations. Rust/WASM is rebuilt on the canonical pinned Linux toolchain;
Mac uses the checked-in Cargo lock and current supported Xcode toolchain. The
Mac archive is still ad hoc signed. Developer ID, notarization, updater and
public distribution policy remain separate work.

## Verification versus publication

`npm run release:verify -- --metadata-only` checks **all** component versions
and lockfiles. It is safe on ordinary feature commits, with no release notes
or release number invented. `npm run test:release` proves routing, mismatched
versions, exact tag commit checks, identity changes and blocked publication.

For an actual candidate, first choose its component and approved version.
Copy `docs/release-template.md` to the component notes path and create
`docs/version-plans/<component>/vX.Y.md`. The plan must have all acceptance
criteria complete and `Status: release-ready` (or `Status: released`). Record
`### <component>/vX.Y.Z Release Prep` in production readiness and the full tag
in the roadmap. Existing historical Web plans remain where they are; future
component plans can refer to their scope without renaming historical files.

```sh
npm run release:verify -- --component web --version X.Y.Z
npm run release:verify -- --component macos --version X.Y.Z
npm run release:verify -- --component core --version X.Y.Z
```

These commands verify metadata and release facts only. They do not execute the
build/test gate. `--skip-tag-check` is available only for verification of notes
and plans; mutation actions never use it. Unknown arguments fail. The manual
`Release` workflow offers an explicit component and action:

| Action | Behavior |
| --- | --- |
| `verify` | Check a new candidate, run compatibility and selected client gates; no writes |
| `tag-and-create-draft` | After gates and approval, create a new component tag and draft |
| `create-draft` | Require an existing component tag at the checked commit, create draft |
| `publish-draft` | Require that exact tag, existing draft, verified body and required assets; publish |
| `deploy-production` | Web only: preserve exact-SHA Web/API deployment and promotion order |

A verify run expects an unused tag. To prepare a draft from an already existing
tag, use `--action create-draft` with the verifier (still read-only). Mutation
jobs require `main`, a clean checkout and the existing `production-release`
environment approval. Existing tags are never overwritten or moved. Drafts
attach the verified Mac zip or Web build identity. Core uses GitHub's tagged
source archive; there is no npm/crates publishing. No component claims GitHub's
global “latest” release, which would mix three independent histories.

## Compatibility gate and application gates

Every candidate, including Web-only and Mac-only releases, runs the common
`native-tooling.yml` checks: canonical WASM regeneration/freshness, Rust tests
and clippy, WASM/TypeScript tests, native build and the public document fixture
roundtrip, Swift/UniFFI versus Rust/WASM command results, and native model/render
checks. Ordinary PRs (including stacked PRs) run the same compatibility checks.
Shared logic changes therefore cannot escape either adapter or document
compatibility validation because only one client is shipping.

The selected application adds delivery checks:

- Web: `npm run check`, `npm run build:ci`, full
  `npm run test:browser:release`, changed-code Fallow `--gate new-only`.
- macOS: bundle identity and ad hoc signature, zip extraction, executable and
  signature verification. Record GUI acceptance for the actual native scope.
- Core: shared compatibility gate; no Web deployment or client release implied.

The common gate compiles the native app to exercise its adapter/model harness;
that does not make a core or Web release a Mac delivery. The native distribution
archive is only produced for a Mac release (and ordinary PR diagnostics).
The final gate fails on a failed, cancelled or skipped required job. Deployment
retains the Web browser and Fallow gates, stable production concurrency lock,
main/environment approval, staged Web verification, exact-SHA Coolify/API check,
optional explicitly selected paid AI smoke, Web promotion last and final domain
verification. See [deployment.md](./deployment.md); no API stream was added.

## Transition checkpoint and first-release checklist

Implementation starts at verified P06 #284 SHA
`2ad3a2e9b130fa3b822f4634361be9c5c2d4423c`, observed open/draft with green CI on
2026-09-25. P03 #282 remains its parent. P04 #283 is a sibling over P03 and is
not incorporated by this release work. Native feature/render parity remains
bounded by [P06](./native-2d-render-foundation.md), not complete parity.

Before the first component release:

1. Integrate the reviewed parent chain and this tooling PR, preserving sibling
   work separately. Revalidate the resulting commit and compatibility gates.
2. Choose each actual release number, scope and Mac build counter independently.
3. Fill component plan/notes, compatibility boundaries, validation evidence,
   manual QA and accepted risks; update roadmap/readiness status.
4. For a Mac release, decide whether the ad hoc archive is an internal release
   or complete the separately scoped signing/notarization/distribution work.
5. Run the `verify` workflow at the release candidate; retain exact-SHA identity
   and validation evidence. Promote through reviewed `development` -> `main`.
6. Request the separate tag/draft action, review the draft, deploy Web only
   through its existing approved flow, then separately authorize publication.

No release numbers are bumped, tags created or production settings changed as
part of this transition.

## Tooling validation at implementation

On 2026-09-25 this transition passed `npm run check`, `npm run build`,
`npm run check:core-web`, canonical Linux WASM regeneration, native Mac build,
`npm run check:core-native`, both build-identity checks, codesign validation
before/after zip extraction, 11 release-tooling tests, 26 deployment tests,
5 core-tooling tests, actionlint on all three modified workflows, and release
skill validation. Production Chromium public-shell smoke passed 2/2. The full
cross-browser publication suite was not run for this tooling-only PR; it
remains mandatory in the Web release workflow. No renderer/interaction changes
were made, so node-editor performance benchmarking was not required.

Fallow's changed-code report found no duplication. Two new unused exports were
confirmed through trace and made private. Its remaining complexity findings
use estimated missing coverage, including command-recorder test helpers; the
release tests exercise the publication guards without any real mutation.
The report is review evidence, not a claim that the release Fallow gate passed.
No release workflow, tag, package publication, merge or deployment was executed.

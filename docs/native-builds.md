# Web, WASM and native macOS builds

Issue [#262](https://github.com/shchilkin/artifact/issues/262) is implemented on
the coordinator-approved stacked base
`78d47bd27d70c1e30ab9cef45fc195bd578698e5` (P01 draft PR #279 on top of
foundation draft PR #259). Neither parent PR was merged when this branch began.
This is an explicit exception to the epic's normal merged-prerequisite rule;
the issue labels and dependency tracker are unchanged pending integration.

## Toolchains and commands

The source of the Rust version and targets is [`rust-toolchain.toml`](../rust-toolchain.toml):
Rust 1.95.0, `wasm32-unknown-unknown` and Apple Silicon
`aarch64-apple-darwin`. Cargo uses the checked-in `Cargo.lock` with `--locked`.
The `wasm-bindgen-cli` version must equal the `wasm-bindgen` package in that
lockfile (currently 0.2.128). The CLI and the pinned Rust toolchain must be
installed before regenerating WASM. Node.js `^20.19.0 || >=22.12.0` and npm 11 are
required; run `npm ci` in **each worktree** so workspace links point at the
correct checkout. Never share another worktree's `node_modules` symlink.

The native target is Apple Silicon, macOS 14 or later. It requires a full
Xcode installation with Swift 6, `xcrun swiftc`, and `codesign`. The local
build was verified with Xcode 26.6 / Swift 6.3.3 on macOS 26; CI uses the
versioned [`macos-15` Apple Silicon runner](https://docs.github.com/en/actions/reference/runners/github-hosted-runners).
The minimum compatible Xcode release is not yet established by a separate
oldest-toolchain test. `just doctor` checks the complete toolchain on an Apple
Silicon host. The `web`
doctor mode needs only Node/npm and local npm dependencies; `wasm` adds Rust,
the WASM target and `wasm-bindgen`; `macos` checks Rust and the native Apple
tools. The main Web editor can start with the checked-in WASM runtime without
a local Rust installation.
The first native bundle is locally ad hoc signed only.

Install [just](https://github.com/casey/just) and use:

```sh
just doctor          # prerequisites on this host
just dev-web         # main React Web editor
just dev-macos       # build and open the native SwiftUI app (macOS only)
just build           # generated WASM, native app, normal Web CI build
just check           # existing Web gate plus Rust/WASM/native checks
```

On Linux, run the platform-specific commands directly:

```sh
node scripts/core-pilot/doctor.mjs web
node scripts/core-pilot/runtime-manifest.mjs
npm run dev:web
```

For a Linux WASM rebuild and Web validation, use:

```sh
node scripts/core-pilot/doctor.mjs wasm
npm run build:core-pilot -- wasm
npm run check:core-web
npm run build:ci
```

On Apple Silicon macOS, `node scripts/core-pilot/doctor.mjs macos`,
`npm run build:core-pilot -- macos`, and `npm run check:core-native` build and
execute the native model and renderer checks. `npm run test:core-tooling`
tests missing-prerequisite diagnostics and stale-manifest rejection. These
commands do not replace the existing Web deployment build or release gates.

## Generated runtime and app identity

`npm run build:core-pilot -- wasm` compiles the WASM crate and regenerates
`packages/artifact-core-web/generated/` with pinned `wasm-bindgen-cli`. It
writes `manifest.json` last. The WASM build owns Rust flags: it replaces any
inherited `RUSTFLAGS` or `CARGO_ENCODED_RUSTFLAGS`, remapping the workspace
root to `/workspace` and Cargo home to `/cargo`. This removes host-specific
source paths from panic locations; generation fails if the output still embeds
either original host path. A local rebuild with an alternate Cargo-home path
produced the same WASM SHA-256 after remapping. The manifest hashes
`Cargo.lock`, the Rust toolchain pin, the generator script, Cargo manifests
and **all nested** Rust
sources in the core and WASM adapter, plus the generated JS/TS/WASM bytes.
The regular Web `build` and `typecheck` paths reject a stale manifest.
The WASM CI job rebuilds the runtime from source and fails if any generated
file differs from the reviewed checkout. Regenerate and commit the output
whenever any of these inputs change; editing only the manifest cannot pass
that clean rebuild check.

The one app version source is the root `package.json`. The Web Vite build
already reads that value and its Git commit for `getAppBuildInfo`. The native
build reads the same root version and full `git rev-parse HEAD` via
`scripts/core-pilot/build-identity.mjs`. Its local artifact is
`apps/macos/.build/Artifact.app`, with version and full SHA in `Info.plist`
and `Contents/Resources/build-identity.json`. A `dirty` flag identifies local
builds with uncommitted tracked or untracked files. CI verifies the bundle's
SHA against its checkout and validates the ad hoc signature. This is an
identifiable internal build, not a notarized or distributed release.

## Public checks and evidence limits

`scripts/core-pilot/public-fixture.mjs` wraps P01's synthetic
`tests/fixtures/native-2d/text-font.artifact.json` in the existing portable
project envelope and adds one supported Scanlines effect for the pilot model
check. It logs the public source fixture's SHA-256 and writes an ignored test
input. `check:core-native` executes the Swift model lifecycle, a real native
PNG render, and seven exact Swift/WASM effect-kernel comparisons. These checks
do not read `viber.local`; the earlier optional Viber diagnostics remain
separate. P01's richer fixtures remain planned parity evidence, not a claim
that all those capabilities render on native Mac today.

The new `native-tooling.yml` runs for pull requests to any base (including a
stacked draft), and on pushes to `development` or `main`. Its Ubuntu job
rebuilds WASM, checks generated freshness, Rust tests/clippy and Web build;
its Apple Silicon job builds and **executes** native checks and preserves the
identifiable app as a CI artifact. The workflow has read-only repository
permissions and no deployment, release, notarization or updater step. A
passing model/render job is not GUI workflow proof or measured performance;
those remain separate epic gates.

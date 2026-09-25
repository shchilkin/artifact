# Web and macOS integration base

This checkpoint combines the reviewed sibling branches for epic
[#260](https://github.com/shchilkin/artifact/issues/260). It is a shared base
for subsequent work, not a release or full native editor acceptance.

## Integrated inputs

| Input | Pinned source commit | Included work |
| --- | --- | --- |
| Web #289 | `fdbc684595c8343b9a56eef06b14d02118368e21` | Foundation, P01–P04 and the main Web shared session |
| Assets #287 | `32c585ba1e1ee54e57e52db59657b404bca967a9` | Atomic root assets, document replacement and cold image commands |
| macOS #288 | `dd61d4da6a0d69f6b9a77d08980fa423f3f6a779` | P06 render foundation and P07 files, fonts, recovery and export |
| Release tooling #285 | `b1db3deffdf74529effb315e5eb1a13a5c6ce8ed` | Independent component metadata, build identity and release gates |

The parent development commit is
`d6ff1af04920e890b61468b032c531a8908e0075`. Merge ancestry retains each input;
earlier asset cherry-picks are not applied twice. Existing draft PRs and issues
remain open pending coordinator review. No release version, tag or deployment
is created by integration.

## Resolution decisions

- Keep P04 typed graph commands, nonlinear graph editing safeguards and future
  graph metadata validation from Web. The native renderer continues to reject
  unsupported nonlinear graphs; P09 owns their rendering.
- Keep the cold PNG/JPEG command allowance and its rejection, rollback and
  Undo/Redo tests. Asset command types appear once in the TypeScript adapter.
- Add native aspect, blend and tile support plus P07's chromatic-aberration
  scaling against Web's 540-pixel reference. Durable document values do not
  change when rendering.
- Keep both the real-WASM graph suite in `check:core-web` and native file,
  model and raster suites in `check:core-native`. Retain release-tooling checks
  and component-specific build identities.
- Regenerate checked-in WASM using the pinned Linux x86-64 producer after all
  source and generator changes are combined. Neither sibling binary is the
  integration runtime.

## Validation and handoff

Validate the final commit with `npm run check`, `npm run build`,
`npm run check:core-web`, `npm run test:core-tooling`,
`npm run quality:native-2d-contract`, `npm run build:core-pilot -- macos` and
`npm run check:core-native`. Check both client build identities with
`node scripts/release/verify-build.mjs web|macos --require-clean`.

Run focused browser coverage for main Web session editing, project storage,
the native 2D contract and existing 3D compatibility. For a locally saved Mac
file, set `P05_NATIVE_ROUNDTRIP_PATH` when running
`tests/browser/p05-main-web-session.spec.ts`. Keep private source artwork out
of repository fixtures. Observe a representative real Web → Mac → Web path;
record GUI evidence separately from adapter/model checks. The integration PR
records results and exact build commit, including any checks not completed.

Subsequent P08 and P09 work must start from the same reviewed integration
commit in separate worktrees. Their implementation has not started as part
of this checkpoint. The epic's normal merged-prerequisite rule still applies
unless the coordinator explicitly approves another stacked-work exception.

## Remaining boundaries

Native layers/nodes UI, graph utility rendering, remaining effects and the full
performance/acceptance matrix remain downstream work. Small inline
AVIF/GIF/SVG/WebP imports can fail core source validation when IndexedDB is
unavailable; normal stored asset references and PNG/JPEG fallback are covered.
The existing Web transient primitive camera overlay can override a restored
persisted camera state; this is a code-inferred limitation, not a new GUI
acceptance claim. Finder drag/drop and bitmap-only clipboard acceptance remain
unobserved unless a later evidence record explicitly covers them. Prior P06
timings and sibling GUI observations are not measurements of this build.

See [the parity contract](./native-2d-parity-contract.md),
[main Web integration](./web-macos-main-web-integration.md),
[native files/export](./native-files-export.md) and
[component releases](./component-releases.md) for the preserved boundaries.

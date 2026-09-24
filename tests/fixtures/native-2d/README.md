# Native 2D parity fixtures

These documents are synthetic, portable `CanvasDocument` JSON files for issue
#261. Rebuild them with `node tests/fixtures/native-2d/generate.mjs`, then run
`npx biome check --write tests/fixtures/native-2d/*.json`. They have
fixed IDs, seeds and timestamps. The image is generated RGBA PNG data with a
transparent border; no project image is copied from a user document.

`CoveredByYourGrace.ttf` and `OFL.txt` are from the [Google Fonts repository](https://github.com/google/fonts/tree/main/ofl/coveredbyyourgrace), downloaded
2026-09-24. The font is licensed under the SIL Open Font License 1.1. Its
SHA-256 is `8a7e5687a4f9aad95243eb28cdc624009a335e0de5175113bc5f1348a4d67fd7`.
The embedded copy in `text-font.artifact.json` is byte-identical. This font
contains the fixture's Latin title; a separate multilingual glyph fixture may
be added when the native font policy is implemented.

Open a document with the main Web editor's **Open document file** action, or
for small files use `/app?doc=` with URL-encoded document JSON. File import
avoids long URL limits for the embedded font and 100-node scene. The
confirmation dialog must be accepted. This route tests the real editor, not the
isolated pilot.

The eight editor documents exercise different requirements:

| Document | Independent Web behavior under test | Future native owner |
| --- | --- | --- |
| `text-font.artifact.json` | Editable title, embedded font load, geometry and save/reopen | #267, #268 |
| `alpha-nonsquare.artifact.json` | 4:5 transparent border, semitransparent image pixels and placement | #266, #267 |
| `alpha-jpeg.artifact.json` | Same alpha source with JPEG scale 2 export setting | #267 |
| `blend-modes.artifact.json` | Normal, multiply, screen, overlay and luminosity layers | #266 |
| `branch-merge-mask-repeat.artifact.json` | 16:9 branching graph, repeat then alpha mask, merge output | #264, #269, #270 |
| `source-families.artifact.json` | Noise, array, line field and seeded emoji | #271 |
| `graph-utilities.artifact.json` | Color, transform and grime-shadow chain | #269 |
| `hundred-node.artifact.json` | 9:16, exactly 100 layer-backed graph nodes, output path | #277 |

`effect-cases.json` is an acceptance *case index* for future per-preset
documents, not an editor document. A case indexed there is planned evidence;
its existence does not imply native support or a completed visual comparison.
Each effect issue must add its own focused variant/boundary fixture and
comparison evidence before changing status to supported.

## Current Web reference

[`web-reference.json`](web-reference.json) records an independent import and
downloaded export from the main Web editor for all eight documents, plus two
mutations of the branch graph. It is pinned to product source
`ca2a1e2b408998436414b2efde69777b65e249f5` and fixture revision
`66cb64f379a2af609f2a1a0a93f8d6ad408e65c3`. Capture used Chrome
153.0.8010.53 on an Apple M5 Max with 36 GiB of memory and macOS 26.6.2
(25G83). These are capture metadata, not native performance measurements.
Each import completed without a page exception. The report includes input and
fixture hashes, imported layer and graph structure, export dimensions, decoded
RGBA hashes, alpha counts and selected pixels.

The embedded font registered as a loaded face; its exported ink bounds at the
canonical 1000 × 1000 base resolution were x=63, y=338, width=874 and
height=172 under the report's stated threshold. The 4:5 PNG exported at
1080 × 1350 with a clear top-left pixel `[0,0,0,0]` and a semitransparent
center pixel `[30,180,220,220]`. The 2× JPEG exported at 2160 × 2700; its
formerly clear corner decoded as opaque black `[0,0,0,255]`. Both
`repeat-count-1` and `mask-inverted` changed the graph export's decoded RGBA
hash. The report is an observed Web baseline, not a cross-platform byte-exact
pixel gate or native GUI proof. Future owners must add native comparison and
effect-specific variants before claiming parity.

To capture a new observation, install dependencies in the selected worktree
with `npm ci`, start that checkout's main Web dev server, then run:

```bash
node tests/fixtures/native-2d/capture-web-reference.mjs \
  "$PWD" http://127.0.0.1:4194/app /private/tmp/native-2d-web-reference-next.json \
  PRODUCT_SOURCE_SHA FIXTURE_SHA SERVED_SOURCE_SHA
```

Pass full 40-character commit SHAs. `PRODUCT_SOURCE_SHA` identifies the Web
product code; `FIXTURE_SHA` identifies these input files. The script rejects
product changes under `apps/web`, `packages` or `crates` since the supplied
source commit and checks all fixture file hashes against the fixture commit.
`SERVED_SOURCE_SHA` is an explicit operator acknowledgement that `BASE_URL`
serves that product checkout; it must equal `PRODUCT_SOURCE_SHA`. No runtime
endpoint verifies the server identity, so confirm the server/worktree before
running. The output is a new report; keep the historical report pinned to its
recorded revisions rather than changing its labels. The script exercises the
real editor's file import and export, not an isolated renderer route.

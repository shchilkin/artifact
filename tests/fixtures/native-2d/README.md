# Native 2D parity fixtures

These documents are synthetic, portable `CanvasDocument` JSON files for issue
#261. Rebuild them with `node tests/fixtures/native-2d/generate.mjs`, then run
`npx biome check --write tests/fixtures/native-2d/*.json`. They have
fixed IDs, seeds and timestamps. The image is generated RGBA PNG data with a
transparent border; no project image is copied from a user document.

`CoveredByYourGrace.ttf` and `OFL.txt` are from the [Google Fonts repository]
(https://github.com/google/fonts/tree/main/ofl/coveredbyyourgrace), downloaded
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

| Document | Independent Web observation to capture | Future native owner |
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

# Native macOS 2D parity contract, version 1

Issue [#261](https://github.com/shchilkin/artifact/issues/261) establishes the
acceptance contract for epic [#260](https://github.com/shchilkin/artifact/issues/260).
The source base is `ca2a1e2b408998436414b2efde69777b65e249f5`, the
inspected head of draft PR #259. This P01 branch changes docs and synthetic
fixtures only; it is not the integrated base for P02–P18. A coordinator must
record an integrated SHA or approve a stacked base before those issues start.
No existing release milestone is remapped by this contract.

The machine-readable inventory is
[`native-2d-capabilities.json`](./native-2d-capabilities.json). Its `native`
values are source-inspected starting states: `implemented` means the bounded
case exists, `partial` means only some controls/workflows exist, and
`missing` means the real native editor cannot complete the case. None means
full parity has passed. The manifest assigns all 66 Web presets once: seven
pilot effects to #276 for regression/library acceptance, and 59 missing
presets to #272–#275 (18/21/10/10). Every entry has one primary owner and a
fixture or planned acceptance case; cross-cutting owners still collaborate at
the documented seams. The [effect case index](../tests/fixtures/native-2d/effect-cases.json)
is planned evidence, not 66 completed comparisons.

## Reference and boundaries

The main Web `/app` editor, its `CanvasDocument`, renderer facade and
`EFFECT_PRESETS` define existing behavior. The isolated core-Web pilot is a
conformance aid, not the Web acceptance client. Capture expected graph
composition, geometry and export from Web at the pinned source revision
before adjusting native code. Do not derive an expected image from a new Rust
or Swift implementation. Save Web observations with browser version, output
dimensions, document hash, seed and exact changed fields.

Native starts with text, image, fill, emoji and seven effect kernels, square
rendering, normal blend and a linear graph export path. Existing native
document preservation, some Layers/Nodes controls and PNG export are useful
but do not imply support for other graph utilities, procedural sources,
non-square art, JPEG, Web scales or the remaining 59 effects. The main Web
currently has property patches routed through WASM for supported fields; it
still owns broad commands and history in TypeScript. #263 then #265 must
establish one durable history owner on each active document timeline.

The scope is local 2D Web + native SwiftUI/AppKit macOS in this monorepo. The
existing Web renderer stays in place. 3D/model/material/environment, shader
nodes, cloud/auth/share, AI generation, chat and other OS clients are outside
the epic. Web-only fields and nodes must remain lossless on a Mac roundtrip,
with an explicit capability message and blocked edits/exports when required;
silently flattening, dropping or rewriting them fails acceptance.

## Document and command semantics

`CanvasDocument` is JSON data. Graph topology and layer array order are
separate durable fields; neither may be regenerated from the other on open,
save, or unsupported-node inspection. Imported image/font bytes belong in
portable packages or an asset store, with stable document references; decoded
images, font faces, canvases, GPU objects and render caches stay outside the
document. Save/reopen must preserve unknown fields and unsupported graph
members byte-for-byte at the JSON value level, aside from declared package
metadata and normalization of known legacy defaults. No-op or rejected
commands leave document, revision and history unchanged.

P03 owns a versioned command/result envelope with an explicit document
revision and minimal changed IDs/fields. A gesture begins a transaction,
updates transient values, then commits once; cancellation restores the
pre-gesture document and adds no history entry. A committed drag or slider
gesture is one Undo action; Undo restores the complete prior durable document,
Redo reapplies it, and a fresh edit after Undo clears Redo. Locks and invalid
connections reject atomically. The not-yet-migrated Web operations require an
explicit transaction bridge into the same timeline; two simultaneous Rust and
TypeScript undo stacks are forbidden. Bindings pass asset references and
metadata across hot command calls, not image/font payload copies.

For each fixture, run this shared sequence in both real clients when its
owners land:

| Fixture | Edit and expected Undo/Redo | Save/reopen invariant |
| --- | --- | --- |
| `text-font` | Change title content and drag once; Undo restores position in one step, next Undo restores text, Redo reapplies both. | Editable text, font URI, embedded font bytes and geometry survive. |
| `alpha-nonsquare` | Move image then change aspect to 9:16; Undo restores 4:5 and prior placement. | Transparent corners, semitransparent image pixels and image payload survive. |
| `alpha-jpeg` | Change JPEG scale 2 to PNG scale 1; Undo restores both export fields together. | Export setting and image source survive; JPEG is compared after flattening policy is recorded. |
| `blend-modes` | Change overlay layer opacity; Undo restores its original 35 value. | All five layer blend values survive, even if native cannot yet render them. |
| `branch-merge-mask-repeat` | Change repeat count and mask invert in two actions; Undo twice restores original graph values. | All edges, ports, utility nodes, area membership and export target remain identical. |
| `source-families` | Change noise seedOffset and line-field orientation separately; Undo restores both in reverse order. | Procedural parameters and emoji choices remain editable. |
| `graph-utilities` | Change color saturation, transform rotation and shadow spread; Undo restores each action. | Three utility nodes and their chain remain intact. |
| `hundred-node` | Move one node and edit one fill; Undo restores each without changing other 99 nodes. | 100 layer-backed nodes, 100 edges, positions and output path survive. |

The fixture documents and font provenance live in
[`tests/fixtures/native-2d`](../tests/fixtures/native-2d/README.md). They are
redistributable and self-contained. The private Viber project stays in
`*.local` outside Git and CI; it is an optional owner visual check, never the
only acceptance source. Import the documents through the real Web **Open
document file** action. `/app?doc=` is convenient for small documents, but the
font and 100-node documents should use file import to avoid URL limits.

## Render and export comparisons

First compare semantic invariants exactly: dimensions and aspect, graph
upstream selection/order, edge ports, source placement, canvas transparency,
blend mode selection, mask polarity, text content and font identity, and
roundtrip JSON values. Use fixed seeds and compare repeat runs of each client
before comparing clients. Exact RGBA equality is appropriate only for a
specified pure integer kernel with identical color space and alpha treatment.
PNG bytes may differ in encoding while decoded pixels agree. JPEG is lossy;
compare decoded pixels after both clients use the declared background/alpha
flattening policy.

Proposed cross-client review thresholds at the canonical Web base dimensions
are: non-text hard-edge position within 1 output pixel; text ink bounds within
2 pixels or 1% of the measured axis, whichever is larger; text line count,
alignment and intended glyph coverage exact. Require correct transparent
corner alpha (0), fully opaque alpha (255), and semitransparent regions within
2 alpha levels away from antialiased edges. For deterministic painted areas,
start with mean absolute RGB error ≤ 4 and 99th percentile ≤ 16 after matching
sRGB/unpremultiplied RGBA. These are proposed gates to validate with Web
repeatability and owner visual review, not measured current results. Evaluate
antialiasing edge bands separately; a whole-image average cannot hide a
missing branch, wrong mask, font substitution or shifted text. Stochastic
noise may use a wider per-pixel envelope only after exact seed, distribution,
coverage and composition checks are demonstrated. Each effect family records
its own control-specific boundaries before declaring support.

Web cover export renders once at the `ASPECT_SIZES` base dimensions
(`1000×1000`, `1080×1350`, `1080×1920`, `1920×1080`), then nearest-neighbor
upscales by 1, 2 or 3. Effect frequencies are not reevaluated at the scaled
size. JPEG uses quality 0.92. Preview may use a draft size, but it must
converge to the same composition as full export; export evaluates the current
committed revision and must never publish a stale frame.

## Target budgets, not measurements

Initial reference target: Apple Silicon MacBook Pro with M3 Pro, 18 GB unified
memory, macOS 14 or later, built-in display at 60 Hz. Record exact model,
chip, RAM, OS/build, display scale, power state, app SHA and scene dimensions
on the machine actually measured by #266/#277. This named configuration is a
proposed target, not a claim about the current host. Test text/font,
non-square alpha, branching utility/effect, and 100-node scenes separately.
The P01 verification host was separately identified as Apple M5 Max, 36 GiB,
macOS 26.6.2 (25G83). No P01 performance measurement was made on it.

| Boundary | Proposed target to validate | Reporting requirement |
| --- | --- | --- |
| Selection, drag, pan, zoom | 60 fps viewport target; p95 input-to-present ≤ 33 ms, worst hitch ≤ 100 ms | Keep input independent of heavyweight render; record p50/p95/max frame time and dropped frames. |
| Preview convergence | Draft visible ≤ 150 ms after edit; settled current-revision preview ≤ 750 ms for representative scenes | Report scene/size/quality, p50/p95 and cancellation count; expensive effect exceptions must be explicit. |
| Full export | PNG 1× ≤ 3 s and 3× ≤ 12 s on the reference scene; JPEG separately | Measure render, upscale and encode phases, output dimensions, p50/p95 and stale-revision protection. |
| Memory | Peak resident app memory ≤ 1.5 GB on the 100-node reference scene, returning within 20% of pre-open baseline after close/reopen | Record steady/peak RSS, decoded assets and cache size across repeated cycles. |

Existing pilot process timings in `docs/performance.md` are observations of
the prior square Viber render path, not measurements against these scenes or
budgets. No GUI, timing or memory result is claimed by this P01 document.

## Extension and ownership seams

- #262 owns reproducible Rust/WASM/Swift builds and fixture execution in CI.
  #263 owns core commands, history and bindings; #264 adds pure graph
  rules/ordering; #265 switches the main Web document owner to that contract.
- #266 owns native render planning, image/font resource retention,
  cancellation/revision presentation, color/alpha conventions and a family
  registry. It should expose source/effect/utility registration by kind and
  validated parameters so #271–#275 can add modules without concurrently
  editing a giant switch. It does not replace Web Canvas/Pixi/Three.
- #267 owns portable assets, fonts/files and export; #268 owns native
  Layers/inspector/canvas gestures. #269 owns graph rendering and #270 the
  node canvas/areas/previews. #276 owns Add Library/preset discovery, #277
  measured performance, and #278 the integrated real-client acceptance gate.
- Serialize edits to `apps/web/app/types/config.ts`,
  `apps/web/app/hooks/useEditorDocument.ts`,
  `apps/web/app/utils/documentCommands.ts`,
  `crates/artifact-core/src/lib.rs`, bindings, generated WASM manifests,
  `apps/macos/Sources/ProjectModel.swift` and the native renderer registry.
  Family issues own separate effect/source modules and their own fixtures.
  Transient graph caches are keyed by each target's pixel-affecting
  dependencies: dimensions, seed, image/font readiness, upstream graph edges,
  parameters and primitive view state where relevant. A global document
  revision guards which completed frame may be presented; it is not itself
  a cache key for every unchanged branch. Cache lifetime and target-local
  invalidation belong to the renderer, not serialized state.

Run `npm run quality:native-2d-contract` for the source-linked inventory and
fixture structure, then `npm run test:browser -- --project=chromium
native-2d-contract.spec.ts` for main Web import and graph response. These
checks prove fixture validity and current Web behavior only. Later issues
must add native GUI, comparison, timing and memory evidence on one integrated
revision before any matrix entry can be marked accepted.

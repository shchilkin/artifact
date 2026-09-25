# Native 2D graph rendering (P09)

Issue [#269](https://github.com/shchilkin/artifact/issues/269) adds native
pixels for the shared 2D graph semantics from P04. The approved stacked base
is draft #290 at `0b39f6e9481114cb432d3606855ba144316bf99c`. This records
automated P09 evidence; combined Mac GUI acceptance is a separate gate.

`DocumentSession.render_target_plan_json(width, height, target_id)` projects
the validated `graph::plan` snapshot into a version 2 transient render plan.
`render_plan_json` remains the export-target alias. Stack plans keep the
existing top-level `layers` field and document background. Graph plans add
postorder `nodes`, explicit input ports, normalized parameters and transitive
pixel cache keys. The executor never infers graph structure from `layers`.
An empty graph export is transparent, even when the document has a background.
Disconnected nodes do not enter the selected target path. Unsupported reachable
nodes and cyclic or invalid topology reject before painting.

`RenderWorker` uses one `NativeGraphExecutor` for preview and export. The
headless `render-check` accepts `--target=NODE_ID` for arbitrary gallery and
thumbnail recipes; P10 supplies the native node UI. Source/effect painting
still uses `PilotRenderer`. Six utilities live in `NativeGraphUtilities.swift`:
merge (`a`/`b`), repeat (`in`/`bg`), mask (`in`/`mask`), and color, transform
and grime shadow (`in`). Layer-backed sources take `bg`; effects take `in`.
The transient cache is capped at 128 MiB and includes dimensions, source
configuration, utility parameters, ordered ports and upstream signatures.
Seed enters only nodes with stochastic output; text includes only its selected
font payload. It omits unrelated font imports, UI positions, names, locks and
document revision. The executor
skips cached subtrees and releases intermediate images after their last
consumer. No cache image or render plan enters serialized document state.

The committed `tests/fixtures/native-2d/p09` inputs and reference PNGs were
captured through the **main Web editor's file import and export download** at
clean source `0b39f6e`, Chrome 153.0.8010.53, Apple M5 Max/macOS 26.6.2.
`web-reference-manifest.json` pins each captured input byte hash, its parsed
JSON value hash, and the exported PNG hash. The native gate checks semantic
input identity after repository formatting and refuses missing or changed
references. Cases cover every utility, translucent color clipping,
expanded/feathered mask, seeded random rotation and position jitter, combined branches,
missing ports, empty graph export, non-square transform, reordered stack and
shared upstream reuse. References are independent of the Rust/Swift work.

Run after `npm run build:core-pilot -- macos`:

```bash
cargo test -p artifact-core --test render
npm run test:core-native-graph
```

The pixel gate compares decoded sRGB RGBA at Web base dimensions. For painted
pixels with stable 3×3 alpha neighborhoods it requires RGB mean absolute error
≤4, RGB p99 ≤16 and alpha p99 ≤2. Non-shadow alpha bounds must be within one
pixel. Soft and antialiased edge bands are measured separately. Empty graph
targets must be fully transparent. Six arbitrary node targets must yield the
same native PNG as routing each to export. The Swift check tests cache reuse,
branch invalidation, cancellation and a 100-node live-image frontier. Rust
tests cover immutable plans, shared branches, invalid cycles, unsupported
targets, selected-font readiness and dependency-key propagation. The seeded
repeat fixture must also be byte-stable across independent native runs and
stay below whole-image alpha MAE 1 against the Web export.

At the 17-fixture checkpoint, all painted-area gates passed: interior RGB p99
was at most 3 and alpha p99 was 0. The largest whole-image alpha mean error
was 0.67 on shared-upstream; its interior RGB/alpha p99 values were both 0.
Grime-shadow interior RGB mean error was 0.39. Edge bands
reached alpha p99 53 and RGB p99 41; non-shadow alpha bounds stayed within one
pixel. The 100-node 281×500 diagnostic observed 1,124,000 peak live
intermediate bytes (two frames). These are headless Web export and native
render results, not byte-identical PNG, native GUI, latency or P17 memory-budget
claims.

Toolchains: Rust 1.95.0, canonical Linux x86-64 WASM/wasm-bindgen 0.2.128,
Apple Swift 6.3.3, Node 26.8.1, arm64 macOS. The runtime manifest verifies
source-to-WASM correspondence. P10 owns native node interaction and thumbnail
UI; the coordinator owns combined real Web → Mac → Web acceptance.

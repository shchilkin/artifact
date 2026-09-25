# Native Layers and graph-render integration

This checkpoint combines P08 [#291](https://github.com/shchilkin/artifact/pull/291)
and P09 [#292](https://github.com/shchilkin/artifact/pull/292) above the frozen
[integration draft #290](https://github.com/shchilkin/artifact/pull/290) at
`0b39f6e9481114cb432d3606855ba144316bf99c`. It is a stacked development checkpoint,
not a merge into development or a complete native-parity acceptance.

Package sources: P08 `ff2f923f321d980c4fa970e1a954ee95a1a7ac67` and P09
`227a3fbbd90284820ac9098bd9f890289b7ce797`. The checkpoint PR records the resulting
combined commit and validation results; the local builds embed that commit.

## Included behavior

- Native multi-selection, batch layer commands, reorder, areas and live inspector
  transactions use the shared document/history boundary. Text and image painting
  and canvas handles use the same renderer-derived geometry.
- Move, corner scaling and rotation retain local gesture state, then commit once.
  The reviewed correction anchors scaling to the opposite corner and derives
  rotation from the pointer angle. Keyboard focus preserves ordinary field editing.
- The shared graph plan describes complete 2D branches and arbitrary node targets.
  The native executor renders merge, color, repeat, mask, transform and grime-shadow
  through the same path as preview/export, with transient per-node caching.
- The main Web client receives both sets of Rust changes through one regenerated
  canonical WASM. Native and Web remain separate platform renderers.

The integration resolves generated WASM/manifest differences by rebuilding with
`npm run build:core-wasm-canonical`. It retains both native regression suites in
`check:core-native`; each graph verification writes into its own checkout.

## Independent review

### Spec

The P08 review found canvas-relative scaling and horizontal-only rotation behind
the layer handles. The fix at `ff2f923f321d980c4fa970e1a954ee95a1a7ac67` was reviewed
again; the reviewer found no remaining defect in those changed paths. Model tests
cover small/large, non-square, rotated and zoomed layers, fixed pivots, independent
axes, uniform-scale limits and rotation snapping. This is not pointer GUI proof.

A proposed P09 random/jitter ordering defect was retracted after checking the
Web call order. A new independent main-Web import/export fixture covers this
combination without changing the already matching random-number sequence.

### Standards

The P08 Save Copy wording was corrected to retain the existing file contract:
copies contain the committed package and leave active drafts intact; recovery
alone also writes a hash-linked draft sidecar. The P09 review required font/seed
dependencies in cache keys to be local to the affected branch; `227a3fb` implements
and tests that correction. The default native CI gate now executes the new graph
pixel/cache checks as well as the layer-interaction checks.

## Combined validation commands

After canonical WASM generation and committing the combined sources:

```bash
npm run build:core-pilot -- macos
npm run check:core-web
npm run check:core-native
npm run quality:native-2d-contract
npm run check
npm run build
```

The graph gate includes 17 independent Web references, arbitrary graph targets,
repeat determinism, cache invalidation, cancellation and the intermediate-image
frontier. The model gate includes the corrected pointer geometry and stale-frame
rejection. These commands do not substitute for the remaining GUI checks below.

## Evidence boundaries

The coordinator's real native GUI checks observed multi-selection, image/text
handles, duplicate followed by one Undo, area creation on a stack followed by
one Undo, field paste and focus routing, live text edit/Undo/Redo, invalid numeric
draft Save rejection, and the corrected Layer-menu Create Area action.

Those observations used immutable candidates preceding the final pointer-math
repair. Native coordinate automation returned `noWindowsAvailable`; final QA
system Open/Save panels also kept their confirmation buttons disabled. These are
unresolved acceptance limitations, not a proven app regression. Pointer dragging,
area collapse, trackpad pan/zoom/Fit, final native graph GUI and the new final-build
Save Copy-to-Web roundtrip are not claimed as passing.

The P08 full Web browser run had 505 passes, 53 skips and two WebKit failures
(area-row drag and focused row keyboard selection). Both subsequently passed
focused retries. This remains an intermittent-test limitation, not a green full
suite or proof of an unrelated baseline fault.

P09 reference images were exported through the main Web client at the frozen
`0b39f6e` source. Native comparisons measure documented interior-pixel and alpha
bound tolerances; soft edge differences are separately reported. Headless render
and cache diagnostics are not native GUI, input latency, frame rate or P17 budgets.

P10-P18 remain outside this implementation wave. Their normal prerequisites and
any explicit stacked-base exception must be recorded before dispatch. No release
version changes, production deployment or PR merge is part of this checkpoint.

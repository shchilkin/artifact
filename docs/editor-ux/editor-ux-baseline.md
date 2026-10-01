# Editor UX Baseline And Budgets

Normative editor UX budgets for
[v0.50 Editor UX](../version-plans/v0.50.md). The machine-readable contract is
[`editor-ux-contract.json`](./editor-ux-contract.json). Measurements:

- [`editor-ux-baseline-v0.49.0.json`](./editor-ux-baseline-v0.49.0.json): the
  v0.49.0 reference, recorded on the CI runner before any v0.50 editor change.
  It supersedes the dev-server numbers in the version plan.
- The current measurement is produced by the gate on every build and is not
  checked in; CI uploads it as the `editor-ux` artifact.

## Measuring

```bash
npm run ux:gate
```

`ux:gate` (`scripts/editor-ux/gate.mjs`) builds the web app, measures it with
`scripts/editor-ux/measure.mjs`, and checks the result against
`editor-ux-contract.json`. It exits non-zero on any violation. It needs Chromium
(Playwright) and nothing else: no API, no database, no long-lived service. A run
takes about two minutes.

The measurement serves `apps/web/build/client` with `vite preview` and drives
`/app` in Chromium with the service worker blocked, the dark color scheme, and
reduced motion. It covers two viewports and two reference documents
(`scripts/editor-ux/documents.mjs`):

| Viewport | Size |
| --- | --- |
| `desktop` | 1440x900 |
| `mobile` | 375x812, touch |

| Document | Contents |
| --- | --- |
| `default` | The document a first visit opens: emoji plus five effects. |
| `effect-stack` | Fill, text, and six effects that mix Canvas 2D and GPU-backed passes. |

Metric keys are `viewport/document/subject/metric`.

### Layout pass

One run per viewport and document. These metrics do not depend on machine
speed, so their budgets are marked `deterministic`.

| Metric | Subjects | Meaning |
| --- | --- | --- |
| `layoutShift` | `select-layer`, `switch-to-nodes`, `switch-to-layers`, `open-add-library` | Sum of the browser's layout-shift scores in the 700 ms after the interaction, including shifts that follow user input. |
| `frameMovePx` | the same four interactions | Largest change in position or size of the preview surface or the visible command bar across the interaction. |
| `nodesOutsideViewport` | `nodes-entry` | Nodes not fully inside the node canvas on first entry. |
| `obscuredCommands` | `command-bar` | Command-bar buttons whose center is covered by another element. |
| `overlappingCommands` | `command-bar` | Pairs of command-bar buttons whose boxes overlap. |
| `sliderWidthDeltaPx` | `inspector` | Width difference of the first Layers inspector slider before and after visiting Nodes. |

### Latency pass

Desktop only. Each sample uses a fresh page; the reported value is the median of
five samples (`--samples N` changes the count). The slider is the first slider
of the Scanlines layer in each document.

| Metric | Subject | Meaning |
| --- | --- | --- |
| `inputToPreviewMs` | `slider-keypress` | From the browser receiving one arrow-key press on the slider to the next paint of the preview canvas. |
| `durationMs` | `slider-drag` | Time to deliver a 20-step pointer drag, one step per animation frame. An unblocked main thread takes about 340 ms. |
| `settleMs` | `slider-drag` | From the last drag input to the end of the first burst of preview paints after it (paints less than 400 ms apart). The later full-quality pass is not included. |
| `entrySettleMs` | `node-preview` | From clicking Nodes to the last node-thumbnail render of the entry. |
| `sliderSettleMs` | `node-preview` | From one arrow-key press on the Nodes inspector slider to the last node-thumbnail render it causes. |

Preview paints are observed by wrapping `drawImage` on the preview canvas;
thumbnail renders come from the `artifact:thumbnail-render` performance
measures described in [`../performance.md`](../performance.md). Input times are
event timestamps, so they include time spent waiting for the main thread.

Latency budgets are defined for the CI gate environment (GitHub-hosted
`ubuntu-latest`, Playwright container, software WebGL). Faster local hardware
reports lower values; compare local runs with each other, not with the CI
baseline.

## Budgets

| Metric | Budget | Viewports |
| --- | --- | --- |
| `layoutShift` | 0.05 | desktop, mobile |
| `frameMovePx` | 1 px | desktop |
| `nodesOutsideViewport` | 0 | desktop |
| `obscuredCommands` | 0 | desktop, mobile |
| `overlappingCommands` | 0 | desktop, mobile |
| `sliderWidthDeltaPx` | 1 px | desktop, mobile |
TIMING_BUDGET_ROWS

`frameMovePx` and `nodesOutsideViewport` are budgeted on desktop only: on mobile
the Layers and Nodes views use different page layouts by design, and a whole
graph does not fit a 375 px canvas at a usable size. Both are still recorded in
the measurement.

## Exceptions

An exception is a temporary ceiling for a metric that does not meet its budget
yet. Each names the delivery issue that removes it. The gate fails when a value
exceeds its ceiling, and also when a `deterministic` exception is no longer
needed, so a fixed behavior cannot keep a stale allowance.

| Metric | v0.49.0 | Ceiling | Owner |
| --- | --- | --- | --- |
| `desktop/*/select-layer/frameMovePx` | 340 px | 340 | [#307](https://github.com/shchilkin/artifact/issues/307) |
| `desktop/*/switch-to-nodes/layoutShift` | 0.172 | 0.172 | [#307](https://github.com/shchilkin/artifact/issues/307) |
| `desktop/*/switch-to-nodes/frameMovePx` | 288.4 px | 288.4 | [#307](https://github.com/shchilkin/artifact/issues/307) |
| `desktop/*/switch-to-layers/layoutShift` | 0.534 | 0.534 | [#307](https://github.com/shchilkin/artifact/issues/307) |
| `desktop/*/switch-to-layers/frameMovePx` | 288.4 px | 288.4 | [#307](https://github.com/shchilkin/artifact/issues/307) |
| `desktop/default/nodes-entry/nodesOutsideViewport` | 5 of 7 | 5 | [#307](https://github.com/shchilkin/artifact/issues/307) |
| `desktop/effect-stack/nodes-entry/nodesOutsideViewport` | 7 of 9 | 7 | [#307](https://github.com/shchilkin/artifact/issues/307) |
| `mobile/*/command-bar/obscuredCommands` | 1 | 1 | [#307](https://github.com/shchilkin/artifact/issues/307) |
| `mobile/*/command-bar/overlappingCommands` | 2 | 2 | [#307](https://github.com/shchilkin/artifact/issues/307) |
| `desktop/*/inspector/sliderWidthDeltaPx` | 39.5 px | 39.5 | [#309](https://github.com/shchilkin/artifact/issues/309) |
| `mobile/*/inspector/sliderWidthDeltaPx` | 228 px | 228 | [#309](https://github.com/shchilkin/artifact/issues/309) |
TIMING_EXCEPTION_ROWS

Selecting a layer already meets the layout-shift budget (0.035) because the
shift score weighs the moved area, but it moves the preview 170 px and narrows
the command bar by 340 px; `frameMovePx` is the metric that holds that behavior
to account.

## v0.49.0 Baseline

TIMING_BASELINE_SECTION

## Changing A Budget Or Exception

A failing gate is fixed in code unless the change is intended. An intended
change is one reviewed update to `editor-ux-contract.json` and this file in the
same pull request: change only the budget or exception the failure names, give
its reason and owning issue, and update the tables above with the gate's
numbers. Never raise an unrelated budget to silence a failure.

`npm run test:editor-ux` (part of `npm run check`) validates the contract
itself and unit-tests the checker. It does not need a build.

Where it runs: the `editor ux` CI job on every pull request that touches the
app, and `.github/workflows/release.yml` before the release browser gate.

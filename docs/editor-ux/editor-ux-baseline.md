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
takes about four minutes on CI.

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

### Machine speed

Latency depends on the machine: two GitHub-hosted runners measured the same
build up to two times apart. Each run therefore times a fixed Canvas 2D
workload in a blank page (`calibrationMs`, before and after each document's
latency pass) and scales every latency value by
`calibration.referenceMs / calibrationMs`. Budgets and exception ceilings are in
these reference-machine milliseconds; the reference is the v0.49.0 baseline run
(GitHub-hosted `ubuntu-latest`, 4 CPUs, Playwright container, software WebGL,
calibration 118.6 ms). The measurement keeps the raw values under `details` and
the scale under `environment.speed`.

The scale is an approximation. It does not make different architectures
comparable (an Apple Silicon laptop with a GPU reports lower values than the
reference even after scaling), and delays that are fixed in the app, such as the
240 ms wait before the full-quality pass, are scaled along with everything
else. Use local runs to compare a change against its base on the same machine;
the CI run is the one that decides.

## Budgets

| Metric | Budget | Viewports |
| --- | --- | --- |
| `layoutShift` | 0.05 | desktop, mobile |
| `frameMovePx` | 1 px | desktop |
| `nodesOutsideViewport` | 0 | desktop |
| `obscuredCommands` | 0 | desktop, mobile |
| `overlappingCommands` | 0 | desktop, mobile |
| `sliderWidthDeltaPx` | 1 px | desktop, mobile |
| `inputToPreviewMs` | 50 ms | desktop |
| `slider-drag/durationMs` | 500 ms | desktop |
| `slider-drag/settleMs` | 700 ms | desktop |
| `node-preview/entrySettleMs` | 1200 ms | desktop |
| `node-preview/sliderSettleMs` | 100 ms | desktop |

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
| `desktop/*/inspector/sliderWidthDeltaPx` | 39.5 px | 39.5 | [#309](https://github.com/shchilkin/artifact/issues/309) |
| `mobile/*/inspector/sliderWidthDeltaPx` | 228 px | 228 | [#309](https://github.com/shchilkin/artifact/issues/309) |
| `desktop/*/slider-keypress/inputToPreviewMs` | 62.4 / 121.8 ms | 215 | [#308](https://github.com/shchilkin/artifact/issues/308) |
| `desktop/default/slider-drag/durationMs` | 1095.3 ms | 1900 | [#308](https://github.com/shchilkin/artifact/issues/308) |
| `desktop/effect-stack/slider-drag/durationMs` | 1937.8 ms | 3400 | [#308](https://github.com/shchilkin/artifact/issues/308) |
| `desktop/*/node-preview/sliderSettleMs` | 68.3 / 177.3 ms | 700 | [#308](https://github.com/shchilkin/artifact/issues/308) |

Layout ceilings equal the measured value. Latency ceilings are about 1.75 times
the baseline value to absorb what the speed scale does not: a slower runner of
the same class (calibration 142.8 ms) still reported scaled values 24-28% above
the baseline.

[#307](https://github.com/shchilkin/artifact/issues/307) removed the layout
exceptions for selecting a layer, switching between Layers and Nodes, the first
Nodes entry, and the mobile command bar; see
[After the stable editor frame](#after-the-stable-editor-frame).

## v0.49.0 Baseline

Latency on the reference run (median of five samples, milliseconds):

| Metric | `default` | `effect-stack` | Budget |
| --- | ---: | ---: | ---: |
| `slider-keypress/inputToPreviewMs` | 62.4 | 121.8 | 50 |
| `slider-drag/durationMs` | 1095.3 | 1937.8 | 500 |
| `slider-drag/settleMs` | 406.7 | 563.2 | 700 |
| `node-preview/entrySettleMs` | 604.3 | 552.6 | 1200 |
| `node-preview/sliderSettleMs` | 68.3 | 177.3 | 100 |

Every drag step produced one preview paint (20 paints for 20 steps), and each
step held the main thread for three to six frames. That is the gap #308 closes.

Layout values are the same for both documents except the node count:

| Interaction | Desktop `layoutShift` | Desktop `frameMovePx` | Mobile `layoutShift` |
| --- | ---: | ---: | ---: |
| `select-layer` | 0.035 | 340 | 0 |
| `switch-to-nodes` | 0.172 | 279.8 | 0 |
| `switch-to-layers` | 0.534 | 279.8 | 0 |
| `open-add-library` | 0 | 0 | 0 |

On mobile, Randomize is covered by More and overlaps More and Projects.

Selecting a layer already met the layout-shift budget (0.035) because the shift
score weighs the moved area, but it moved the preview 170 px and narrowed the
command bar by 340 px; `frameMovePx` is the metric that held that behavior to
account.

## After The Stable Editor Frame

[#307](https://github.com/shchilkin/artifact/issues/307) gives the desktop
editor a fixed frame: the layer list, the canvas, and an inspector column that
is always reserved (with an empty state when nothing is selected) sit above one
full-width command-bar row that both modes share. Nodes fits the graph on entry,
and the mobile command bar lays out in two rows.

| Interaction | Desktop `layoutShift` | Desktop `frameMovePx` | Mobile `layoutShift` |
| --- | ---: | ---: | ---: |
| `select-layer` | 0 | 0 | 0 |
| `switch-to-nodes` | 0 | 0 | 0 |
| `switch-to-layers` | 0 | 0 | 0 |
| `open-add-library` | 0 | 0 | 0 |

| Metric | `default` | `effect-stack` |
| --- | ---: | ---: |
| `nodes-entry/nodesOutsideViewport` | 0 of 7 | 0 of 9 |
| mobile `command-bar/obscuredCommands` | 0 | 0 |
| mobile `command-bar/overlappingCommands` | 0 | 0 |

On mobile the Layers and Nodes command bars still sit in different places by
design (`frameMovePx` 330 px, not budgeted).

Fitting the graph on entry puts every node on screen, so a slider edit in Nodes
now re-renders every downstream thumbnail instead of the one or two that were
visible before. `node-preview/sliderSettleMs` rose from 68.3 / 177.3 ms to about
290 / 380 ms (local run, scaled), so its #308 ceiling went from 310 to 700 in the
same change. Its budget and owner are unchanged: #308's node-preview queue
brings it back down.

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

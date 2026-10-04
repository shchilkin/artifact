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
| `mainThreadMs` | `slider-drag` | Main-thread task time of the page while a 20-step pointer drag is delivered, one step per animation frame (Chromium's `TaskDuration` performance metric). A blank page with a bare range input takes 15-25 ms. Since #308. |
| `durationMs` | `slider-drag` | Secondary, not budgeted: time to deliver the same drag, reported above the drag floor (see Machine speed). |
| `settleMs` | `slider-drag` | From the last drag input to the last preview paint before the preview has been quiet for one second. This includes the full-quality pass that follows the draft frames. |
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

The 20-step drag loop also has a floor that does not depend on the CPU: the
harness cannot deliver steps faster than the platform paces frames. Each run
times the same loop against a bare range input in a blank page
(`environment.dragFloorMs`): 665.7 ms on the CI runner (two frames per step)
and 333 ms on macOS. `slider-drag/durationMs` is therefore reported as
`calibration.dragFloorMs` (340 ms, one 60 Hz frame per step) plus the scaled
time above the floor measured on the same machine. Only that part depends on
the app.

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
| `slider-drag/mainThreadMs` | 160 ms | desktop |
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

No exceptions remain: [#309](https://github.com/shchilkin/artifact/issues/309)
removed the last two (`inspector/sliderWidthDeltaPx` on desktop and mobile,
ceilings 39.5 px and 228 px). A future exception is added only through the
process under Changing A Budget Or Exception. Layout ceilings equal the
measured value.

`slider-drag/mainThreadMs` replaced the budgeted `slider-drag/durationMs` in
#308. On the CI runner the drag loop cannot run faster than two frames per step
(665.7 ms against a blank page), so the 500 ms duration budget was below what
the harness can deliver there, and subtracting that floor would hide app work
that fits in the idle frame. The 160 ms budget keeps U1's intent: 500 ms for a
drag that an unblocked main thread delivers in 340 ms. The v0.49.0 run did not
measure main-thread time; on the CI container image (Apple Silicon host,
calibration about 120 ms), v0.49.0 spent 515 / 1008 ms of main-thread time on
the drag.

Metrics a delivery issue fixed are listed under `fixed` in the contract with the
baseline value they replaced. The v0.49.0 baseline still exceeds their budgets;
`npm run test:editor-ux` accepts that only for metrics listed there.

| Metric | v0.49.0 | Fixed by |
| --- | --- | --- |
| `desktop/*/node-preview/sliderSettleMs` | 68.3 / 177.3 ms | [#308](https://github.com/shchilkin/artifact/issues/308), [#307](https://github.com/shchilkin/artifact/issues/307) |
| `desktop/*/select-layer/frameMovePx` | 340 px | [#307](https://github.com/shchilkin/artifact/issues/307) |
| `desktop/*/switch-to-nodes/layoutShift` | 0.172 | [#307](https://github.com/shchilkin/artifact/issues/307) |
| `desktop/*/switch-to-nodes/frameMovePx` | 279.8 px | [#307](https://github.com/shchilkin/artifact/issues/307) |
| `desktop/*/switch-to-layers/layoutShift` | 0.534 | [#307](https://github.com/shchilkin/artifact/issues/307) |
| `desktop/*/switch-to-layers/frameMovePx` | 279.8 px | [#307](https://github.com/shchilkin/artifact/issues/307) |
| `desktop/*/nodes-entry/nodesOutsideViewport` | 5 of 7 / 7 of 9 | [#307](https://github.com/shchilkin/artifact/issues/307) |
| `mobile/*/command-bar/obscuredCommands` | 1 | [#307](https://github.com/shchilkin/artifact/issues/307) |
| `mobile/*/command-bar/overlappingCommands` | 2 | [#307](https://github.com/shchilkin/artifact/issues/307) |
| `desktop/*/slider-keypress/inputToPreviewMs` | 62.4 / 121.8 ms | [#324](https://github.com/shchilkin/artifact/issues/324) |
| `desktop/*/inspector/sliderWidthDeltaPx` | 39.5 px | [#309](https://github.com/shchilkin/artifact/issues/309) |
| `mobile/*/inspector/sliderWidthDeltaPx` | 228 px | [#309](https://github.com/shchilkin/artifact/issues/309) |

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
The v0.49.0 run did not record the drag floor; floor-corrected with the CI
runner's 665.7 ms, its `durationMs` values are 769.6 and 1612.1 ms. `durationMs`
is no longer budgeted (see Exceptions).

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

## After #308

CI run [37126258008](https://github.com/shchilkin/artifact/actions/runs/37126258008)
(calibration 143.4 ms, speed 0.827, drag floor 665.1 ms, blank-page drag
main-thread time 16.1 ms), reference-machine milliseconds:

| Metric | `default` | `effect-stack` | Budget |
| --- | ---: | ---: | ---: |
| `slider-keypress/inputToPreviewMs` | 79.2 | 146.6 | 50 |
| `slider-drag/mainThreadMs` | 329.7 | 356.9 | 160 |
| `slider-drag/settleMs` | 443.4 | 670.4 | 700 |
| `node-preview/entrySettleMs` | 416.1 | 565.2 | 1200 |
| `node-preview/sliderSettleMs` | 25.1 | 27.5 | 100 |

Secondary: `slider-drag/durationMs` 391.2 / 405.3 (raw 727 / 744 ms against
the 665 ms floor); 4 / 3 preview paints during the drag (20 / 20 in v0.49.0).
Across the PR's runs keypress latency varied between 65 and 86 ms (`default`)
and 119 and 147 ms (`effect-stack`), and effect-stack settle between 541 and
670 ms.

With superseded interactive passes dropped instead of painted (run
[37125665340](https://github.com/shchilkin/artifact/actions/runs/37125665340),
speed 0.997), main-thread time was 302.2 / 313.2 ms but the drag painted 0 / 0-1
preview frames, so the preview keeps painting them (see
[`../performance.md`](../performance.md)).

## After The Stable Editor Frame

[#307](https://github.com/shchilkin/artifact/issues/307) gives the desktop
editor a fixed frame: the layer list, the canvas, and an inspector column that
is always reserved (with an empty state when nothing is selected) sit above one
full-width command-bar row that both modes share. Nodes fits the whole graph on
entry, and the mobile command bar lays out in two rows.

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

Fitting the graph puts every node on screen, and thumbnails render only when
visible, so after a Nodes slider edit every downstream thumbnail re-renders:
one in `default` and five in `effect-stack`. Rendered at the document baseline
(1000 px for `1:1`), that took 231.6 / 588.5 ms on the reference runner. Node
thumbnails other than the selected one now render at the smallest of 160, 320,
640, or 1280 px that covers their on-screen size at the current zoom (device
pixel ratio capped at 2), and move to a sharper size once a zoom gesture rests
for 250 ms. The selected preview keeps the document baseline. Keeping Output at
the baseline as well measured 86.8 / 179.6 ms locally, because Output then
re-renders the whole downstream chain at full size after each edit. The canvas preview,
document render, and export are unchanged.

CI run [37149562758](https://github.com/shchilkin/artifact/actions/runs/37149562758)
(speed 0.831), reference-machine milliseconds:

| Metric | `default` | `effect-stack` | Budget |
| --- | ---: | ---: | ---: |
| `node-preview/entrySettleMs` | 452.5 | 616.2 | 1200 |
| `node-preview/sliderSettleMs` | 56.8 | 73.5 | 100 |

Both are within budget without an exception. `sliderSettleMs` stays above the
#308 values measured with the old fixed zoom (25.1 / 27.5 ms) because more
downstream thumbnails are on screen, and each of those still renders.

## After #324

CI run [37151771646](https://github.com/shchilkin/artifact/actions/runs/37151771646),
with the stable editor frame (#307) merged in (calibration 152.3 ms,
speed 0.779), reference-machine milliseconds:

| Metric | `default` | `effect-stack` | Budget |
| --- | ---: | ---: | ---: |
| `slider-keypress/inputToPreviewMs` | 32.8 | 37.9 | 50 |
| `slider-drag/mainThreadMs` | 128.1 | 121.0 | 160 |
| `slider-drag/settleMs` | 402.0 | 564.2 | 700 |
| `node-preview/entrySettleMs` | 442.7 | 557.5 | 1200 |
| `node-preview/sliderSettleMs` | 53.4 | 72.9 | 100 |

Node-preview values follow #307's thumbnail sizing (see above); #324 does not
change node thumbnails.

What the numbers measure on CI:

- **Keypress:** on the CI runner (software WebGL) the keypress budget is met by
  the interactive frame, rendered at 270 px instead of 540 px. The full-quality
  1080 px frame replaces it after the deferred-render delay and is not part of
  `inputToPreviewMs`. On a hardware GPU the interactive frame stays at 540 px.
- **Drag:** the `mainThreadMs` window ends when the last pointer move has been
  delivered, before `mouse.up`. The slider's final coalesced document update on
  release and the full-quality pass after the drag fall outside the window.
  They are covered by `settleMs`.

The drag painted the preview 10 / 9 times (3-4 after #308). In experiment run
[37135908817](https://github.com/shchilkin/artifact/actions/runs/37135908817),
four runners (speed 0.83-1.09) measured keypress latency of 24-33 / 30-41 ms
and drag main-thread time of 108-126 / 117-127 ms. The changes are described
in [`../performance.md`](../performance.md).

### Keypress render phases

Milliseconds after the key, as `start+duration`, median sample of each run:

| Phase | Before, `default` | After, `default` | Before, `effect-stack` | After, `effect-stack` |
| --- | --- | --- | --- | --- |
| Document render (input to finished frame) | 7+90 | 7+34 | 10+176 | 9+39 |
| Edited layer and those below it | scanlines 11+1 | scanlines 8+0 | scanlines 12+1 | scanlines 10+0 |
| Grain (Canvas 2D) | - | - | 13+14 | 10+1 (cached texture) |
| RGB Split worker round trip (Canvas 2D kernel) | not traced | 9+13 | not traced | 12+12 |
| GPU upload and blit (submitted on the main thread) | not traced | 23+1 | not traced | 25+1 |
| GPU fence wait (upload, blit, filters, `readPixels` on the GPU) | 29+68, together with readback | 24+15 | 47+71 and 111+67, together with readback | 26+21, one merged pass |
| Readback copy and unpremultiply, then canvas write | inside the above | 39+2, 41+0 | inside the above | 47+0, 47+0 |
| GPU passes above the edit | 1 at 540 px | 1 at 270 px | 2 at 540 px | 1 at 270 px |

Before: development, run [37128565147](https://github.com/shchilkin/artifact/actions/runs/37128565147),
speed 0.831. After: the run above. Before #324 the trace recorded the GPU pass
only as `gpu-filter-extract` and did not trace the worker. Since #324 it
records `gpu-upload`, `gpu-blit`, `gpu-fence-wait`, `gpu-readback`,
`gpu-to-canvas`, and `worker-transform`. The GPU executes the upload, blit,
filters, and `readPixels` asynchronously in its own process, and the fence
only reports when all of them are done. JavaScript therefore cannot time them
apart, and software WebGL has no GPU timer queries
(see [`../performance.md`](../performance.md)).

The GPU pass shrank fourfold in pixels (fence wait about 68 → 15-21 ms).
`effect-stack` lost one of its two GPU passes, and its grain layer reuses its
cached texture (14 → 1 ms). The RGB Split worker round trip (6-18 ms) is now
the largest Canvas 2D phase. The main thread is free while the GPU fence is
pending.

## After #309

[#309](https://github.com/shchilkin/artifact/issues/309) gives Layers and Nodes
one inspector layout. In v0.49.0 the Nodes stylesheet, which loads on the first
Nodes visit, redefined the shared inspector field rules, so the Layers
inspector changed layout after a visit to Nodes: the first slider went from
168.5 px to 129 px on desktop and from 357 px to 129 px on mobile. Inspector
field styles now load only with the editor, both inspectors use the same row
(label, range, and numeric entry) and the same scroll gutter, and Layers and
Nodes render the same sections in the same order.

| Metric | `default` | `effect-stack` | Budget |
| --- | ---: | ---: | ---: |
| desktop `inspector/sliderWidthDeltaPx` | 0 | 0 | 1 |
| mobile `inspector/sliderWidthDeltaPx` | 0 | 0 | 1 |

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

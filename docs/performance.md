# Performance Benchmarks

Artifact has an opt-in node-editor benchmark for comparing performance between
commits, branches, and pull requests.

```bash
npm run perf:node-editor
```

The benchmark starts a local dev server on `127.0.0.1:4174`, loads a synthetic
graph with a realistic number of visual nodes, performs scripted interactions,
and writes a JSON report to:

```txt
test-results/performance/node-editor.json
```

Use `PERF_BASE_URL` to benchmark an already running deployment or preview:

```bash
PERF_BASE_URL=http://127.0.0.1:4173 npm run perf:node-editor
```

Use `PERF_OUTPUT` when comparing two branches:

```bash
PERF_OUTPUT=test-results/performance/before.json npm run perf:node-editor
PERF_OUTPUT=test-results/performance/after.json npm run perf:node-editor
```

## Metrics

Each scenario reports:

- `frames`: frame count, total frame time, average frame time, p95 frame time,
  and max frame time while the interaction is running.
- `longTasks`: count, total duration, and max duration from the browser Long
  Task API.
- `thumbnails`: thumbnail render count and duration from
  `artifact:thumbnail-render` performance measures.

The benchmark also records console errors and basic graph size metadata.

## Current Scenarios

- `initial-node-load`: load the app, switch to nodes, and wait for thumbnails.
- `drag-visible-effect-node`: drag a visible effect node.
- `change-effect-slider`: select a scanlines node and change its slider several
  times.
- `pan-large-node-graph`: pan a larger graph.

## Interpreting Results

Do not treat this benchmark like a deterministic unit test. Browser timing is
hardware-dependent, especially with Canvas, PixiJS, and WebGL work.

Use it for relative comparison:

1. Run the benchmark on the base branch.
2. Run it on the feature branch.
3. Compare medians over 3-5 runs when a change is performance-sensitive.

Useful warning signs:

- p95 frame time over `50ms` during dragging or slider changes.
- max frame time over `100ms`.
- many long tasks during simple node drag.
- thumbnail render count spiking when only one node should update.

## Instrumentation

The thumbnail queue records browser `performance.measure()` entries named
`artifact:thumbnail-render`. Keep these marks lightweight and generic; they are
for local profiling and benchmark output, not user-facing telemetry.

Future measurements can add named marks around:

- graph traversal
- `renderDocument`
- `renderGraphTarget`
- project persistence
- image decode and asset lookup


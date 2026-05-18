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

The node editor also has a local debug overlay:

- Click `Perf` in the node-canvas toolbar.
- Or open the generator with `?debug=perf` / `?perf=1`.

The overlay shows FPS, p95/max frame time, long-task count, node count, browser
heap when available, thumbnail queue timing, and render-worker timing. When
previews are still being processed, the editor shows a lightweight
`Preparing previews` status even when the full debug overlay is disabled.

Recent manual profiling notes:

- Before the worker slice, heavy node graphs could drop to roughly `8-12 FPS`
  while changing nodes.
- After moving procedural noise texture generation into a dedicated Web Worker,
  the same kind of interaction stayed at roughly `57 FPS` or higher in manual
  testing.
- The synthetic benchmark still showed initial-load long tasks, so the next
  bottleneck is likely CPU-heavy effect kernels and first-load thumbnail work,
  not React Flow dragging itself.
- Passive node thumbnails are now visibility-gated: offscreen node cards do not
  enter the thumbnail render queue until they are visible or near the viewport.
  In the current synthetic benchmark this reduced initial thumbnail renders
  from `21` to `8`, while leaving interaction scenarios at roughly one frame per
  `16-18ms`.
- The main layer preview now renders progressively: it paints a draft frame
  first, then waits for a short idle window before starting the full-quality
  pass. This prevents the layer preview from competing with node-editor mount
  work when the user switches into nodes immediately after page load.
- Initial-load long tasks can still come from the main canvas full-quality pass,
  image decode, or GPU effects after the idle delay. Treat those as separate
  bottlenecks from thumbnail scheduling.

Future measurements can add named marks around:

- graph traversal
- `renderDocument`
- `renderGraphTarget`
- project persistence
- image decode and asset lookup

## Worker Direction

Do not use a Service Worker for render performance. Service Workers are useful
for request caching and offline behavior, but they are not the right execution
model for hot image/effect work.

If measurements show main-thread render work is still the bottleneck, prefer a
dedicated Web Worker. Good candidates are pure CPU tasks with serializable
inputs and outputs:

- procedural noise/array generation
- CPU-only Canvas 2D effect kernels
- graph render planning and invalidation signatures
- image-data transforms that can use `OffscreenCanvas`

Keep React Flow state, DOM event handling, PixiJS filters, and live Three.js
primitive viewports on the main thread until a dedicated worker boundary is
designed and tested. Any worker boundary must keep `CanvasDocument` JSON-only
and avoid storing canvases, bitmaps, WebGL objects, or DOM references in
document state.

### Current Worker Boundary

The first implemented worker boundary is procedural noise texture generation:

- `app/utils/render/workers/noiseTexture.ts` owns pure deterministic pixel
  generation.
- `app/utils/render/workers/noiseTexture.worker.ts` runs that pixel generation
  in a dedicated Web Worker when the browser supports it.
- `app/utils/render/workers/noiseTextureClient.ts` falls back to the same pure
  generator on the main thread for tests, SSR-like environments, old browsers,
  worker failures, or worker timeouts.

The second worker boundary is CPU-only image-data effect transforms:

- `app/utils/render/workers/effectPixelTransform.ts` owns pure pixel kernels.
- `app/utils/render/workers/effectPixelTransform.worker.ts` runs those kernels
  off the main thread.
- `app/utils/render/workers/effectPixelTransformClient.ts` preserves a fallback
  path and tracks worker diagnostics.

Workerized effects currently include RGB split, sepia/infrared/chromatic
aberration/dither, VHS tracking, wave, solarize, bleach bypass, cyanotype, split
tone, ripple, kaleidoscope, squeeze, and fog. These are called at the same
points in the renderer as the old synchronous loops, so effect stacking order is
preserved.

Only serializable config and transferable pixel buffers cross these boundaries.
Canvas creation, compositing, PixiJS effects, Three.js primitive rendering, and
React Flow state remain on the main thread. The current worker model is
intentionally incremental: move pure pixel math first, keep document semantics
and renderer APIs stable, then measure before moving more work.

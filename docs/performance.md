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
- `thumbnailPhases`: thumbnail preload, graph render, and final canvas draw
  timing from `artifact:thumbnail-preload`, `artifact:thumbnail-graph-render`,
  and `artifact:thumbnail-draw`.
- `documentRenders`: document-render count and duration from
  `artifact:document-render` performance measures.
- `layerRenders`: the slowest layer/effect render buckets from
  `artifact:layer-render:*` performance measures. These are grouped by layer
  kind or effect preset so slow graph-render phases can be traced to concrete
  node types.
- `gpuRenders` and `gpuPhases`: Pixi/GPU render timing from
  `artifact:gpu-render`, split into queue wait, texture upload, source blit,
  and filter/extract phases.

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
Thumbnail tasks also record phase-level measures for `artifact:thumbnail-preload`,
`artifact:thumbnail-graph-render`, and `artifact:thumbnail-draw` so initial-load
work can be separated into image readiness, renderer cost, and paint-to-card
cost.
The renderer facade also records `artifact:document-render` entries around
`renderDocument` calls so benchmarks can distinguish thumbnail scheduling cost
from full document render cost.
Individual layer/effect renders also emit `artifact:layer-render:*` entries in
the active render path. These are intended for benchmark aggregation and local
profiling; use them to decide which effect kernel should be workerized or cached
next.
The Pixi bridge records `artifact:gpu-render`, `artifact:gpu-queue-wait`,
`artifact:gpu-upload`, `artifact:gpu-blit`, and `artifact:gpu-filter-extract`.
These marks exist to answer whether GPU-backed effect time is coming from
renderer serialization, canvas-to-texture upload, the WebGL pass, or readback
into a Canvas 2D surface.

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
  work when the user switches into nodes immediately after page load. The
  full-quality pass is intentionally delayed longer than a normal tab switch so
  the pending work can be cancelled before expensive rendering starts.
- Main preview renders are abortable between graph/layer steps. If the preview
  unmounts or a newer render supersedes the current one, the old render receives
  a transient `AbortSignal` and stops before continuing through stale expensive
  effects. This keeps cancellation outside `CanvasDocument` while preventing
  old full-quality work from blocking the node workspace.
- Node thumbnails now share a render-session cache for graph branches. When
  several visible thumbnails depend on the same upstream source/effect chain,
  the renderer can reuse in-flight or completed upstream canvases instead of
  recomputing the same branch for every thumbnail.
  In one local benchmark run, initial thumbnail render time dropped from roughly
  `1360ms` total to roughly `107ms` total after this cache boundary.
- Gallery previews and generated preset/example thumbnails can now pass the
  same external graph render cache through `renderDocument`, so the cache
  boundary is not limited to node cards. Generated thumbnail data URLs are also
  cached with a small LRU/in-flight cache to avoid rerendering identical example
  or preset thumbnails during browsing.
- Initial-load long tasks can still come from the main canvas full-quality pass,
  image decode, or GPU effects after the idle delay. Treat those as separate
  bottlenecks from thumbnail scheduling.
- After adding preview cancellation, one local benchmark run reduced initial
  node-load document render work from `3` renders / roughly `3239ms` to `1`
  draft render / roughly `26ms`; initial load duration dropped from roughly
  `8.8s` to `3.9s` in that run.
- Node thumbnail invalidation now keeps image readiness target-local. If an
  image used only by branch A finishes decoding, branch B thumbnails keep their
  last good frame instead of entering the queue. The graph helper layer also has
  an explicit downstream traversal helper for validating future centralized
  thumbnail scheduling.
- Passive visible node thumbnails render at a lighter internal scale than
  selected/output thumbnails. Composition, aspect, graph traversal, and effect
  density remain the same; high-DPI rendering is reserved for the active node
  or explicit output preview so cold node-editor entry does less pixel work.

Future measurements can add named marks around:

- graph traversal
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

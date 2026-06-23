# Testing

## Running tests

```bash
npm test                               # web Vitest suite
npm run test:api                       # API tests
npm run test:coverage                  # web + API Vitest coverage baseline
npm run test:coverage:web              # web Vitest coverage baseline
npm run test:coverage:api              # API Vitest coverage baseline
npm run check                          # format, lint, web/API typecheck, web/API tests
npm run test:browser                   # Playwright smoke/regression tests in Chromium, Firefox, WebKit, plus mobile smoke
npm run test:browser:chromium          # focused Chromium browser tests
npm run test:browser:firefox           # focused Firefox browser tests
npm run test:browser:webkit            # focused WebKit/Safari-family browser tests
npm run test:browser:mobile            # focused mobile Chromium/WebKit layout smoke
npm run test:browser:release           # full browser gate with a fresh local dev server
npm run test:browser:install           # install Chromium, Firefox, and WebKit for Playwright
npm run perf:node-editor               # opt-in node editor performance benchmark
npm run --silent fallow                # report-only code-quality baseline in JSON
npm run --silent fallow:audit -- --base origin/development  # changed-code Fallow audit in JSON
npm --workspace @artifact/web run test -- app/types/config.test.ts  # single web test file
```

Web tests are co-located with the code they cover under `apps/web/app` or
grouped under `apps/web/app/test-fixtures/`. API tests live under
`apps/api/test`.

Coverage is a diagnostic baseline, not a release threshold yet. The coverage
commands use Vitest's V8 provider and emit a console summary plus
`coverage/coverage-summary.json` in the workspace that ran the command. Use the
numbers to find untested risk areas, but keep release confidence tied to the
test categories below: pure logic, render fixtures, browser regressions, and
manual visual QA where snapshots would be brittle.

Fallow is also a diagnostic baseline in v0.31, not a strict release threshold.
Use it for code-quality reports, changed-code review, cleanup planning,
duplication checks, and complexity triage. Agent and CI usage should keep output
machine-readable and report-only:

```bash
FALLOW_AGENT_SOURCE=codex npm run --silent fallow -- > /private/tmp/artifact-fallow-baseline.json 2>/dev/null || true
FALLOW_AGENT_SOURCE=codex npm run --silent fallow:audit -- --base origin/development > /private/tmp/artifact-fallow-audit.json 2>/dev/null || true
FALLOW_AGENT_SOURCE=codex npm run --silent fallow:dead-code -- --unused-exports > /private/tmp/artifact-fallow-unused-exports.json 2>/dev/null || true
FALLOW_AGENT_SOURCE=codex npm run --silent fallow:dupes -- --mode mild --top 20 > /private/tmp/artifact-fallow-dupes.json 2>/dev/null || true
FALLOW_AGENT_SOURCE=codex npm run --silent fallow:health -- --top 20 > /private/tmp/artifact-fallow-health.json 2>/dev/null || true
```

Fallow exit code 1 means findings were reported. It is not a command failure.
Do not run `fallow watch` in agent sessions. Do not enable Fallow telemetry on
behalf of the user; setting `FALLOW_AGENT_SOURCE` only labels a run if telemetry
was already enabled by the user. Run `fallow fix --dry-run --format json --quiet`
and trace affected files, exports, or dependencies before any cleanup edit.
The first v0.31 baseline and cleanup backlog live in
[`fallow-v0.31-baseline.md`](fallow-v0.31-baseline.md).

Current baseline, captured during the v0.27 planning slice:

| Command | Files / tests | Statements | Branches | Functions | Lines |
| --- | --- | ---: | ---: | ---: | ---: |
| `npm run test:coverage:web` | 51 files / 369 tests | 59.27% | 55.10% | 68.06% | 62.13% |
| `npm run test:coverage:api` | 21 files / 93 passed, 1 skipped | 77.51% | 69.11% | 83.77% | 81.58% |

## Debug Flags

- Node performance overlay: `?debug=perf`, `?perf=1`, or
  `localStorage.setItem('artifact-debug-perf', '1')`.
- AI generation access/job diagnostics: `?debug=ai`, `?aiDebug=1`,
  `?debugAi=1`, `VITE_AI_DEBUG=1`, or
  `localStorage.setItem('artifact-debug-ai', '1')`.

---

## Test categories

### Unit tests

Fast, no browser required. Run in Node with `@napi-rs/canvas` polyfilling Canvas 2D.

To measure the current unit/render baseline:

```bash
npm run test:coverage:web
npm run test:coverage:api
```

Do not chase line coverage blindly. For this app, a small render or browser
regression around graph traversal, preview/export parity, asset persistence, or
gesture isolation can be more valuable than broad coverage over presentational
markup.

| File | Covers |
| --- | --- |
| `apps/web/app/types/config.test.ts` | Factory functions, `cloneDocument`, `migrateFromV1`, layer defaults |
| `apps/web/app/utils/documentPersistence.test.ts` | document normalization, URL import precedence, localStorage fallback, storage save/link helpers |
| `apps/web/app/utils/documentAssets.test.ts` | imported image/font dependency inventory, portable document hydration/storage boundaries, storage-unavailable fallback |
| `apps/web/app/utils/randomConfig.test.ts` | `randomDocument`, `randomEffectLayer`, `zeroLayerSection` |
| `apps/web/app/utils/nodeGraph.test.ts` | graph mutation helpers, traversal, render order, cycle prevention, layout, connected ports |
| `apps/web/app/components/node-canvas/reducer.test.ts` | Graph reducer: add/remove/connect/disconnect nodes |
| `apps/web/app/components/node-canvas/helpers.test.ts` | Node canvas helper utilities |
| `apps/web/app/components/node-canvas/thumbnails/renderSignature.test.ts` | thumbnail invalidation signatures for layers, graph nodes, and edges |

### Render baseline tests

Verify deterministic renderer behavior for the Canvas 2D paths that are stable
in the Node test environment.

**Location:** `apps/web/app/test-fixtures/render/renderParity.test.ts`

**Current fixtures covered:**
- Fill-only document
- Text over fill
- Emoji layer with deterministic seed
- Image free-fit with an in-memory test image cache
- Noise and array procedural source layers
- Stack mode compared with an inferred linear graph for a simple document
- Export-size smoke tests for deterministic stack documents

**Current assertions include:**

- requested canvas dimensions are respected
- fill-only output is fully opaque
- repeat renders are pixel-identical for deterministic fixtures
- seeded emoji output changes when the seed changes
- selected centre pixels remain stable across preview/export sizes

### Graph render tests

Verify graph traversal and graph-only nodes through the canonical renderer.

**Location:** `apps/web/app/test-fixtures/render/graphRender.test.ts`

**Current fixtures covered:**
- Export node traversal uses graph topology instead of layer-stack order
- `renderDocument` graph mode matches `renderGraphTarget` for an export node
- Merge node composition with opacity
- Color node adjustment on an upstream branch

**Planned fixtures:**
- Multiple effect layers with GPU effects skipped or mocked
- Primitive smoke tests where a WebGL-capable test environment is available

GPU/PixiJS and Three.js cases should use smoke tests unless CI provides a
stable WebGL context.

### Browser tests

Use Playwright for behavior that Node/Vitest cannot honestly exercise.

**Location:** `tests/browser/`

**Current coverage:**

- Layer canvas still renders after switching from layers → nodes → layers.
- Editor guardrail coverage verifies selected-target breadcrumbs, hidden status,
  layer-backed lock status, disabled locked node deletion, graph-only utility
  context, and output no-input messaging.
- Primitive nodes expose interactive camera controls in a real browser.
- Text/image node transform gestures stay local to the selected node: wheel
  scaling must not zoom the React Flow canvas, must not crash with maximum
  update depth, and must keep the live overlay mounted through the deferred
  commit.
- AI Image node add flow exposes the account-gated source node, and anonymous
  browser-test access disables generation instead of hiding or breaking the
  rest of the editor.
- Mocked AI alpha QA covers an AI-enabled generation flow, generated image
  export, prompt provenance after reload, quota-exhausted access, and provider
  failure messaging without spending provider tokens.
- Default document export triggers a browser download in Chromium and WebKit.
  Firefox still runs the editor/export-adjacent suite, but its CI download event
  is skipped because GitHub Actions does not report the Playwright download
  event reliably there.
- Mobile smoke keeps the starter actions, layer list, canvas, and primary
  action bar visible without horizontal overflow.
- v0.33 storage/PWA smoke verifies the local status strip, Projects storage
  entry point, manifest, and service-worker shell asset.
- The v0.30 visual baseline in `tests/browser/v030-visual.spec.ts` covers a
  curated set of editor states with deterministic fixtures: blank editor,
  selected/hidden/locked layer rows, Layers Add Library, Nodes output-path
  context, Nodes Add Library, nonblank preview, and graph output color sampling.
- Layer reorder regressions cover both canonical stack synchronization and stale
  dragover/drop ordering, so the final drop row wins even if the visual hover
  target changed earlier in the drag.
- Effect node inspector coverage verifies that local effect `seedOffset`
  controls are exposed in Nodes mode and persist into the document.

These tests are intentionally few and high-signal. They protect WebGL, browser
input events, and preview/export integration without turning the suite into a
large brittle E2E project.

CI runs the full browser gate inside the official Playwright image that matches
the locked Playwright version, so Chromium, Firefox, WebKit, and their system
dependencies are already present instead of being installed during every run.

Local release prep should use `npm run test:browser:release`. It sets
`PLAYWRIGHT_REUSE_SERVER=0` so Playwright starts a fresh React Router dev
server instead of accidentally reusing a stale server from a previous failed
run. Regular focused development commands may still reuse an existing local
server when that is intentional.

The v0.30 visual baseline deliberately does not start with broad golden
screenshots. UI surfaces use layout, computed-style, readable-control, and
structural assertions; canvas-heavy surfaces use nonblank and color-sampling
assertions. Add golden screenshots only after a surface proves deterministic
across supported browsers and operating systems.

As the v0.30 editor design-system foundation lands, add focused browser
coverage for the internal style-guide route before broad editor migration. The
style-guide checks should prove reusable primitives and their states are
visible, readable, focusable, non-overlapping, and deterministic. Editor flow
tests should keep proving behavior; style-guide tests should prove the reusable
visual contract.

### Performance benchmarks

Use the opt-in benchmark when a change may affect node-editor responsiveness:

```bash
npm run perf:node-editor
```

It writes JSON to `test-results/performance/node-editor.json` and reports frame
timing, long tasks, and thumbnail render cost. See
[`docs/performance.md`](performance.md) for comparison workflow and metric
interpretation.

### Adding a fixture

```ts
// apps/web/app/test-fixtures/render/renderParity.test.ts
it('my new fixture', async () => {
  const doc = {
    global: { bg: '#000000', seed: 1, aspect: '1:1' },
    layers: [
      makeFillLayer({ color: '#ff0000' }),
      makeTextLayer({ content: 'hi', size: 24 }),
    ],
    export: { format: 'png', scale: 1, target: 'cover' },
  } satisfies CanvasDocument;

  const canvas = await renderDocument(doc, 100, 100, new Map(), {
    skipEffects: true,
    graphMode: 'stack',
  });

  expect(canvas.width).toBe(100);
});
```

Prefer small deterministic assertions first. Add tolerant pixel-diff helpers
only when a fixture needs them.

---

## What is NOT tested automatically

| Concern | Reason | Manual approach |
| --- | --- | --- |
| Detailed PixiJS shader visual output | Needs stable GPU visual snapshots | Browser smoke test + manual visual pass |
| Detailed Three.js primitive visual output | Needs stable GPU visual snapshots | Browser smoke test + manual visual pass |
| Complex drag/connect gestures | Browser event timing can be brittle | Add targeted Playwright regressions for known bugs |
| Preset thumbnails in the UI | Visual | Load presets page and eyeball |

---

## Gesture Regression Checklist

When touching selected node previews, React Flow event isolation, thumbnail
invalidation, or primitive camera controls, run at least:

```bash
npm run test:browser -- -g "image transform gestures stay local to the selected node"
npm run test:browser -- -g "primitive node exposes interactive camera controls"
```

Run them sequentially. React Router type generation writes to
`apps/web/.react-router/types`, and concurrent Playwright web servers can race
while creating that generated directory.

For image/text transform bugs, the browser test should assert the behavior, not
only absence of a crash:

- the React Flow viewport transform is unchanged after wheel scaling inside the
  selected preview
- `.node-live-media-overlay` remains visible after the wheel idle commit
- `.node-thumbnail-skeleton` is not visible while the selected-node live
  surface owns the interaction
- wheel over ordinary node chrome does not mutate the layer scale

For primitive regressions, keep the test centered on the live viewport:

- left drag rotates
- wheel zooms the primitive camera
- reset preserves the expected default
- graph pan/zoom is still available when the primitive camera is locked

---

## Snapshot philosophy

This project does not use Jest/Vitest snapshot tests for UI components.
The output is visual; pixel diff tests on the render pipeline give more
signal with less maintenance cost than component snapshots.

---

## CI

CI has two jobs:

- Fast quality/build: format check, lint, typecheck, unit/render tests, and production build.
- Browser smoke: installs Playwright Chromium, Firefox, and WebKit and runs
  `npm run test:browser`.

If a deployment environment cannot provide Chromium/WebGL, explicitly waive the
browser job in release notes instead of silently removing coverage.

```yaml
# Effective CI sequence
npm ci
npm run format:check
npm run lint
npm run typecheck
npm run build:ci
npm test
npm run test:browser
```

---

## Related docs

- [`docs/rendering.md`](rendering.md) — full pipeline walkthrough
- [`docs/state-model.md`](state-model.md) — what state affects render output
- [`docs/performance.md`](performance.md) — node-editor benchmark workflow
- [`docs/improvement-plan.md`](improvement-plan.md) — phased quality checklist

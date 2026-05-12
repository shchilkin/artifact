# Testing

## Running tests

```bash
npm test                               # all tests (vitest run)
npm run test:browser                   # Playwright browser smoke/regression tests
npm run test:browser:install           # install Chromium for Playwright
npx vitest run app/types/config.test.ts  # single file
```

Tests are co-located with the code they cover or grouped under `app/test-fixtures/`.

---

## Test categories

### Unit tests

Fast, no browser required. Run in Node with `@napi-rs/canvas` polyfilling Canvas 2D.

| File | Covers |
| --- | --- |
| `app/types/config.test.ts` | Factory functions, `cloneDocument`, `migrateFromV1`, layer defaults |
| `app/utils/documentPersistence.test.ts` | document normalization, URL import precedence, localStorage fallback, storage save/link helpers |
| `app/utils/randomConfig.test.ts` | `randomDocument`, `randomEffectLayer`, `zeroLayerSection` |
| `app/utils/nodeGraph.test.ts` | graph mutation helpers, traversal, render order, cycle prevention, layout, connected ports |
| `app/components/node-canvas/reducer.test.ts` | Graph reducer: add/remove/connect/disconnect nodes |
| `app/components/node-canvas/helpers.test.ts` | Node canvas helper utilities |
| `app/components/node-canvas/thumbnails/renderSignature.test.ts` | thumbnail invalidation signatures for layers, graph nodes, and edges |

### Render baseline tests

Verify deterministic renderer behavior for the Canvas 2D paths that are stable
in the Node test environment.

**Location:** `app/test-fixtures/render/renderParity.test.ts`

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

**Location:** `app/test-fixtures/render/graphRender.test.ts`

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
- Primitive nodes expose interactive camera controls in a real browser.
- Default document export triggers a browser download.

These tests are intentionally few and high-signal. They protect WebGL, browser
input events, and preview/export integration without turning the suite into a
large brittle E2E project.

### Adding a fixture

```ts
// app/test-fixtures/render/renderParity.test.ts
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

## Snapshot philosophy

This project does not use Jest/Vitest snapshot tests for UI components.
The output is visual; pixel diff tests on the render pipeline give more
signal with less maintenance cost than component snapshots.

---

## CI

CI can keep browser tests as an optional job if Chromium/WebGL is available.
Keep the default fast quality gate on Vitest/typecheck/build; run
`npm run test:browser` in environments that have installed Playwright Chromium.

```yaml
# Effective CI sequence
npm ci
npm run format:check
npm run lint
npm run typecheck
npm run build:ci
npm test
npm run test:browser # optional browser/WebGL job
```

---

## Related docs

- [`docs/rendering.md`](rendering.md) — full pipeline walkthrough
- [`docs/state-model.md`](state-model.md) — what state affects render output
- [`docs/improvement-plan.md`](improvement-plan.md) — phased quality checklist

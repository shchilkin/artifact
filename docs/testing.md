# Testing

## Running tests

```bash
npm test                               # all tests (vitest run)
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
| `app/utils/randomConfig.test.ts` | `randomDocument`, `randomEffectLayer`, `zeroLayerSection` |
| `app/utils/nodeGraph.test.ts` | `collectUpstreamNodeIds`, graph traversal helpers |
| `app/components/node-canvas/reducer.test.ts` | Graph reducer: add/remove/connect/disconnect nodes |
| `app/components/node-canvas/helpers.test.ts` | Node canvas helper utilities |

### Render parity tests

Verify that preview and export render the same pixels for deterministic Canvas 2D cases.

**Location:** `app/test-fixtures/render/renderParity.test.ts`

**Fixtures covered:**
- Fill-only document
- Text over fill
- Image free-fit over fill (with placeholder image)
- Emoji layer with deterministic seed
- Noise layer
- Array layer
- Multiple effect layers (grain, scanlines)
- Graph fixtures: merge node, color node, export node, primitive smoke test

**How pixel comparison works:**

Each fixture renders at a fixed 100×100 resolution. The test:
1. Renders via `renderDocument` at the preview size
2. Renders via the export path at double size, then scales down
3. Compares pixel channels with a tolerance of ±2 (for antialiasing/rounding)

GPU/Three.js cases use smoke tests only (render completes, dimensions match,
non-empty pixels exist).

### Adding a fixture

```ts
// app/test-fixtures/render/renderParity.test.ts
it('my new fixture', async () => {
  const doc = makeTestDoc([
    makeFillLayer({ color: '#ff0000' }),
    makeTextLayer({ content: 'hi', size: 24 }),
  ]);
  await expectRenderParity(doc);
});
```

`expectRenderParity` renders at 100×100 and 200×200, scales the larger canvas
down, and asserts pixel equality within tolerance.

---

## What is NOT tested automatically

| Concern | Reason | Manual approach |
| --- | --- | --- |
| PixiJS GPU shaders | WebGL is unavailable in Node | Smoke test: render completes + non-empty pixels |
| Three.js 3D rendering | Same | Smoke test: render completes + dimensions |
| Interaction gestures | Requires browser + input events | Manual pass per Phase 1 checklist |
| Preset thumbnails in the UI | Visual | Load presets page and eyeball |

---

## Snapshot philosophy

This project does not use Jest/Vitest snapshot tests for UI components.
The output is visual; pixel diff tests on the render pipeline give more
signal with less maintenance cost than component snapshots.

---

## CI

CI skips `npm run favicon` (requires Puppeteer/WebGL) and calls
`npx react-router build` directly. `public/favicon.png` is committed as the
fallback.

```yaml
# Effective CI sequence
npm ci
npx react-router build
npm test
```

---

## Related docs

- [`docs/rendering.md`](rendering.md) — full pipeline walkthrough
- [`docs/state-model.md`](state-model.md) — what state affects render output
- [`docs/improvement-plan.md`](improvement-plan.md) — Phase 5 (render parity fixtures)

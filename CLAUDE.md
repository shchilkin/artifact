# CLAUDE.md — Album Cover Utils

## Project Purpose

Browser-based album cover generator: users compose layered artwork with emojis, images, text, fills, and WebGL post-effects, then export as PNG/JPEG. The app lives at `/app` (React Router route).

---

## Tech Stack

- **React 19** + **React Router v7** (framework mode, SSR-capable)
- **TypeScript** ~6.0, strict
- **Tailwind v4** (Vite plugin, CSS-first config)
- **Vite 8**
- **PixiJS 7** — WebGL filter pass for effect layers
- **Canvas 2D** — base rendering for all non-WebGL layers
- **Framer Motion** — sidebar/panel animations

---

## Architecture: Data Model

**Core type** — `CanvasDocument` in `app/types/config.ts`:

```ts
interface CanvasDocument {
  global: GlobalConfig;   // { bg, seed, aspect }
  layers: Layer[];        // ordered bottom-to-top
}
```

**Layer kinds** (`LayerKind`):

| Kind | Key fields |
|------|-----------|
| `emoji` | emojis[], density, minSz, maxSz, blur, opacity, blendMode |
| `effect` | 30+ numeric sliders (grain, glitch, ca, rays, noiseWarp, …); optional `preset` tag |
| `text` | content, font, size, color, x/y (0–1 normalized), rotation, align, scaleX/Y |
| `image` | src (data URL), fit (cover/contain/tile/free), x/y, scaleX/Y, rotation |
| `fill` | color, opacity, blendMode |

**Factory functions** (always use these to create layers):
`makeTextLayer`, `makeImageLayer`, `makeEmojiLayer`, `makeFillLayer`, `makeEffectLayer`, `makeEffectPresetLayer`

**Effect presets** (`EffectPreset`): `rays | glitch | grain | tint | warp | color | riso` — defined in `EFFECT_PRESETS`, each is a focused zero-based `EffectLayer` partial.

**Aspect ratios** (`AspectRatio`): `1:1 | 4:5 | 9:16 | 16:9` → pixel sizes in `ASPECT_SIZES`.

---

## Architecture: Rendering Pipeline

Two-stage pipeline in `app/utils/renderer.ts`:

1. **Canvas 2D** — `renderDocument` iterates `doc.layers` in order, drawing each layer to a single `<canvas>`. Effect layers run `applyCanvas2DEffects` (rays, glitch, CA, scanlines, grain, tint).

2. **PixiJS WebGL** — after each `effect` layer's Canvas 2D pass, `buildFiltersFromEffectLayer` (in `app/utils/pixiFilters.ts`) returns a `Filter[]`. If non-empty, `runGpuPass` blits the current canvas into a Pixi render texture, applies filters, and extracts a new canvas. The pipeline then continues on that output canvas.

**Entry point for export/preview:**
```ts
renderDocument(doc, W, H, imageCache, persistentRenderer?): Promise<HTMLCanvasElement>
```

**Scale baseline**: `REF = 540` — all size values are authored at 540px and scaled by `W / REF` at render time.

---

## Architecture: State Management

All document state lives in `app/routes/generator.tsx`:

- `doc` / `_setDoc` — never call `_setDoc` directly from outside; always go through `setDoc` (the wrapped version).
- `setDoc` debounces history writes (400 ms). For drag operations the pre-drag baseline is captured in `preChangeRef` on the first `setDoc` call; subsequent calls within the debounce window don't push extra history entries.
- `setSeed` and `handleRandomize` flush debounce and push history synchronously before mutating.
- Undo/redo: `past[]` / `future[]` of `{ doc: CanvasDocument }`, max 50 entries.
- `imageCache: Map<string, HTMLImageElement>` — keyed by `layer.src` (data URL). Populated asynchronously; image layers silently skip rendering if the image isn't loaded yet.
- `docRef` / `selectedLayerIdRef` — `useLayoutEffect`-synced refs used inside callbacks to avoid stale closures.

---

## Key Files

| File | Purpose |
|------|---------|
| `app/types/config.ts` | All types, factory functions, `cloneDocument`, `migrateFromV1`, `EFFECT_PRESETS` |
| `app/utils/renderer.ts` | `renderDocument` (async, GPU), `render` (sync, legacy), layer draw functions |
| `app/utils/pixiFilters.ts` | `buildFiltersFromEffectLayer` — maps `EffectLayer` fields to Pixi `Filter[]` |
| `app/utils/gpuRender.ts` | One-shot Pixi renderer for export (no persistent `Renderer`) |
| `app/utils/randomConfig.ts` | `randomDocument`, `randomEffectLayer`, `randomLayerSection`, `zeroLayerSection` |
| `app/utils/exportCanvas.ts` | PNG/JPEG export at 1×/2×/3× — calls `renderDocument` then triggers download |
| `app/utils/exportEnvMap.ts` | Equirectangular env map export for 3D use |
| `app/routes/generator.tsx` | Main page: all state, undo/redo, image cache, event handlers |
| `app/components/Sidebar.tsx` | Layer list + selected-layer controls (sliders, color pickers, toggles) |
| `app/components/CanvasPreview.tsx` | Live canvas preview; drag-to-reposition text/image layers |
| `app/components/LayerPanel.tsx` | Drag-to-reorder layer list, add/remove/duplicate/rename |
| `app/components/PresetsPanel.tsx` | Save/load/delete named presets (stored in `localStorage`) |
| `app/hooks/useDocumentRenderer.ts` | Hook that drives the async render loop for preview |
| `app/utils/lcg.ts` | Deterministic LCG RNG seeded by `doc.global.seed` |

---

## Dev Commands

```bash
npm run dev        # favicon generation + React Router dev server
npm run build      # favicon generation + production build
npm run typecheck  # react-router typegen + tsc
npm run lint       # ESLint
```

---

## Important Invariants

- **Layer order is render order.** Index 0 is drawn first (bottom). Never sort or reorder layers outside of an explicit user drag action.
- **Always `cloneDocument` before mutating.** `CanvasDocument` and its layers are treated as immutable. Pass the clone to `setDoc`; never mutate `doc` in place.
- **LocalStorage key is `doc`.** No legacy migration keys exist; any unreadable value is discarded and `DEFAULT_DOCUMENT` is used instead.
- **Emoji layer `emojis` array must be spread-cloned.** `cloneDocument` handles this; manual clones must do the same (`{ ...layer, emojis: [...layer.emojis] }`).
- **`renderDocument` is async** because the GPU pass is async. Never `await` it inside a synchronous render loop; use the `useDocumentRenderer` hook for live preview.
- **`preChangeRef` is the drag baseline.** Set once on the first `setDoc` during a drag; cleared after the debounce fires. Do not reset it mid-drag or history will record intermediate states.
- **Image sources are data URLs**, stored directly in `layer.src`. Max upload size enforced at 5 MB in `generator.tsx`.

---

## What NOT To Do

- **Don't flatten the layer model** back into a single flat config object. All code uses `CanvasDocument`; there is no `GeneratorConfig` type.
- **Don't skip `cloneDocument`** when writing state. Mutating the live doc causes silent render bugs and breaks undo.
- **Don't add `as unknown` casts** to escape type errors — fix the types instead.
- **Don't call `_setDoc` directly** outside `generator.tsx`. Always go through the `setDoc` wrapper so history is recorded.
- **Don't import PixiJS at the module top level** in paths that run server-side. Pixi is browser-only; use dynamic `import('pixi.js')` inside async functions as the existing code does.
- **Don't add effect parameters to `EffectLayer` without also updating** `DEFAULT_EFFECT_LAYER_PROPS`, `ZERO_EFFECT`, all relevant `EFFECT_PRESETS` entries, `buildFiltersFromEffectLayer`, and the `Sidebar` controls.

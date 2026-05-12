# Copilot Instructions

> See `/COPILOT.md` for the expanded node-canvas architecture, QA guidance, and development strategy that complements these repo-specific instructions.

## Read architecture docs first

Before changing state ownership, rendering, node editor behavior, thumbnails, preview/export parity, or 3D primitive controls, read:

- `docs/state-model.md`
- `docs/rendering.md`
- `docs/node-editor.md`
- `docs/improvement-plan.md`
- `docs/roadmap.md`

Update the relevant doc when architecture or interaction rules change.

## Commands

```bash
npm run dev        # React Router dev server
npm run build      # production build
npm run favicon    # optional local bitmap favicon generation
npm run typecheck  # react-router typegen + tsc
npm run lint       # ESLint
npm test           # vitest run (all tests)
npx vitest run app/types/config.test.ts   # run a single test file
```

> Build no longer depends on `npm run favicon` (requires Puppeteer/WebGL). The committed fallback is `public/favicon.svg`; `public/favicon.png` is optional local generated output.

## Architecture

**SPA only** — `react-router.config.ts` sets `ssr: false`. Never add server-only imports to the render pipeline.

### Data model (`app/types/config.ts`)

The canonical document type is `CanvasDocument`:

```ts
interface CanvasDocument {
  global: GlobalConfig;   // bg, seed, aspect
  layers: Layer[];        // render order: index 0 = bottom
}
```

Layer kinds: `text | image | emoji | fill | effect` (plus procedural: `primitive | noise | array`).

Always create layers with factory functions — never construct them manually:
`makeTextLayer`, `makeImageLayer`, `makeEmojiLayer`, `makeFillLayer`, `makeEffectLayer`, `makeEffectPresetLayer`, `makeSourceLayer`

Use `makeEffectPresetLayer` for new effect layers. Legacy combined effect
presets are not part of the current model; document normalization splits stored
combined effects into focused preset layers.

### Two-stage rendering pipeline (`app/utils/renderer.ts`)

`app/utils/renderer.ts` is the public facade. Renderer implementation internals
live under `app/utils/render/`.

`renderDocument(doc, W, H, imageCache)` is **async** and returns a `Promise<HTMLCanvasElement>`:

1. **Canvas 2D** — iterates layers in order; effect layers run `applyCanvas2DEffects` (grain, glitch, CA, scanlines, tint, rays).
2. **PixiJS WebGL** — after each effect layer, `buildFiltersFromEffectLayer` (`app/utils/pixiFilters.ts`) returns a `Filter[]`. If non-empty, `gpuRenderToCanvas` blits the canvas into a Pixi render texture, applies GLSL filters, and returns a new canvas. The pipeline continues on that output.

Scale baseline: `REF = 540`. All authored size values are at 540px and multiplied by `W / 540` at render time, so preview and export match exactly.

### State management (`app/routes/generator.tsx`)

All document state lives here. Key rules:
- **Never call `_setDoc` directly** — always use the `setDoc` wrapper (records undo history, 400 ms debounce).
- `setSeed` and `handleRandomize` flush the debounce and push history synchronously.
- `preChangeRef` captures the pre-drag baseline on the first `setDoc` during a drag. Don't reset it mid-drag.
- `docRef` / `selectedLayerIdRef` are `useLayoutEffect`-synced refs for use inside callbacks to avoid stale closures.
- Undo/redo: `past[]` / `future[]`, max 50 entries.
- `imageCache: Map<string, HTMLImageElement>` — keyed by `layer.src` (data URL). Image layers silently skip if not yet loaded.

### localStorage

- Document key: `doc` (v2 schema). Unreadable values fall back to `DEFAULT_DOCUMENT`.
- Presets key: separate, managed by `usePresets` hook. Max 20 presets.

## Key conventions

**Immutable document mutations** — always `cloneDocument` before any change:
```ts
const next = cloneDocument(doc);
next.layers[i].opacity = 0.5;
setDoc(next);
```
Mutating `doc` in place causes silent render bugs and breaks undo. Emoji layers need `emojis: [...layer.emojis]` if cloned manually.

**PixiJS is browser-only** — never import it at the module top level in any file that may be evaluated server-side. Use dynamic `import('pixi.js')` inside async functions (as the existing code does).

**Adding an effect parameter** — when adding a field to `EffectLayer`, update all of: `DEFAULT_EFFECT_LAYER_PROPS`, `ZERO_EFFECT`, all relevant `EFFECT_PRESETS` entries, `buildFiltersFromEffectLayer`, and the `Sidebar` controls. Omitting any of these causes preset/randomizer inconsistencies.

**Text/image layer positions** — `x` and `y` are normalized 0–1 fractions of canvas dimensions, not pixel values.

**No `as unknown` casts** — fix the type instead.

**`prefers-reduced-motion`** — disable non-essential animations when the media query matches. See `app/index.css` and `HeroCover.tsx` for existing patterns.

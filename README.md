# Emoji Art Generator

Glitch-aesthetic album cover generator. Emoji on canvas, GPU post-processing, seeded randomness.

## Stack

- React 18 + TypeScript + Vite
- HTML5 Canvas 2D — base rendering pipeline
- PixiJS 7 (WebGL) — GPU post-processing effects
- localStorage — preset system

## Rendering pipeline

Each frame runs in two stages:

**Stage 1 — Canvas 2D** (`src/utils/renderer.ts`)

1. Background + radial vignette
2. Light rays (`screen` blend)
3. VHS glitch streaks (`screen` blend)
4. Emoji layer — sorted by distance, radial zoom blur
5. Chromatic aberration (pixel-level R/B channel shift)
6. Scanlines
7. Film grain (offscreen canvas, `overlay` blend)
8. Color tint (`multiply` blend)

All pixel-value parameters (emoji size, CA offset, glitch height, scanline spacing) scale by `W / 540` so exports match the preview exactly.

**Stage 2 — PixiJS WebGL** (`src/utils/pixiFilters.ts`)

Canvas 2D output is blitted to a `RenderTexture` (guaranteed GPU-resident), then two optional GLSL filters run:

- **Liquid Morph** — sine-wave domain warp in normalized UV space
- **Chunk Tear** — seeded horizontal strip offset (VHS block glitch)

Both filters use `inputClamp` to avoid sampling FBO padding (prevents black edges).

## Seeded randomness

LCG RNG (`src/utils/lcg.ts`). Each layer gets an independent sub-seed via XOR constants so changing any one parameter (e.g. glitch count) doesn't shift emoji positions.

## Features

- Live preview at 540×540, export at 1500 / 2000 / 3000px
- Export pixel-matches preview (same pipeline, scaled)
- Preset system: save/load/delete, 120px thumbnails, stored in localStorage (max 20)
- Collapsible sidebar sections, full dark theme

## Dev

```bash
npm install
npm run dev
```

## Project structure

```
src/
  components/
    Sidebar.tsx        # Layer controls
    CanvasPreview.tsx  # PixiJS container
    PresetsPanel.tsx   # Preset save/load UI
    BottomBar.tsx      # Seed, randomize, export, presets toggle
  hooks/
    usePixiRenderer.ts # Canvas 2D → RenderTexture blit → filters → screen
    usePresets.ts      # localStorage CRUD
  utils/
    lcg.ts             # Seeded LCG RNG
    renderer.ts        # Canvas 2D pipeline
    pixiFilters.ts     # PixiJS GLSL filters
    exportCanvas.ts    # Hi-res export
  types/
    config.ts          # GeneratorConfig type + defaults
```

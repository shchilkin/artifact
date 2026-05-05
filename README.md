# Artifact

Glitch-aesthetic album cover generator. Emoji on canvas, 16 GPU post-processing
effects, seeded randomness, equirectangular environment map export.

## Stack

- React Router v7 + TypeScript + Vite
- HTML5 Canvas 2D — base rendering pipeline
- PixiJS 7 (WebGL) — GPU shader effects
- localStorage — preset system

## Routes

| Path        | File                   | Description                              |
| ----------- | ---------------------- | ---------------------------------------- |
| `/`         | `routes/home.tsx`      | Landing page with animated hero covers   |
| `/app`      | `routes/generator.tsx` | Main generator: canvas, controls, export |
| `/examples` | `routes/examples.tsx`  | 8 curated presets with live previews     |

## Rendering pipeline

Each frame runs in two stages:

**Stage 1 — Canvas 2D** (`app/utils/renderer.ts`)

1. Background + radial vignette
2. Light rays (`screen` blend)
3. VHS glitch streaks (`screen` blend)
4. Emoji layer — sorted by distance, radial zoom blur
5. Chromatic aberration (pixel-level R/B channel shift)
6. Scanlines
7. Film grain (offscreen canvas, `overlay` blend)
8. Color tint (`multiply` blend)

All pixel-value parameters (emoji size, CA offset, glitch height, scanline
spacing) scale by `W / 540` so exports match the preview exactly.

**Stage 2 — PixiJS WebGL** (`app/utils/pixiFilters.ts`)

Canvas 2D output is blitted to a `RenderTexture`, then up to 16 GLSL shader
filters run in order:

| Pass    | Effects                                                                            |
| ------- | ---------------------------------------------------------------------------------- |
| Warp    | Mirror, Data Mosh, Interlace, Noise Warp, Liquid Morph, Vortex, Barrel, Chunk Tear |
| Colour  | Pixelate, Posterize, Hue Shift, RGB Split, Duotone, Halftone, Riso Misregistration |
| Overlay | Bloom, Vignette, Film Burn                                                         |

All shaders use normalized UV via `NORM_UV` + `inputClamp` to avoid FBO padding
artifacts.

## Seeded randomness

LCG RNG (`app/utils/lcg.ts`). Each layer gets an independent sub-seed via XOR
constants so changing any one parameter doesn't shift emoji positions. RAND
button generates a full aesthetically-coherent config (colors, effects, emoji)
from scratch.

## Features

- Live preview at 540×540
- Export at 1500 / 2000 / 3000px square — export pixel-matches preview
- **Environment map export** — 4096×2048 equirectangular PNG, elements
  auto-scaled ×0.25 for correct FOV on a 3D sphere (Blender-ready HDRI)
- Preset system: save/load/delete, GPU-accurate thumbnails, stored in
  localStorage (max 20)
- 8 built-in curated example presets (acid-rain, film-ghost, glitch-tape,
  phantom-violet, pixel-death, riso-print, void-echo, vortex-dream)
- Mobile-first 40/60 layout: canvas top, controls panel always visible below
- Collapsible sidebar sections, full dark theme
- **LogoGlyph** — animated navbar logo: one random emoji with a
  randomly-selected GPU effect variant (CRT glitch burst, riso misregistration,
  static-to-signal, phosphor bloom, pixel disintegration, or interactive
  trigger) picked on each page load

## Dev

```bash
npm install
npm run dev
```

Deploys to Vercel via `react-router build` → `build/client/`.

## Project structure

```
app/
  root.tsx                    # App shell, global nav, fonts
  routes.ts                   # Route definitions
  routes/
    home.tsx                  # Landing page
    generator.tsx             # Main generator UI
    examples.tsx              # Curated examples gallery
  components/
    SiteNav.tsx               # Top navigation bar (with LogoGlyph lockup)
    LogoGlyph.tsx             # Animated emoji logo (6 GPU variants)
    BottomBar.tsx             # Seed, randomize, export dropdown, presets toggle
    CanvasPreview.tsx         # PixiJS container + live render loop
    Sidebar.tsx               # All layer controls (collapsible sections)
    PresetsPanel.tsx          # Preset save/load UI
    HeroCover.tsx             # Animated cover for the home hero
    EffectInfoPopup.tsx       # Tooltip descriptions for GPU effects
    ParentalAdvisoryBadge.tsx # PA badge overlay component
    Footer.tsx                # Site footer
  hooks/
    usePixiRenderer.ts        # Canvas 2D → RenderTexture blit → GPU filters → screen
    usePresets.ts             # localStorage CRUD + thumbnail generation
    useRenderer.ts            # Standalone Canvas 2D renderer hook
  utils/
    lcg.ts                    # Seeded LCG RNG
    renderer.ts               # Canvas 2D pipeline (stage 1)
    pixiFilters.ts            # 16 GLSL shaders + buildFilters() pipeline
    exportCanvas.ts           # Hi-res square export (PixiJS off-screen)
    exportEnvMap.ts           # 4096×2048 equirectangular export
    generateThumbnail.ts      # Full-pipeline 200×200 preset thumbnail
    randomConfig.ts           # Aesthetic config randomizer (RAND button)
    effectInfo.ts             # Human-readable descriptions of each GPU effect
    heroConfigs.ts            # Curated configs used on the home hero
    gpuRender.ts              # GPU-only render utility
  types/
    config.ts                 # GeneratorConfig interface + DEFAULT_CONFIG
  examples/                   # 8 curated preset JSON files
```

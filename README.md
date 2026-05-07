# Artifact

Glitch-aesthetic album cover generator. Photoshop-style layer system, emoji and
image layers, 20+ GPU shader effects, seeded randomness, aspect ratio support,
and equirectangular environment map export.

## Stack

- React Router v7 (SPA mode, `ssr: false`) + TypeScript + Vite
- HTML5 Canvas 2D — base rendering pipeline
- PixiJS 7 (WebGL) — GPU shader effects per effect layer
- localStorage — document persistence and preset system

## Routes

| Path        | File                   | Description                              |
| ----------- | ---------------------- | ---------------------------------------- |
| `/`         | `routes/home.tsx`      | Landing page with animated hero covers   |
| `/app`      | `routes/generator.tsx` | Main generator: canvas, layers, export   |
| `/examples` | `routes/examples.tsx`  | 8 curated presets with live previews     |

## Layer system

The generator uses a Photoshop-style layer stack (`CanvasDocument`). Each layer
is one of five kinds:

| Kind     | Description                                             |
| -------- | ------------------------------------------------------- |
| `emoji`  | Seeded scattered emoji field with density/size/blur     |
| `image`  | Dropped/pasted image — cover/contain/tile/free fit, alpha, blend mode |
| `text`   | Free-positioned text with font, size, blend, rotation   |
| `fill`   | Solid colour fill with blend mode                       |
| `effect` | One or more GPU shaders applied to everything below it  |

Layers render top-to-bottom. Effect layers act as non-destructive compositing
passes — each one runs Canvas 2D effects first, then a PixiJS GPU pass over
the accumulated stack below it.

## Rendering pipeline

`renderDocument(doc, W, H, imageCache)` in `app/utils/renderer.ts`:

1. Draw background colour
2. For each visible layer in order:
   - `emoji` → seeded scatter, LCG sub-seed per layer
   - `text` → Canvas 2D text with scale/rotation/blend
   - `image` → cover / contain / tile / free-fit with alpha
   - `fill` → full-canvas `fillRect` with blend mode
   - `effect` → Canvas 2D effects (grain, scanlines, glitch streaks, CA, tint,
     rays, film burn), then GPU shader pass via PixiJS WebGL

All pixel-value parameters scale by `W / 540` so ×1/×2/×3 exports
match the preview exactly.

**GPU shader passes** (`app/utils/pixiFilters.ts`)

Canvas 2D output is blitted to a `RenderTexture`, then GLSL filters run in
order within each effect layer:

| Group   | Effects                                                                              |
| ------- | ------------------------------------------------------------------------------------ |
| Warp    | Mirror, Data Mosh, Interlace, Noise Warp, Liquid Morph, Vortex, Barrel, Chunk Tear  |
| Colour  | Pixelate, Posterize, Hue Shift, RGB Split, Duotone, Halftone, Riso Misregistration  |
| Overlay | Bloom, Vignette, Film Burn                                                           |

All shaders use normalized UV coordinates so effects are resolution-independent.
Interlace uses a `uResY` uniform (canvas height) so scanline bands are always
~1 physical pixel at any export size.

## Aspect ratio and export

Four aspect ratios: `1:1` (1000×1000), `4:5` (1080×1350), `9:16` (1080×1920),
`16:9` (1920×1080). Preview scales the longest edge to 540px. Export at ×1/×2/×3
multiplies the base dimensions.

## Seeded randomness

LCG RNG (`app/utils/lcg.ts`). Each layer gets an independent sub-seed via XOR
constants. The RAND button (`randomDocument`) generates a full document: random
aspect ratio, a seeded emoji layer, and 2–8 randomized preset-based effect
layers drawn from 7 preset types (rays, glitch, grain, tint, warp, color, riso)
— all color-keyed to a shared base hue.

## Image persistence

### Current (SPA, no server)

| Method | Where stored | Limit | Shareable |
| --- | --- | --- | --- |
| Download (JPEG/PNG) | User's disk | None | Via file sharing |
| localStorage presets | Browser | ~5 MB total | No |
| `CanvasDocument` JSON in URL hash (potential) | URL | ~2 KB practical | Yes, via link |
| IndexedDB (potential) | Browser | Hundreds of MB | No |

The `CanvasDocument` JSON is the canonical source of truth. Presets already
serialize it to localStorage; moving to any other backend is a drop-in swap.

### Future (fullstack with DB)

Recommended pattern: store `CanvasDocument` JSON in Postgres, render + upload a
JPEG to object storage, store the CDN URL.

```sql
covers (
  id         uuid primary key,
  user_id    uuid references users,
  doc        jsonb,       -- CanvasDocument
  image_url  text,        -- CDN URL of rendered JPEG
  aspect     text,        -- '1:1' | '4:5' | '9:16' | '16:9'
  seed       int,
  created_at timestamptz
)
```

| Stack option | Notes |
| --- | --- |
| **Supabase** (Postgres + Storage + Auth) | Easiest for solo/small team. RLS out of the box. |
| **Neon / PlanetScale + Cloudflare R2** | More control, cheap egress. |
| **Cloudflare Workers + R2 + D1** | Edge-native, zero cold starts; natural fit for an SSR-less app. |

Server-side rendering uses the same `renderDocument` logic (Node Canvas or
headless Chromium in a Worker).

## Features

- Photoshop-style layer stack: add, reorder, rename (inline), toggle visibility,
  duplicate, delete
- Drag-and-drop / paste image import (5 MB cap, broken-image guard)
- Free-fit images: move outside canvas, uniform scale via trackpad/scroll,
  independent X/Y scale sliders
- Effect presets: Rays, Glitch, Grain, Tint, Warp, Color, Riso — stacked
  independently, each with full effect controls
- Aspect ratio: 1:1 / 4:5 / 9:16 / 16:9 selector
- Export at ×1 / ×2 / ×3 as JPEG or PNG
- **Environment map export** — 4096×2048 equirectangular PNG (Blender-ready)
- Preset system: save/load/delete, GPU-accurate thumbnails, localStorage (max 20)
- 8 built-in curated presets (acid-rain, film-ghost, glitch-tape,
  phantom-violet, pixel-death, riso-print, void-echo, vortex-dream)
- Inline layer rename (double-click), outside-click add-menu dismiss
- `prefers-reduced-motion` respected throughout
- **LogoGlyph** — animated navbar logo: random emoji with randomly-selected GPU
  effect variant (CRT glitch, riso, static-to-signal, phosphor bloom, pixel
  disintegration, or interactive trigger) picked on each page load

## Dev

```bash
npm install
npm run dev
```

Deploys to Vercel via `react-router build` → `build/client/`.

## Project structure

```
app/
  root.tsx                  # App shell, global nav, fonts
  routes.ts                 # Route definitions
  routes/
    home.tsx                # Landing page
    generator.tsx           # Main generator UI + state root
    examples.tsx            # Curated examples gallery
  components/
    SiteNav.tsx             # Top navigation bar (with LogoGlyph lockup)
    LogoGlyph.tsx           # Animated emoji logo (6 GPU variants)
    BottomBar.tsx           # Seed, randomize, export dropdown, presets toggle
    CanvasPreview.tsx       # Preview canvas + scroll-to-scale + CanvasHandles
    CanvasHandles.tsx       # SVG move/scale/rotate handles for selected layer
    LayerPanel.tsx          # Layer list: drag-reorder, visibility, rename, add menu
    Sidebar.tsx             # Selected layer controls + aspect strip
    PresetsPanel.tsx        # Preset save/load UI
    HeroCover.tsx           # Animated cover for the home hero
    EffectInfoPopup.tsx     # Tooltip descriptions for GPU effects
    Footer.tsx              # Site footer
  hooks/
    useDocumentRenderer.ts  # Canvas render loop: pw/ph → renderDocument → display
    usePixiRenderer.ts      # Legacy standalone GPU renderer hook
    usePresets.ts           # localStorage CRUD + thumbnail generation
    useRenderer.ts          # Legacy Canvas 2D renderer hook
  utils/
    lcg.ts                  # Seeded LCG RNG
    renderer.ts             # Full layer-stack pipeline (renderDocument)
    pixiFilters.ts          # 20+ GLSL shaders + buildFilters() pipeline
    exportCanvas.ts         # Hi-res export at ×1/×2/×3 (aspect-aware)
    exportEnvMap.ts         # 4096×2048 equirectangular export
    generateThumbnail.ts    # Full-pipeline 200×200 preset thumbnail
    randomConfig.ts         # Document randomizer (RAND button)
    effectInfo.ts           # Human-readable GPU effect descriptions + previews
    heroConfigs.ts          # Curated configs used on the home hero
    gpuRender.ts            # Off-screen GPU render utility
    logoVariants.ts         # LogoGlyph effect variant definitions
  types/
    config.ts               # All types: Layer, CanvasDocument, EffectPreset, etc.
  examples/                 # 8 curated preset JSON files
```

# Artifact

Glitch-aesthetic album cover generator. Procedural 3D primitives, emoji and
image layers, 30+ GPU shader effects, node-graph composition, seeded randomness,
aspect ratio support, and equirectangular environment map export.

## Stack

- React Router v7 (SPA mode, `ssr: false`) + TypeScript + Vite
- HTML5 Canvas 2D — base rendering pipeline
- PixiJS 7 (WebGL) — GPU shader effects per effect layer
- Three.js — 3D primitive rendering (sphere, cube, cylinder)
- React Flow — node-graph composition canvas
- XState v5 — node canvas interaction state machine
- localStorage — document persistence and preset system

## Routes

| Path        | File                   | Description                              |
| ----------- | ---------------------- | ---------------------------------------- |
| `/`         | `routes/home.tsx`      | Landing page with animated hero covers   |
| `/app`      | `routes/generator.tsx` | Main generator: canvas, layers, export   |
| `/examples` | `routes/examples.tsx`  | 8 curated presets with live previews     |

## Layer system

The generator uses a layered `CanvasDocument`. Each layer is one of eight kinds:

| Kind        | Description                                                      |
| ----------- | ---------------------------------------------------------------- |
| `emoji`     | Seeded scattered emoji field with density/size/blur              |
| `image`     | Dropped/pasted image — cover/contain/tile/free fit, alpha, blend |
| `text`      | Free-positioned text with font, size, blend, rotation            |
| `fill`      | Solid colour fill with blend mode                                |
| `effect`    | 30+ GPU shaders applied as a compositing pass                    |
| `primitive` | 3D sphere/cube/cylinder with camera, materials, lighting         |
| `noise`     | Procedural noise texture (value, clouds, cells)                  |
| `array`     | Geometric array motif (line, grid, radial)                       |

Layers render bottom-to-top (index 0 is drawn first). Effect layers are
non-destructive compositing passes: Canvas 2D effects run first, then a PixiJS
GPU pass is applied to the accumulated stack.

## Node-graph composition

In addition to the classic layer-stack view, a **node canvas** lets you wire
layers into a directed acyclic graph. Nodes:

- **Layer nodes** — one per layer, kind-specific preview and controls inline
- **Merge nodes** — blend two branches with blend mode + opacity
- **Color nodes** — contrast / brightness / saturation / hue correction
- **Export node** — the output that feeds final render and export

The node canvas owns its own interaction state machine (`nodeCanvasMachine`,
XState parallel machine). Regions: selection (idle / nodeSelected / edgeSelected)
and overlay (none / contextMenu / gallery).

## Rendering pipeline

`renderDocument(doc, W, H, imageCache)` in `app/utils/renderer.ts`:

1. Draw background colour
2. For each visible layer in order:
   - `emoji` → seeded scatter, LCG sub-seed per layer
   - `text` → Canvas 2D text with scale/rotation/blend
   - `image` → cover / contain / tile / free-fit with alpha
   - `fill` → full-canvas `fillRect` with blend mode
   - `primitive` / `noise` / `array` → Three.js offscreen render via `primitiveRenderer.ts`
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
| Overlay | Bloom, Vignette, Film Burn, Neon Glow, Sepia, Infrared, Bleach Bypass               |

All shaders use normalized UV coordinates so effects are resolution-independent.

**3D primitive rendering** (`app/utils/primitiveScene.ts`, `app/utils/primitiveRenderer.ts`)

Geometry, material, lights, shadow, and camera are defined once in
`primitiveScene.ts`. Both the live viewport (`PrimitiveViewport3D`) and the
offscreen export renderer call the same scene helper — preventing preview/export
drift.

Camera state (`PrimitiveViewportState`) is live interaction state, not stored in
the layer. It is passed alongside the document as render options so export always
matches what the user saw.

## Aspect ratio and export

Four aspect ratios: `1:1` (1000×1000), `4:5` (1080×1350), `9:16` (1080×1920),
`16:9` (1920×1080). Preview scales the longest edge to 540px. Export at ×1/×2/×3
multiplies the base dimensions.

## Seeded randomness

LCG RNG (`app/utils/lcg.ts`). Each layer gets an independent sub-seed via XOR
constants. The RAND button (`randomDocument`) generates a full document: random
aspect ratio, a seeded emoji layer, and 2–8 randomized preset-based effect
layers drawn from focused effect presets, all color-keyed to a shared base hue.

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

## Features

- Eight layer kinds: emoji, image, text, fill, effect, primitive, noise, array
- Node-graph composition with merge, color, and export nodes
- Photoshop-style layer stack: add, reorder, rename (inline), toggle visibility,
  duplicate, delete
- Drag-and-drop / paste image import (5 MB cap, broken-image guard)
- 3D primitives: sphere, cube, cylinder — drag to rotate, wheel to zoom, camera lock
- Free-fit images: move outside canvas, uniform scale via trackpad/scroll,
  independent X/Y scale sliders
- Focused effect presets: light, signal, texture, warp, tone, and print effects
  are stacked independently, each with its own controls
- Aspect ratio: 1:1 / 4:5 / 9:16 / 16:9 selector
- Export at ×1 / ×2 / ×3 as JPEG or PNG
- **Environment map export** — 4096×2048 equirectangular PNG (Blender-ready)
- Preset system: save/load/delete, GPU-accurate thumbnails, localStorage (max 20)
- 8 built-in curated presets (acid-rain, film-ghost, glitch-tape,
  phantom-violet, pixel-death, riso-print, void-echo, vortex-dream)
- `prefers-reduced-motion` respected throughout
- **LogoGlyph** — animated navbar logo: random emoji with randomly-selected GPU
  effect variant (CRT glitch, riso, static-to-signal, phosphor bloom, pixel
  disintegration, or interactive trigger) picked on each page load

## Dev

```bash
npm install
npm run dev        # favicon generation + React Router dev server
npm run build      # favicon generation + production build
npm run build:ci   # production build without regenerating favicon
npm run format     # Biome format + import organization
npm run format:check
npm run typecheck  # react-router typegen + tsc
npm run lint       # ESLint
npm test           # vitest run (all tests)
npm run check      # format check + lint + typecheck + tests
```

Deploys to Vercel via `react-router build` → `build/client/`.

## Architecture docs

| Document | Purpose |
| --- | --- |
| [`docs/state-model.md`](docs/state-model.md) | State ownership: what lives where and why |
| [`docs/rendering.md`](docs/rendering.md) | Rendering pipeline: Canvas 2D + PixiJS + Three.js |
| [`docs/node-editor.md`](docs/node-editor.md) | Node canvas interaction model and state machine |
| [`docs/app-structure-guidelines.md`](docs/app-structure-guidelines.md) | Component boundaries, state ownership, and refactor rules |
| [`docs/testing.md`](docs/testing.md) | Testing strategy: unit, render parity, GPU smoke tests |
| [`docs/improvement-plan.md`](docs/improvement-plan.md) | Phased quality checklist and exit criteria |

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
    BottomBar.tsx           # Randomize, undo/redo, share link, export, presets toggle
    CanvasPreview.tsx       # Preview canvas + scroll-to-scale + CanvasHandles
    CanvasHandles.tsx       # SVG move/scale/rotate handles for selected layer
    LayerPanel.tsx          # Layer list: drag-reorder, visibility, rename, add menu
    Sidebar.tsx             # Classic layer controls + aspect strip
    PresetsPanel.tsx        # Preset save/load UI
    HeroCover.tsx           # Animated cover for the home hero
    EffectInfoPopup.tsx     # Tooltip descriptions for GPU effects
    Footer.tsx              # Site footer
    layer-controls/
      fieldDefs.ts          # Canonical slider ranges + select options (single source of truth)
      LayerControls.tsx     # Shared inspector-style layer control renderer
    node-canvas/
      NodeCanvas.tsx        # Node graph canvas: composition of hooks + React Flow
      context.tsx           # Node canvas React contexts
      machine.ts            # XState v5 parallel interaction state machine
      constants.ts          # Shared constants (THUMB_SIZE, BLEND_OPTIONS, etc.)
      types.ts              # Node canvas TypeScript types
      hooks/
        useNodeSelectionSync.ts     # Syncs XState selection ↔ React Flow selection
        useNodeContextMenus.ts      # Right-click context menu logic
        useNodeGraphEvents.ts       # Graph mutation events (add/delete/connect)
        useNodeDragState.ts         # Node drag state and document commit
        useNodeGallery.ts           # Gallery media panel state
        usePrimitiveCameraState.ts  # Primitive camera state + lock + reset
      nodes/                # Per-kind node components
      inspector/            # Node property panels
      thumbnails/
        NodeThumbnail.tsx       # Scoped async thumbnail with content-based invalidation
        renderSignature.ts      # Per-kind render-field signatures (Phase 8)
        thumbnailQueue.ts       # Debounced per-target render queue
  hooks/
    useDocumentRenderer.ts  # Canvas render loop: pw/ph → renderDocument → display
    usePresets.ts           # localStorage CRUD + thumbnail generation
    useGeneratorDocument.ts # Document state owner: undo/redo, setDoc wrapper
    useGeneratorAssets.ts   # Image cache management
  utils/
    lcg.ts                  # Seeded LCG RNG
    renderer.ts             # Full layer-stack pipeline (renderDocument)
    pixiFilters.ts          # 30+ GLSL shaders + buildFilters() pipeline
    primitiveScene.ts       # Shared Three.js scene recipe (geometry/material/lights)
    primitiveRenderer.ts    # Offscreen Three.js render for export
    gpuRender.ts            # Off-screen PixiJS GPU render utility
    exportCanvas.ts         # Hi-res export at ×1/×2/×3 (aspect-aware)
    exportEnvMap.ts         # 4096×2048 equirectangular export
    generateThumbnail.ts    # Full-pipeline 200×200 preset thumbnail
    randomConfig.ts         # Document randomizer (RAND button)
    nodeGraph.ts            # Graph traversal helpers (collectUpstreamNodeIds, etc.)
    devLogging.ts           # Dev-only logging (thumbnail invalidation causes)
    effectInfo.ts           # Human-readable GPU effect descriptions + previews
    heroConfigs.ts          # Curated configs used on the home hero
    logoVariants.ts         # LogoGlyph effect variant definitions
  types/
    config.ts               # All types: Layer, CanvasDocument, EffectPreset, etc.
  examples/                 # 8 curated preset JSON files
  test-fixtures/
    render/                 # Render parity fixtures and Canvas 2D pixel tests
```

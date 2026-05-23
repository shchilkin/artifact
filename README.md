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
- localStorage — active document state and preset system
- IndexedDB — imported image assets, local project snapshots, and recovery drafts

## Routes

| Path        | File                   | Description                              |
| ----------- | ---------------------- | ---------------------------------------- |
| `/`         | `apps/web/app/routes/home.tsx`      | Landing page with animated hero covers   |
| `/app`      | `apps/web/app/routes/generator.tsx` | Main generator: canvas, layers, export   |
| `/examples` | `apps/web/app/routes/examples.tsx`  | Curated examples with live previews      |
| `/docs/nodes` | `routes/docs.nodes.tsx` | Task-oriented node, source, and effect docs |

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
- **Repeat nodes** — stamp any upstream branch into line, grid, or radial motifs
- **Export node** — the output that feeds final render and export
- **Graph areas** — serializable organization metadata shown as node overlays
  and layer-panel folders; areas do not change render order

The node canvas owns its own interaction state machine (`nodeCanvasMachine`,
XState parallel machine). Regions: selection (idle / nodeSelected / edgeSelected)
and overlay (none / contextMenu / gallery).

## Rendering pipeline

`renderDocument(doc, W, H, imageCache)` is exported from
`apps/web/app/utils/renderer.ts`. That file is the public facade;
implementation details live under `apps/web/app/utils/render/`.

1. Choose graph mode or stack mode. Stack mode infers a linear graph from the
   layer list so both paths share renderer semantics.
2. Draw the document background.
3. Resolve the target branch and apply visible layers, sources, and effects:
   - `emoji` → seeded scatter, LCG sub-seed per layer
   - `text` → Canvas 2D text with scale/rotation/blend
   - `image` → cover / contain / tile / free-fit with alpha
   - `fill` → full-canvas `fillRect` with blend mode
   - `primitive` → Three.js offscreen render via `primitiveRenderer.ts`
   - `noise` / `array` → Canvas procedural sources, with workerized noise where supported
   - `effect` → Canvas 2D effects and/or PixiJS WebGL filters

Pixel-like parameters scale from a 540px reference size so x1/x2/x3 exports keep
the same composition and effect density as preview.

**GPU shader passes** (`apps/web/app/utils/pixiFilters.ts`)

Canvas 2D output is blitted to a `RenderTexture`, then GLSL filters run in
order within each effect layer:

| Group   | Effects                                                                              |
| ------- | ------------------------------------------------------------------------------------ |
| Warp    | Mirror, Data Mosh, Interlace, Noise Warp, Liquid Morph, Vortex, Barrel, Chunk Tear  |
| Colour  | Pixelate, Posterize, Hue Shift, RGB Split, Duotone, Halftone, Riso Misregistration  |
| Overlay | Bloom, Vignette, Film Burn, Neon Glow, Sepia, Infrared, Bleach Bypass               |

All shaders use normalized UV coordinates so effects are resolution-independent.

**3D primitive rendering** (`apps/web/app/utils/primitiveScene.ts`,
`apps/web/app/utils/primitiveRenderer.ts`)

Geometry, material, lights, and camera are defined once in
`primitiveScene.ts`. Both the live viewport (`PrimitiveViewport3D`) and the
offscreen export renderer call the same scene helper — preventing preview/export
drift.

Committed camera state (`PrimitiveViewportState`) is stored as graph metadata
and passed alongside the document as render options. It is not written into
primitive layer tilt fields, so export always matches the node/gallery preview.

## Aspect ratio and export

Four aspect ratios: `1:1` (1000×1000), `4:5` (1080×1350), `9:16` (1080×1920),
`16:9` (1920×1080). Preview scales the longest edge to 540px. Export at ×1/×2/×3
multiplies the base dimensions.

## Seeded randomness

LCG RNG (`apps/web/app/utils/lcg.ts`). Each layer gets an independent sub-seed
via XOR constants. The RAND button (`randomDocument`) generates a full document:
random aspect ratio, a seeded emoji layer, and 2–8 randomized preset-based
effect layers drawn from focused effect presets, all color-keyed to a shared
base hue.

## Image persistence

### Current (SPA, no server)

| Method | Where stored | Shareable |
| --- | --- | --- |
| Download (JPEG/PNG) | User's disk | Via file sharing |
| Active document | localStorage | No |
| Presets | localStorage | No |
| Imported image payloads | IndexedDB asset records | Hydrated into `.artifact.json` or share links when possible |
| Local projects and recovery drafts | IndexedDB project records | No |
| `.artifact.json` | User's disk | Yes, via file sharing |
| `?doc=` share links | URL query string | Yes, but large hydrated images can make links heavy |

The `CanvasDocument` JSON is the canonical source of truth. Image layers keep a
serializable `src`; local imports are migrated to `artifact-asset://...`
references when possible so active localStorage documents stay small.

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
- Node-graph composition with merge, color, repeat, and export nodes, plus
  graph-area organization overlays
- Photoshop-style layer stack: add, reorder, rename (inline), toggle visibility,
  duplicate, delete
- Drag-and-drop / paste image import with downscaling and IndexedDB asset storage
- 3D primitives: sphere, cube, cylinder — drag to rotate, wheel to zoom, camera lock
- Free-fit images: move outside canvas, uniform scale via trackpad/scroll,
  independent X/Y scale sliders
- Focused effect presets: light, signal, texture, warp, tone, and print effects
  are stacked independently, each with its own controls
- Aspect ratio: 1:1 / 4:5 / 9:16 / 16:9 selector
- Export at ×1 / ×2 / ×3 as JPEG or PNG
- Save/open full editable documents as `.artifact.json`
- **Environment map export** — 4096×2048 equirectangular PNG (Blender-ready)
- Preset system: save/load/delete, renderer-backed thumbnails, localStorage (max 20)
- Local project library with IndexedDB snapshots and thumbnails
- Curated example documents, including graph-first examples and layer-first
  starter recipes
- `prefers-reduced-motion` respected throughout
- **LogoGlyph** — animated navbar logo: random emoji with randomly-selected GPU
  effect variant (CRT glitch, riso, static-to-signal, phosphor bloom, pixel
  disintegration, or interactive trigger) picked on each page load

## Dev

```bash
npm install
npm run dev        # React Router dev server for @artifact/web
npm run build      # production build
npm run build:ci   # CI alias for production build
npm run favicon    # optional local bitmap favicon generation
npm run format     # Biome format + import organization
npm run format:check
npm run typecheck  # react-router typegen + tsc
npm run lint       # ESLint
npm test           # web Vitest suite
npm run test:api   # API Vitest suite
npm run test:browser:install # install Playwright Chromium once
npm run test:browser # focused browser/WebGL smoke tests
npm run perf:node-editor # opt-in node editor performance benchmark
npm run check      # format check + lint + web/API typecheck + web/API tests
```

Deploys to Vercel from the repo root via the `@artifact/web` workspace:
`react-router build` → `apps/web/build/client/`.

`apps/web/public/favicon.svg` is the committed production favicon.
`apps/web/public/favicon.png` is an optional generated local bitmap and remains
ignored.

## Architecture docs

| Document | Purpose |
| --- | --- |
| [`docs/state-model.md`](docs/state-model.md) | State ownership: what lives where and why |
| [`docs/rendering.md`](docs/rendering.md) | Rendering pipeline: Canvas 2D + PixiJS + Three.js |
| [`docs/node-editor.md`](docs/node-editor.md) | Node canvas interaction model and state machine |
| [`docs/app-structure-guidelines.md`](docs/app-structure-guidelines.md) | Component boundaries, state ownership, and refactor rules |
| [`docs/effect-development.md`](docs/effect-development.md) | Checklist for effect controls, metadata, renderer, and docs |
| [`docs/testing.md`](docs/testing.md) | Testing strategy: unit, render parity, GPU smoke tests |
| [`docs/performance.md`](docs/performance.md) | Node-editor benchmark workflow and render performance notes |
| [`docs/improvement-plan.md`](docs/improvement-plan.md) | Phased quality checklist and exit criteria |
| [`docs/roadmap.md`](docs/roadmap.md) | Product and architecture roadmap |
| [`docs/version-plans/v0.11.md`](docs/version-plans/v0.11.md) | v0.11 layer workflow and onboarding acceptance plan |
| [`docs/version-plans/v0.12.md`](docs/version-plans/v0.12.md) | v0.12 examples, recipes, docs, and effect coverage acceptance plan |
| [`docs/version-plans/v0.13.md`](docs/version-plans/v0.13.md) | v0.13 AI generation research and architecture acceptance plan |
| [`docs/version-plans/v0.13-backend-contract.md`](docs/version-plans/v0.13-backend-contract.md) | v0.13 VPS backend API, schema, queue, and storage contract |
| [`docs/version-plans/v0.14.md`](docs/version-plans/v0.14.md) | v0.14 editor beta, layer workflow, onboarding, and local-first reliability acceptance plan |
| [`docs/production-readiness.md`](docs/production-readiness.md) | Release gate, manual QA checklist, and feature intake split |

## Project structure

```
apps/
  api/                       # VPS backend scaffold for v0.13 AI generation
    src/
      contracts.ts           # Endpoint paths and backend-facing contract types
      config.ts              # Environment parsing
      server.ts              # API process entry point
      worker.ts              # Worker process entry point
      db/                    # Future migrations/repositories
      providers/             # Future OpenAI/xAI/mock adapters
      storage/               # Future file/object storage adapters
  web/                       # Vercel React Router app workspace
    app/
      root.tsx               # App shell, global nav, fonts
      routes.ts              # Route definitions
      routes/                # Landing, generator, examples, node docs
      components/            # UI and feature components
      hooks/                 # Web app orchestration hooks
      utils/                 # Renderer, graph helpers, persistence, export
      types/                 # CanvasDocument, Layer, graph, factory types
      test-fixtures/         # Render parity fixtures and Canvas 2D pixel tests
    public/                  # Deployed static assets
packages/
  shared/                    # Browser/server-neutral API contract types
```

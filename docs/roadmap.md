# Artifact Codebase Overview and Roadmap

For the step-by-step implementation plan, see [`improvement-plan.md`](./improvement-plan.md).

Related architecture docs:

- [`state-model.md`](./state-model.md)
- [`rendering.md`](./rendering.md)
- [`node-editor.md`](./node-editor.md)
- [`style-guide.md`](./style-guide.md)
- [`editor-design-system.md`](./editor-design-system.md)
- [`app-structure-guidelines.md`](./app-structure-guidelines.md)
- [`effect-development.md`](./effect-development.md)
- [`testing.md`](./testing.md)
- [`improvement-plan.md`](./improvement-plan.md)
- [`version-planning.md`](./version-planning.md)
- [`production-readiness.md`](./production-readiness.md)
- [`monorepo-turborepo-container-plan.md`](./monorepo-turborepo-container-plan.md)

Current planning status:

- v0.39 has reached release-candidate prep as the Account Cloud Saves And
  Production Auth release: Better Auth replaces Clerk, account-backed cloud
  projects ship, large project assets sync separately from project manifests,
  password recovery is available, production API deploys run migrations and
  healthchecks, Vercel preview origins are supported, and Projects shows clearer
  sync status. See [`version-plans/v0.39.md`](./version-plans/v0.39.md) and
  [`releases/v0.39.0.md`](./releases/v0.39.0.md).
- v0.38 has reached release-candidate prep as the Editor UX, Import Safety, And
  Visual Identity release: editor chrome, Layers/Nodes workflow polish,
  responsive bottom actions, artifact-file replacement safeguards, drag/drop
  import clarity, local project action clarity, visual identity refresh, and
  the already-merged Bad Stream effect node follow-up from PR #79. See
  [`version-plans/v0.38.md`](./version-plans/v0.38.md) and
  [`releases/v0.38.0.md`](./releases/v0.38.0.md).
- v0.37 has completed the 3D Material Nodes release:
  one PBR Material graph node, explicit material and texture-map ports,
  material/environment inputs for 3D primitives and scenes, multiple resource
  drops, and preview/export parity for connected material workflows. See
  [`version-plans/v0.37.md`](./version-plans/v0.37.md) and
  [`releases/v0.37.0.md`](./releases/v0.37.0.md).
- v0.36 has completed the 3D Model Sources And Retro Game Effects release:
  browser model/environment assets, 3D Scene rendering, Layers/Nodes semantics
  for model inputs, and focused retro finishing effects.
- v0.33 has completed the Storage UX And Capability Hardening release scope:
  local workspace state is visible, recovery and storage details are
  discoverable, Presets was folded into Projects, and the conservative PWA
  shell is available without changing document schema, renderer/export
  semantics, graph traversal, AI scope, server sharing, or account model.
- v0.32 has completed the Code Health And Debt Reduction release scope: the
  v0.31 changed-code Fallow gate remains clean, full-health complexity is
  reduced to zero functions above threshold, hook-dependency warnings are
  fixed, the `node-canvas.css` / Tailwind boundary is documented, and
  storage/render risks are recorded without pulling product work into the
  release.
- The next version scope after v0.39 should start from the deferred product
  tracks below, especially sharing permissions, S3-compatible asset storage,
  project history/versioning, public-surface polish, or a dedicated CI-policy
  pass if full-health complexity should become a permanent strict release gate.
- The v0.31/v0.32 cleanup backlog is intentionally trace-gated future work. It
  should not be treated as hidden scope for landing work, Showcase / How-to
  work, command palette, server-backed sharing, or renderer/persistence
  behavior changes.
- New version scopes should be split using
  [`version-planning.md`](./version-planning.md): one release thesis, one
  primary blast radius, explicit non-goals, checkable acceptance criteria, and a
  clear discovery-versus-release boundary.

Next deferred product tracks:

- 3D Material Nodes follow-up work remains focused on deeper material authoring:
  map scale/rotation, richer example packs, broader browser WebGL coverage, and
  external HDRI/material marketplace flows after the v0.37 PBR node settles.
- Asset Library / Export History / Versions remains deferred until v0.33 makes
  the local storage and recovery states visible enough to build on safely.
- Project Autosave History remains deferred until the v0.34 Projects page and
  active save model settle. The future autosave pass should distinguish active
  project saves, automatic recovery points, and user-created copies without
  making recovery cards compete with saved projects.
- Project Versions / Restore / Compare remains deferred until explicit project
  editing and the local Projects page have enough usage signal to design the
  history model.
- Server-backed Share Links remains deferred until local asset/project cleanup,
  quota pressure, project-size behavior, and account ownership rules are
  clearer after the first private cloud-save release.
- Landing refresh remains deferred until it has its own focused plan and
  critique/prototype gate.
- Whole-app design polish is split: v0.38 pulls the editor-first chrome,
  import, Layers/Nodes, local project action, and visual identity polish into a
  bounded release; public pages, docs, Showcase, and a broader brand/site
  refresh remain future scope with their own critique/prototype gate.
- Showcase / How-to split remains deferred until the showcase wall and docs
  bridge need a dedicated learning surface.

Planned next:

- The next version scope should be selected from the deferred product tracks
  below after v0.39 release feedback, with a likely split between public share
  links and ownership/security, S3-compatible cloud asset storage, project
  history/versioning, landing refresh, or CI-policy work.

Recently shipped:

- [`version-plans/v0.39.md`](./version-plans/v0.39.md) — Account Cloud Saves
  And Production Auth: Better Auth account flow, password recovery, cloud
  project saves, separate cloud asset upload/reassembly for large projects,
  Coolify/Vercel production API hardening, migrations on startup, backend
  healthchecks, and clearer Projects sync status. Release notes are in
  [`releases/v0.39.0.md`](./releases/v0.39.0.md).

- [`version-plans/v0.38.md`](./version-plans/v0.38.md) — Editor UX, Import
  Safety, And Visual Identity: focused editor chrome, Layers/Nodes workflow
  polish, responsive bottom actions, artifact-file replacement safeguards,
  drag/drop import clarity, local project action clarity, visual identity
  refresh, and PR #79's Bad Stream effect node follow-up. Release notes are in
  [`releases/v0.38.0.md`](./releases/v0.38.0.md).

- [`version-plans/v0.37.md`](./version-plans/v0.37.md) — 3D Material Nodes:
  one PBR Material graph node with scalar controls and texture-map inputs,
  explicit material/environment ports for 3D primitives and scenes, material
  previews, connected material render signatures, model/primitive scene
  material rendering, multiple resource drops, and focused unit/render/browser
  coverage for material graph workflows. Release notes are in
  [`releases/v0.37.0.md`](./releases/v0.37.0.md).
- [`version-plans/v0.36.md`](./version-plans/v0.36.md) — 3D Model Sources And
  Retro Game Effects: browser `.glb` model import, model/environment asset
  persistence, `3D Model`, `Environment Map`, and `3D Scene` node workflows,
  Layers-mode `3D Scene` target semantics, scene lighting/environment controls,
  model preview auto-spin, graph/export parity, fallback nodes for unsupported
  graph records, and focused retro effects including Retro Resolution, Indexed
  Palette, Dot Grain, Alpha Crush, and Silhouette Crush. Release notes are in
  [`releases/v0.36.0.md`](./releases/v0.36.0.md).
- [`version-plans/v0.35.md`](./version-plans/v0.35.md) — Masks, Transforms,
  Rotated Repeats, And Line Fields: Mask, Transform, and Grime Shadow graph
  utility nodes, Line Field source layers, deterministic Repeat per-copy
  rotation, starter recipes, Add Library search/docs updates, and renderer,
  thumbnail, gallery, and export parity for the new graph/source nodes.
  Release notes are in [`releases/v0.35.0.md`](./releases/v0.35.0.md).
- [`version-plans/v0.34.md`](./version-plans/v0.34.md) — Active Project Save
  Model: Projects became explicit local editable projects instead of
  snapshot-only saves, `Save Project` now overwrites the bound local project,
  contextual `Copy` creates a separate active branch, `/projects` became a
  first-class local workspace page, project thumbnails were improved, and the
  release flow gained machine-checked metadata plus a manual production
  workflow for the future `main` branch. Release notes are in
  [`releases/v0.34.0.md`](./releases/v0.34.0.md).
- [`version-plans/v0.33.md`](./version-plans/v0.33.md) — Storage UX And
  Capability Hardening: Projects became the single local workspace surface,
  storage diagnostics moved behind details, recovery and browser capability
  states became visible, the first conservative PWA app shell shipped, and the
  release gate gained a fresh-server browser command. Active project binding
  remained deferred out of v0.33 and is now tracked in
  [`version-plans/v0.34.md`](./version-plans/v0.34.md). Release notes are in
  [`releases/v0.33.0.md`](./releases/v0.33.0.md).
- [`version-plans/v0.32.md`](./version-plans/v0.32.md) — Code Health And Debt
  Reduction: v0.32 package metadata, generator-to-editor route-shell rename
  while keeping `/app` stable, Fallow duplication and full-health complexity
  reduced to zero without suppressions or CI threshold weakening, React hook
  warning cleanup, Tailwind/CSS boundary documentation, roadmap/release hygiene,
  and storage/render risk triage. Product features, renderer, graph traversal,
  export, persistence schema, package export, AI scope, and font-policy work
  were explicitly deferred out of v0.32. Release notes are in
  [`releases/v0.32.0.md`](./releases/v0.32.0.md).
- [`version-plans/v0.31.md`](./version-plans/v0.31.md) — Code Quality and
  Fallow Integration: read-only Fallow package scripts, blocking PR
  changed-code audit, baseline/backlog documentation, agent-safe JSON command
  guidance, release hygiene updates, and a trace-validated Fallow cleanup pass
  that reduced duplicated lines and clone groups to zero. Released as
  `v0.31.0` with final cleanup patch `v0.31.1`; release notes are in
  [`releases/v0.31.0.md`](./releases/v0.31.0.md) and
  [`releases/v0.31.1.md`](./releases/v0.31.1.md). Product features,
  dynamic OG generation, full-health complexity gating, renderer, graph
  traversal, export,
  persistence, document schema, package export, AI scope, and font-policy work
  were explicitly deferred out of v0.31.
- [`version-plans/v0.30.md`](./version-plans/v0.30.md) — Editor Visual
  Baseline and Design System: curated browser visual baseline, internal
  `/docs/style-guide`, editor design-system docs, source-owned shared
  primitives, low-risk primitive extraction, effect local seed offsets, and
  node alignment guides. Released as `v0.30.0`; release notes are in
  [`releases/v0.30.0.md`](./releases/v0.30.0.md). Landing, Showcase / How-to,
  Fallow, server-backed sharing, and command-palette work were explicitly
  deferred out of v0.30.
- [`ui-overhaul.md`](./ui-overhaul.md) — Editor UI Overhaul Tracker: active
  product/design backlog for node canvas readability, category-color grammar,
  inspector usability, Add Node / Library command-palette direction,
  Layers/Nodes parity, empty starts, and visual QA contracts. Use this as the
  tracking document for iterative editor UI improvements that are broader than
  a single version-plan patch but still need concrete acceptance criteria.
- [`version-plans/v0.29.md`](./version-plans/v0.29.md) — Product Surface
  Recovery: terminology, docs, showcase, public navigation, shared UI
  primitives, and focused browser coverage. Released as `v0.29.0`; release
  notes are in [`releases/v0.29.0.md`](./releases/v0.29.0.md). Landing refresh
  was explicitly deferred out of v0.29.
- [`version-plans/v0.28.md`](./version-plans/v0.28.md) — Editor Guardrails v2:
  layer-backed lock policy, shared guardrail helpers, target breadcrumbs,
  area/output-path context, and Layers/Nodes properties parity. Released as
  `v0.28.0`; release notes are in
  [`releases/v0.28.0.md`](./releases/v0.28.0.md).
- [`version-plans/v0.27.md`](./version-plans/v0.27.md) — Editor Confidence And
  Coverage: shared selected-target summaries in Layers and Nodes, source/effect
  and output-path status, soft lock guardrails, and repeatable Vitest coverage
  baseline. Released as the cumulative `v0.27.0` editor release; release notes
  are in [`releases/v0.27.0.md`](./releases/v0.27.0.md).
- [`version-plans/v0.26.md`](./version-plans/v0.26.md) — Layer Mode Polish:
  Layers Add Library previews, empty starts, layer-state readability, and layer
  reorder syncing with the graph-backed document order. Rolled into the
  cumulative `v0.27.0` release instead of being separately tagged.
- [`version-plans/v0.25.md`](./version-plans/v0.25.md) — Typography Library v3
  & Font Policy: Google Fonts import, source/license metadata, license-aware
  editable project packages, and explicit all-font package export without
  changing raster export or render semantics. Released as `v0.25.0`; release
  notes are in [`releases/v0.25.0.md`](./releases/v0.25.0.md).
- [`version-plans/v0.24.md`](./version-plans/v0.24.md) — Project Package &
  Font Export Policy: safer editable `.artifact` project packages for large
  assets and imported font metadata while keeping raster artwork export
  pixel-only. Released as `v0.24.0`; release notes are in
  [`releases/v0.24.0.md`](./releases/v0.24.0.md).
- [`version-plans/v0.23.md`](./version-plans/v0.23.md) — Graph Add Library
  Drag: drag Add Library items onto useful graph insertion targets, especially
  edges, while preserving graph traversal, render/export semantics, thumbnail
  scheduling, and document schema. Released as `v0.23.0`; release notes are in
  [`releases/v0.23.0.md`](./releases/v0.23.0.md).
- [`version-plans/v0.22.md`](./version-plans/v0.22.md) — Project & Asset
  Robustness: portable document integrity, imported image/font dependency
  inventory, missing asset fallbacks, save/open/share/export confidence, and
  local-first project boundaries without changing graph traversal or render
  semantics. Released as `v0.22.0`; release notes are in
  [`releases/v0.22.0.md`](./releases/v0.22.0.md).
- [`version-plans/v0.21.md`](./version-plans/v0.21.md) — Font Import /
  Typography Library v2: local font import, imported font persistence, Font
  Library integration, Layers/Nodes parity, and portable/fallback-safe
  `.artifact.json` behavior. Released as `v0.21.0`; release notes are in
  [`releases/v0.21.0.md`](./releases/v0.21.0.md).
- [`version-plans/v0.20.md`](./version-plans/v0.20.md) — Text Workflow v1:
  typography starts, better font browsing, clearer text controls, multi-font
  cover workflows, and Layers/Nodes parity. Released as `v0.20.0`; release
  notes are in [`releases/v0.20.0.md`](./releases/v0.20.0.md).
- [`version-plans/v0.19.md`](./version-plans/v0.19.md) — Node Graph Usability:
  active output-path readability, selected-node clarity, graph navigation, and
  continued Layers/Nodes parity without changing document or render semantics.
  Released as `v0.19.0`.
- [`version-plans/v0.18.md`](./version-plans/v0.18.md) — Add Library workflow:
  category browsing, local favorites, stronger menu navigation, use-case tags,
  intent-aware search, and continued Layers/Nodes parity. Released as
  `v0.18.0`.
- [`version-plans/v0.17.md`](./version-plans/v0.17.md) — editor creative
  controls, shared Add Library, useful texture/print ranges, Pixelate as a
  focused low-resolution workflow, and renderer-backed menu previews. Released
  as `v0.17.0`.

Next strong candidates after v0.39:

- **3D Scene Polish, Palettes, And Dither Variants** — build on the v0.36 model
  foundation with named old-game palettes, richer deterministic dither
  families, optional PS1-style material/texture wobble, curated model-source
  recipes, and deeper Model/Scene docs.
- **3D Material Authoring Follow-Up** — build on v0.37 with material map
  scale/rotation, channel packing, richer material examples, and broader WebGL
  coverage after the first PBR node settles.
- **Shader Fills And Shader Effects** — keep shader work aligned with the
  single-purpose node contract. Shader Fill nodes generate standalone raster
  texture sources. Effect nodes own input-dependent shader-style transforms.
  Material nodes describe PBR surface parameters, and scene nodes own 3D
  lighting/camera composition.

  Figma Shaders parity should stay split by dependency:

  | Track | Covered or near-covered | Missing / follow-up |
  | --- | --- | --- |
  | Shader Fills | mesh gradient, moire, concentric patterns, water caustic, glowing wave, clouds/fractal noise via noise fields, nebula-like smoke/noise, pattern grids via dot grids | stronger named Clouds/Fractal/Nebula/Pattern Grid presets |
  | Shader Effects | bloom, dither, halftone, pixelate, gradient map, channel mixer, bokeh blur, hatching, pattern refraction, pixel stretch, gooey merge, lens/warp families, colored-edge/outline building blocks, slice-shift-like glitch/tear effects, AI Shader Pass as a prompt-created input-dependent pass | deeper preset tuning and visual examples |
  | Material Bridge | shader fill output can feed material texture-map inputs and primitive material inputs | polish texture-map controls, examples, export/browser parity coverage |
  | AI Custom Shaders | prompt-ready `AI Shader Pass` node requests OpenAI-backed validated `customSpec` JSON by default, offers deterministic local fallback only after explicit user choice, stores source provenance, and processes a connected source/backdrop through procedural plus source-aware operations such as source luminance, edge glow, chromatic shift, and gradient-map tinting; unconnected or empty AI passes render transparent | generation history, cost/accounting, richer spec editor controls, possible future AI Shader Fill if standalone generation becomes a separate node |
  | Code Shaders | `Code Shader` node stores a GLSL fragment body, wraps it with stable backdrop/resolution/seed/strength uniforms, and renders as standalone fill or backdrop pass with deterministic fallback when WebGL/compile fails | compile diagnostics in the node UI, richer uniform controls, safer authoring affordances, prompt-to-code generation |

  Tileless/seamless texture generation remains a future Shader Fill track for
  repeatable material maps. Rich custom GLSL/WGSL code editing remains an
  advanced track beyond the current MVP because it needs better compilation
  diagnostics, uniform editing, and sandboxing affordances. Prompt-to-shader
  generation should target validated specs first. Shader animation is deferred: before adding it back, define whether animation belongs in shader nodes, effect nodes, a reusable control node, or export settings; then set performance budgets for live thumbnails, graph preview caches, and eventual video/sequence export.
- **History Performance And Undo Memory Budget** — keep undo/redo responsive as
  node documents, 3D scene state, and local project payloads grow. Confirm the
  immutable document-update contract with tests, avoid unnecessary deep clones
  in history entries where old document references are safe, add a serialized
  history memory budget on top of the count limit, and evaluate patch/checkpoint
  history for high-frequency edits such as sliders, transforms, graph movement,
  and primitive/3D camera state.
- **Project Autosave History** — add visible automatic save points for the
  active project so recovery, autosave, explicit save, and copy/branch behavior
  are clearly separated.
- **Server-backed Share Links And Ownership** — build on v0.39 private cloud
  projects with explicit sharing permissions, link tokens, ownership rules, and
  security tests before public project links become available.
- **Cloud Asset Storage Follow-Up** — v0.39 ships initial local-volume cloud
  asset sync. Follow-up scope remains upload progress, cross-project asset
  deduplication, quota/cleanup policy, S3-compatible object storage, and richer
  oversized-project recovery states.
- **Reference Intelligence And Cover Discovery** — add a Cosmos/mymind-style
  reference browser for existing cover art, backed by a TypeScript reference
  catalog in the API workspace. The first slice should index MusicBrainz/Cover
  Art Archive metadata into Postgres, expose fast search and saved references,
  and keep reference images outside `CanvasDocument`; later slices can add
  pgvector-based semantic search, palette/visual features, and AI chat tools
  that suggest references from user requests.
- **Font Catalog And Account Sync** — add deeper font discovery, saved font
  sets, and account-backed font/project continuity after the local font policy
  has been proven in release.
- **Command Palette / Add Library Command Improvements** — make repeated editor
  actions faster once visual regression coverage protects the main editor
  states.
- **How-To / Recipes** — split task-oriented learning from Showcase after the
  editor baseline is stable enough to support recipe screenshots and examples.
- **Asset Library, Export History, And Versions** — design reusable local
  sources, generated outputs, cutouts, exported artwork, named creative
  snapshots, and restore/compare flows before cloud sync makes the local data
  model harder to migrate.
- **Whole-App Brand And Public Surface Refresh** — run a dedicated
  critique/prototype pass across public routes, docs, Showcase, account
  surfaces, and shared primitives after v0.39 lands the account/cloud-save core.

## Product summary

Artifact is a browser-based, local-first creative editor for indie musicians and
designers who want direct control over covers, posters, type compositions,
textures, effects, and export-ready artwork. It starts with album covers, but
the broader direction includes posters, music visuals, and eventually portfolio
or case-study pages for music/design projects. The interface is intentionally
print-like and low-chrome: warm dark UI, mono labels, square edges, seeded
randomness, layer composition, node editing, portable projects, and
export-ready artwork.

The core promise is simple: a user should be able to build a visual from layers
and nodes, preview it accurately, then export the same image at production
resolution and the selected aspect ratio.

Layers and nodes have different jobs:

- **Layers** are for fast work: quick stacking, reordering, visibility, simple
  edits, and rapid composition.
- **Nodes** are for advanced work: branching, merges, source/effect chains,
  reusable procedural structure, and explicit output control.

Both views must stay truthful. If nodes define a meaningful structure, the
layer view should respect that structure through folders, areas, or
graph-derived grouping instead of becoming a misleading flat stack.

The organization track now has serializable graph area metadata in
`CanvasGraph.areas`, node-canvas area overlays, and layer-panel folder rows.
Areas are organizational only for now; they do not change render order or
traversal until a dedicated render behavior is designed.

## Feature Intake From Sticky Notes

The sticky-note backlog is useful, but it should not all enter the current
release. Treat it as product discovery and split it by implementation surface.

### Editor Features

These can mostly stay browser-only and fit the current architecture:

- Layer folders/groups and graph areas for organizing dense stacks and advanced
  node graphs.
- Layer view that can respect node graph structure instead of only showing a
  flat stack.
- Low-resolution / pixelate whole-image node that respects the current aspect
  ratio and export scale.
- More procedural texture/noise nodes with presets.
- More primitive shapes, SVG-like primitives, and 3D sketch primitives.
- More focused effect nodes and shader-style sources with stronger controls,
  split by role instead of folded into multi-purpose nodes.
- Font import, improved font browsing, and possible external font catalog
  support.
- Better text workflow, including typography presets, multi-font work, and text
  effect chains.
- Asset library for uploaded images, generated images, cutouts, reusable
  textures, and exported outputs.
- Export presets for music and social targets, including transparent PNG,
  poster/print sizes, and export history.
- Project versions, named creative snapshots, and active project save/overwrite
  behavior for trying risky edits without losing a direction.
- Better drag/repositioning UX for canvas content.
- Image background removal workflow for uploaded images, with a future research
  pass comparing browser-side models, server-side/VPS processing, external APIs,
  and hybrid approaches.
- Dark/light theme mode.
- Improved empty-canvas onboarding.
- Autosave, recovery, quota-pressure, project-size, cleanup, and unused-asset
  deletion UX for local projects and imported assets.
- Browser capability warnings and recovery guidance for unsupported WebGL,
  storage, or file APIs.
- Downloadable project packages with a custom extension for local ownership,
  offline work, backup, and eventual PWA file handling.
- Large-project/share flow that moves heavy imported image/font payloads out of
  URL query strings and into either portable project bundles or server-backed
  share records.
- License-aware font packaging for portable projects: keep raster artwork
  export separate from font-file distribution, store font license metadata where
  available, include allowlisted open fonts with notices, and require explicit
  user confirmation before bundling unknown imported font files.
- Voice/music visualizer node using browser audio input or uploaded audio.
- Physics/animation-style effects where the final export remains deterministic.
- Improved localization/i18n structure.

Recent sequencing note: `v0.29` made the product surface catch up to the
editor through a focused recovery pass: Artifact now reads as a local-first
creative editor, not a style generator, not an output-style generator, and not
an internal WIP board. The release stabilized terminology, split showcase from
how-to/workflow teaching, kept showcase as a curated plus random
made-in-Artifact gallery, made docs more useful for current reference material,
and added small browser confidence coverage. Landing refresh is deferred to a
dedicated future pass instead of being a hidden blocker. Catalog API keys,
account-synced font sets, command-palette entry, server-backed sharing, and
deeper backend work remain preserved as follow-up candidates so each release can
stay coherent and low-risk.

### UI System And Primitive Libraries

Tailwind is already available in the web app and should be the first-choice
tool for simple layout and responsive composition. It should not replace
Artifact's design system, feature CSS, or editor-specific tokens. Reusable UI
should move toward shared product primitives under
`apps/web/app/components/ui/*` when the same behavior and visual contract appear
on multiple surfaces.

shadcn/ui is a possible source-owned primitive layer, not a visual direction.
The useful adoption path is to import one primitive at a time, rewrite it to
Artifact tokens and square mono styling, then validate keyboard, focus, mobile,
and browser behavior before adding another.

Best shadcn candidates and current adoption:

- **Command** for a future command palette and possible Add Library
  improvements. The current Add Library already behaves like a creative command
  surface, so a command primitive could help with keyboard navigation and
  search ergonomics if the product keeps expanding the catalog.
- **Dialog / Sheet** now backs Projects, Add Library mobile behavior, and the
  node gallery; keep using it for future import/export flows where
  focus trapping and close behavior matter.
- **Floating menu / Popover** now backs effect info, layer context menus, node
  context menus, and desktop Add Library placement. Use this pattern for short
  anchored surfaces that should dismiss predictably without custom document
  listeners.
- **Tabs** now backs the Layers/Nodes switcher and remains a good fit for
  future docs/how-to splits or panel switching when native route navigation is
  not the right model.
- **Select** only if native select or the current inspector select stops being
  enough. Most inspector controls should stay compact and CSS-first until
  custom select behavior is clearly needed.

Poor shadcn candidates:

- **Button** as a default import. Public CTAs already use `ActionButton` /
  `ActionLink`, and editor controls need Artifact-specific pressed, selected,
  disabled, and focus states.
- **Card** as a layout default. Artifact avoids generic card-heavy composition;
  repeated items should use product-specific frames only when the frame carries
  meaning.
- Any default shadcn visual styling. It must be treated as implementation
  scaffolding, not as product identity.

### Content And Learning

These make the product easier to understand and market:

- A landing page that sells the real editor: Layers, Nodes, typography, effects,
  local projects, packages, and export rather than only showing final outputs.
- Product-proof visuals that use editor fragments, graph snippets, effect
  chains, type specimens, package cards, and showcase work instead of
  decorative SaaS imagery.
- Better user-facing node/effect documentation.
- Showcase projects and tutorial presets.
- Showcase / How-to split: keep `/showcase` as an infinite wall of work made in
  Artifact, and create a future how-to / recipes surface for task-oriented
  workflows such as "make a type cover" or "build a print texture".
- Public editor CTAs should open a blank canvas by default. Showcase tiles are
  the entry point for opening existing editable projects.
- Showcase filters remain a future affordance, added only when the wall has
  enough volume to benefit from them.
- Showcase sources: curated work first, seeded random work second, and future
  agent-generated work only after a reviewed pipeline can produce editable
  projects safely.
- Random Showcase v2: move random generation from one generic poster recipe to
  multiple archetypes. The first slice covers image-backed poster, type-only
  poster, texture/source study, and texture/effect stack; node-ready composition,
  richer text packs, and a bundled source-image library remain follow-ups.
- Mood/style preset folders.
- Procedural texture preset folders.
- Project/case-study pages for the Artifact portfolio.
- Future how-to / recipes pages explaining how covers were made.
- Reference browser for existing cover-art inspiration: searchable
  Cosmos/mymind-style visual grid, saved reference shelves or collections, clear
  source links, and no default import of third-party covers into artwork.

### Platform / Full-Stack Candidates

These likely need a VPS/backend, database, object storage, auth, or billing:

- Accounts.
- CI-built container images for VPS/Coolify deploys: build and tag service
  images in GitHub PR/CI, push them to a registry, then make the VPS deploy pull
  already-built images instead of running long multi-service Docker builds on
  the deploy host. The concrete target is GHCR images for `artifact-api`,
  `artifact-worker`, and `artifact-bull-board`, deployed in Coolify by immutable
  `sha-<shortsha>` tags or digests with `latest` disabled.
- Monorepo/Turborepo infrastructure migration for workspace-aware validation,
  shared API contracts, dedicated backend containers, and pull-only Coolify/VPS
  deploys. Detailed plan:
  [`monorepo-turborepo-container-plan.md`](./monorepo-turborepo-container-plan.md).
- Server-side project saving.
- Server-backed share links.
- Preset database and community preset browsing.
- User galleries or portfolio pages.
- Subscription/paywall experiments.
- AI image generation node or workflow, including prompt presets, variants,
  generated asset storage, quota/cost tracking, and generation history.
- AI safety and usage policy work for licensing, usage rights, moderation,
  prompt privacy, abuse controls, cost/credit visibility before submission, and
  provider fallback behavior.
- Image background removal service if browser-side quality, bundle size, or
  performance tradeoffs are not acceptable.
- Server-side asset storage for large uploads on the existing local Coolify
  volume, with S3-compatible object storage still deferred.
- Server-side asset library for originals, generated assets, cutouts, exported
  outputs, and future local-to-cloud sync.
- Cloud project asset sync: upload project assets separately from `doc_json`,
  store only stable cloud references in saved project records, and hydrate/cache
  those assets back into local IndexedDB when a cloud project opens. Next pass:
  progress UI, quota/cleanup rules, and optional S3-compatible storage.
- Reference catalog and cover discovery: build a TypeScript-first backend
  subsystem that imports MusicBrainz and Cover Art Archive dumps into Postgres,
  exposes `/api/references/search` and saved-reference endpoints, and treats
  covers as reference material rather than editable document assets by default.
- Reference vector search: add pgvector-backed embeddings for reference covers,
  starting with text/metadata embeddings and hybrid full-text/vector ranking,
  then expanding to image or multimodal embeddings, palette features, and "more
  like this" recommendations after the base catalog proves useful.
- AI chat with reference tools: design chat as a separate backend layer that can
  call typed tools such as reference search, saved-reference lookup, and current
  project summaries. The chat should use the reference catalog to suggest
  directions from user requests without baking reference data into the model or
  into `CanvasDocument`.
- Share modes beyond basic links: read-only share, remix/fork share,
  export-only share, and later collaboration modes.
- Team/project collaboration.
- Portfolio/case-study publishing.

Near-term rule: ship a reliable local editor first. Full-stack work becomes
much cheaper after the document schema, asset strategy, and export behavior are
stable.

### Codebase Quality And Agent Workflows

Fallow is now available as a codebase-intelligence layer. The v0.31 baseline
lives in [`fallow-v0.31-baseline.md`](./fallow-v0.31-baseline.md), and the
v0.32 health review lives in
[`fallow-v0.32-health.md`](./fallow-v0.32-health.md). Changed-code debt is
blocked in CI, while v0.32 reduced the full-health complexity report to zero
functions above threshold. Fallow supports three workflows:

- **Local**: scripts for dead-code, duplication, health, dependency, and
  changed-code audit reports. Initial usage should be read-only; auto-fix should
  require an explicit dry run and focused review.
- **CI**: a blocking `fallow audit --base <base>` gate for changed files. Any
  stricter whole-repo fail mode should have an explicit threshold and
  suppression policy before becoming a standing release gate.
- **Agents**: update agent guidance so Codex uses Fallow for cleanup
  opportunities, duplicated UI/component code, complexity hotspots, dependency
  placement, and architecture-boundary checks. Fallow security output should be
  treated as unverified candidates that require downstream validation, not as a
  confirmed vulnerability verdict.

Do not make full-health Fallow complexity a permanent strict release gate until
threshold ownership, suppression rules, and CI behavior are documented.

## Current architecture

### Application shell

| Area | Main files | Notes |
| --- | --- | --- |
| Routing | `apps/web/app/routes.ts`, `apps/web/app/routes/*.tsx` | React Router v7 in SPA mode, `ssr: false`. |
| Main editor | `apps/web/app/routes/editor.tsx` | Switches between layer view and node view. Owns high-level UI composition. |
| Document state | `apps/web/app/hooks/useEditorDocument.ts` | Canonical `CanvasDocument`, selection, undo/redo, localStorage persistence, graph mutations, document import/export. |
| Asset state | `apps/web/app/hooks/useEditorAssets.ts`, `apps/web/app/utils/assetStore.ts` | Image upload/drop handling, IndexedDB asset payloads, and decoded `imageCache`. |
| Export | `apps/web/app/hooks/useEditorExport.ts`, `apps/web/app/utils/exportCanvas.ts` | Uses `renderDocument` with live primitive camera overrides. |
| Projects | `apps/web/app/hooks/useProjects.ts`, `apps/web/app/hooks/useEditorProjectsController.ts`, `apps/web/app/utils/projectStore.ts`, `apps/web/app/utils/activeProjectBinding.ts` | IndexedDB-backed local project records, active project binding outside `CanvasDocument`, save-overwrite behavior for active projects, copy-as-new-project behavior, and independent pre-blank recovery copies. |

### Data model

The canonical document type is `CanvasDocument` in
`apps/web/app/types/config.ts`.

```ts
interface CanvasDocument {
  schemaVersion?: number;
  global: GlobalConfig;
  layers: Layer[];
  graph?: CanvasGraph;
  export: ExportConfig;
}

interface CanvasGraph {
  edges: GraphEdge[];
  positions: Record<string, { x: number; y: number }>;
  mergeNodes: GraphMergeNode[];
  colorNodes: GraphColorNode[];
  repeatNodes?: GraphRepeatNode[];
  maskNodes?: GraphMaskNode[];
  transformNodes?: GraphTransformNode[];
  areas?: GraphArea[];
  primitiveViewStates?: Record<string, PrimitiveViewportStateConfig>;
}
```

Layer kinds are:

- `text`
- `image`
- `emoji`
- `fill`
- `effect`
- `primitive`
- `noise`
- `array`

The layer stack remains the portable document model. The node graph is an
optional editing/composition layer on top of the same document. Graph-only
merge, color, repeat, export, and area metadata are still serializable document
state, not a second editor format.

### Rendering pipeline

Rendering is exposed through `apps/web/app/utils/renderer.ts`. That file is the
public facade; implementation internals live under `apps/web/app/utils/render/`.

1. `renderDocument` decides whether to use stack mode or graph mode.
2. `renderGraphTarget` walks graph dependencies and renders each node.
3. Stack mode infers a linear graph from `doc.layers` so stack and graph
   rendering share semantics.
4. `applyLayerToCanvas` draws one layer/source/effect over an input canvas.
5. Canvas 2D handles text, image, fills, emojis, procedural sources, and some
   effect passes.
6. PixiJS handles GPU effect filters, with adjacent GPU-only effect nodes
   batched where semantics allow.
7. CPU-only pixel effect kernels and procedural noise texture generation can
   run in dedicated Web Workers with main-thread fallbacks.
8. Three.js renders primitives through
   `apps/web/app/utils/primitiveRenderer.ts` using the shared scene recipe in
   `apps/web/app/utils/primitiveScene.ts`.

This is the most important invariant:

> Preview, thumbnail, gallery, and export should call the same render path with the same document, graph, images, and live primitive camera state.

### Node canvas

Node editing lives under `apps/web/app/components/node-canvas`.

| Area | Files | Current role |
| --- | --- | --- |
| Canvas shell | `NodeCanvas.tsx` | React Flow integration, context providers, graph events, gallery modal, and primitive camera hook wiring. |
| State machine | `machine.ts` | XState state for selection and overlays. |
| Node construction | `buildRFNodes.ts` | Converts `CanvasDocument + CanvasGraph` to React Flow nodes. |
| Node components | `nodes/NodeTypes.tsx`, `nodes/NodeShell.tsx` | Layer, merge, color, repeat, and output node renderers. |
| Previews | `thumbnails/NodeThumbnail.tsx`, `thumbnails/LayerPreviewSurface.tsx` | Cached async thumbnails plus interactive selected-node previews. |
| Inspectors | `inspector/*.tsx`, `panel/NodePropertiesPanel.tsx` | Node-side property controls. |
| Menus | `menus/*.tsx` | Pane and node context menus, including compact add menu. |
| Areas | `areas/*` | Passive graph-area overlays and area bounds helpers. |

The current direction is correct: node editing is a specialized UI over the same document and render model, not a separate editor format.

### Interaction state

There are currently three state tiers:

| Tier | Examples | Persistence |
| --- | --- | --- |
| Document state | Layers, effect parameters, graph edges, graph positions, repeat/color/merge nodes, graph areas, committed primitive camera states, export config | Saved in `CanvasDocument`. |
| Session/UI state | Selection, open panels, gallery view, active primitive camera drafts | In React state and context. |
| Gesture draft state | Text/image local transform drafts, active primitive drag state | Component-local refs/state, committed after gesture. |

This split is necessary. The current rule is to draft locally during hot
gestures, then commit deliberately so undo history and thumbnail invalidation
track creative decisions rather than pointer ticks.

## What is good

### Strong product identity

`PRODUCT.md` and `DESIGN.md` are unusually specific. The app has a clear audience, mood, and visual vocabulary: warm dark neutrals, mono UI, square controls, rare accent use, and a print-like zine tone. This makes design decisions easier.

### Canonical document model

`CanvasDocument` is a good core. It is serializable, localStorage-friendly, export-friendly, and already supports both stack and graph modes. Keeping the document portable is one of the healthiest parts of the codebase.

### Shared rendering path

The app generally uses `renderDocument` and `renderGraphTarget` across preview,
thumbnails, showcase output, and export. That is the right architecture for
"what you see is what you export."

### Layer factories and migration helpers

Factory functions in `config.ts` reduce malformed layer creation. `normalizeDocument` and compatibility handling in `useEditorDocument.ts` keep old documents usable.

### Good low-level testing coverage for data and rendering logic

Existing tests cover:

- config defaults and layer creation
- random document generation
- node graph helpers
- node canvas reducer/helpers
- document persistence and command helpers
- render fixtures for deterministic Canvas 2D paths and graph traversal
- thumbnail render signatures and scoped invalidation

These tests protect the model and renderer boundary from regressions.

### Node canvas direction is promising

Using React Flow for graph mechanics and XState for selection/overlay state is a good fit. The node add menu has moved toward a compact, direct, Blender-like interaction model, which matches the product.

## What is bad or risky

### `editor.tsx` is still broad

`editor.tsx` wires document state, asset state, projects, export, layout mode,
preview, sidebar, and node mode. `NodeCanvas.tsx` has been split
into focused hooks for selection sync, context menus, graph events, drag state,
gallery state, and primitive camera state, but the route-level composition is
still dense.

This makes route-level behavior harder to scan and is the next likely place to
extract controller-style hooks when feature work touches multiple panels.

### Hot text/image canvas handles remain a known risk

The node editor has draft-state patterns for selected text/image node previews,
primitive camera movement, and React Flow node dragging. The classic
`CanvasHandles` path still commits text/image transform movement through
document updates during pointer moves, which can create extra history,
thumbnail, or render work.

The direction remains: draft locally, commit once per gesture, invalidate only
affected render paths.

### Visual regression coverage is still limited

The repo has deterministic render fixtures and focused browser smoke tests, but
no broad visual snapshot suite yet. GPU/PixiJS and Three.js output still need a
tolerance strategy before visual snapshots become useful.

### Persistence is local-first

Imported images, local projects, and recovery copies now use IndexedDB, and
`.artifact.json` files/share links hydrate local image assets when possible.
This is enough for the local editor, but there should be a stronger data
ownership path: a downloadable project package with a custom extension that can
bundle the document, assets, thumbnails/previews, and metadata for offline
storage and re-open. That package should remain compatible with PWA file
handling where supported. Server-backed sharing, accounts, and large portable
asset packages remain out of scope until a dedicated persistence plan exists.

### CSS is a large monolith

`node-canvas.css` contains the full node editor UI. It is coherent visually,
but it is becoming hard to reason about. Component boundaries are not reflected
in style boundaries.

### Documentation must stay aligned

The architecture and user-facing docs are much closer to the code now, but
roadmap status, version plans, release notes, and workflow docs need regular
cleanup after each focused release so old beta-era plans do not read like
current scope.


## Improvement principles

1. **Single source of truth per concern.** Document state, graph state, camera state, and gesture state should each have a named owner.
2. **Draft locally, commit deliberately.** High-frequency gestures should not write to `CanvasDocument` every frame.
3. **Render parity is a feature.** Preview/export equality should be tested, not assumed.
4. **Node controls belong inside nodes when they manipulate node-local view state.** Side panels should edit durable document parameters, not transient camera state.
5. **The renderer should be modular but shared.** Split code for clarity without creating separate preview/export implementations.
6. **Docs should track architecture.** Any major UI/rendering invariant should be documented near the code and in product docs.

## Roadmap

### Current Status

The active release baseline is `v0.39.0` release prep on `development`.
Earlier `v0.2` through `v0.39` version plans are release history, not active
target buckets. Their detailed acceptance criteria and validation notes live
under `docs/version-plans/` and `docs/releases/`.

Current shipped baseline:

- Local-first document editing with stack and graph workflows.
- Graph nodes for layer, merge, color, repeat, mask, transform, material,
  environment, 3D model, 3D scene, utility, and export composition.
- Graph areas as serializable organization metadata with node overlays and
  layer-panel folder rows.
- Focused effect presets, procedural noise/array sources, repeater presets, and
  per-node seed offsets for seeded emoji, sources, effects, and repeaters.
- 3D model/environment assets, PBR material graph workflows, retro finishing
  effects, Bad Stream block effects, and preview/export parity for the covered
  graph paths.
- Blank-canvas entry points, starter paths, examples, recipes, docs, and
  Showcase recovery work.
- Local project snapshots, imported image assets, and recovery copies in
  IndexedDB.
- `.artifact.json` import/export and hydrated share-link behavior where local
  assets are available.
- Private AI Image alpha workflow with Better Auth account access, VPS
  API/worker, Postgres, Redis/BullMQ, generated asset storage, quota guards,
  retries, diagnostics, and local asset import.
- Account-backed cloud project saves that mirror local projects without
  replacing IndexedDB local-first editing.
- Separate cloud asset upload/reassembly for large projects, with v0.39's
  local-volume storage as the first backend implementation.
- Editable project packages and explicit font/package export policy for local
  ownership outside browser storage.
- Shared renderer facade, split renderer internals, render fixtures, browser
  smoke tests, thumbnail signatures, and node-editor performance tooling.
- Fallow code-quality scripts, changed-code audit guidance, and the v0.32
  zero-over-threshold complexity cleanup baseline.
- v0.38/v0.39 editor chrome, import/open safety, cloud project status, local
  project action clarity, shared primitive polish, visual identity refresh, and
  responsive Layers/Nodes action surfaces.

### Active Candidate Tracks

The next version should be selected from one active candidate and turned into a
dedicated version plan before implementation is called release scope:

- **Reference Intelligence And Cover Discovery**: add a Cosmos/mymind-style
  reference browser backed by a TypeScript reference catalog in the API
  workspace. The first releasable slice should define import/search scope,
  saved-reference semantics if they remain in scope, validation commands,
  route/product polish, and a clear boundary that reference images stay outside
  `CanvasDocument`.
- **Public Share Links And Ownership**: build on v0.39 private cloud projects
  with explicit sharing permissions, link tokens, ownership rules, and security
  tests before public project links become available.
- **Cloud Asset Storage Follow-Up**: move beyond v0.39 local-volume cloud asset
  sync toward upload progress, cross-project asset deduplication,
  quota/cleanup policy, S3-compatible object storage, and oversized-project
  recovery states.
- **3D Material Authoring Follow-Up**: material map scale/rotation, channel
  packing, richer material examples, broader browser WebGL coverage, and
  external HDRI/material marketplace evaluation.
- **History Performance And Undo Memory Budget**: serialized memory budget,
  fewer unnecessary deep clones, and patch/checkpoint evaluation for
  high-frequency edits.
- **Project Autosave History / Versions**: visible automatic save points,
  named creative snapshots, restore/compare, and a clear split between
  recovery, autosave, explicit save, and user-created copies.
- **Whole-App Brand And Public Surface Refresh**: public routes, docs,
  Showcase, account surfaces, and broader brand/site work after v0.39's
  account/cloud-save core.
- **Command Palette / Add Library Improvements**: faster repeated editor
  actions, stronger keyboard behavior, recent/common items, and protected
  search/drag states.
- **Asset Library And Export History**: reusable local sources, exported
  outputs, cutouts, generated assets, restore/compare, and migration boundaries
  before deeper cloud sync.
- **CI Policy For Fallow Full Health**: only if threshold ownership,
  suppressions, and CI behavior are documented before making full-health
  complexity a standing strict gate.

### Historical Version Details

### v0.11: Layer Workflow And Onboarding

Detailed plan: [`version-plans/v0.11.md`](./version-plans/v0.11.md).

Goal: make layer mode feel like the fastest path to a finished cover while
keeping node workflows truthful.

- [x] Improve the layer list hierarchy for graph-area documents so areas read
  like lightweight folders without changing render order.
- [x] Add layer-row affordances for duplicate, mute, rename, delete, and quick
  add where they are faster than opening the node canvas.
- [x] Add clearer layer empty states and quick-start actions for image, text,
  fill, noise, and effect starts.
- [x] Add layer presets or recipes that create useful stacks without opening
  nodes.
- [x] Ensure layer controls explain unavailable or node-owned controls instead
  of silently hiding them.
- [x] Keep layer preview and export parity visible and trustworthy for stack
  workflows.
- [x] Add a sectioned onboarding guide for canvas, layers, nodes, sources,
  effects, repeaters, export, projects, and showcase starts.
- [x] Add a "what changed" or "open guide" path for first visits after a new
  beta release.
- [x] Keep destructive starts guarded by confirmation and recovery copies.

Exit criteria:

- A user can build and export a credible stack-only cover without opening nodes.
- Layer mode does not contradict graph organization when a document uses areas.
- New users can choose between blank, image, text, example, recipe, and random
  starts without needing hidden knowledge.

### v0.12: Examples, Recipes, And Effect Coverage

Detailed plan: [`version-plans/v0.12.md`](./version-plans/v0.12.md).

Goal: turn the current power features into learnable, regression-tested
workflows.

- [x] Add recipe starter documents that create useful first graphs.
- [x] Add recipe starter documents for common covers: photo plus type, noisy
  texture plus type, sticker/grid motif, primitive over image, and
  print-treatment poster.
- [x] Improve examples with categories, used-node summaries, and clearer "start
  from this" language.
- [x] Improve add-node search and grouping for recipes and starter workflows.
- [x] Split user-facing docs into task pages or sections: first cover, layers
  workflow, nodes workflow, effects, sources, repeaters, export, and projects.
- [x] Explain blend modes with practical examples and when to use each one.
- [x] Add layer-vs-node guidance with examples of when to stay in layers and
  when to switch to nodes.
- [x] Add effect-family recipes that stay aligned with separated focused effect
  nodes.
- [x] Add troubleshooting guidance for blank previews, missing image assets,
  browser storage limits, GPU/WebGL quirks, and export mismatch.
- [x] Audit grain/noise, scanlines, rays, speed lines, halftone, barcode arrays,
  and threshold for range problems found in real projects.
- [x] Revisit effect-node controls after real project testing, starting with
  film grain scale/size so it can be tuned subtly.
- [x] Evaluate splitting Cells out of the generic Noise source into a dedicated
  procedural source node if it keeps needing different controls from value and
  cloud noise.
- [x] Keep docs examples aligned with separated focused effect nodes.
- [x] Add render or browser coverage for every effect/source control whose range
  changes.
- [x] Add browser smoke coverage for at least one layer-first starter path and
  one docs "try this" path.

Exit criteria:

- Examples teach the feature they demonstrate.
- Docs explain workflows with recipes, not only parameter lists.
- Changed effect/source ranges have focused test coverage.

### v0.13: AI Generation Research And Architecture

Detailed plan: [`version-plans/v0.13.md`](./version-plans/v0.13.md).

Goal: make AI-generated imagery a creativity multiplier without weakening the
editor's local-first reliability or leaking provider secrets into the browser.

Product direction:

- Image Generation node: prompt/settings in, generated image asset out, then
  normal Artifact effects/merge/export downstream.
- Variation workflow: generate alternatives from an existing image or rendered
  branch so users can rapidly explore cover directions.
- Background/texture generator: create grunge, photo, abstract, scanned-paper,
  poster-background, and mood-board source assets.
- Prompt preset packs for music/design aesthetics such as VHS, brutalist,
  shoegaze, dark ambient, cyber zine, club poster, and scanned print.
- Generation history with reusable outputs, seed/settings metadata where the
  provider supports it, and side-by-side comparison.

Research and architecture tasks:

- [ ] Compare generation providers and models for quality, latency, cost,
  licensing, safety constraints, and API ergonomics.
- [ ] Design a backend endpoint that keeps API keys server-side and can support
  cancellation, retry, progress, and error states.
- [ ] Decide where generated images live: browser IndexedDB only, VPS/object
  storage, or hybrid local-first storage with optional cloud sync.
- [ ] Define quota/cost accounting before broad usage. Even a beta needs a
  clear limit so generation does not become a surprise bill.
- [x] Define how generated assets serialize in `.artifact.json` and shared
  projects: completed outputs import into normal local image assets, and
  save/share hydrates available local bytes into portable data URLs.
- [ ] Prototype a minimal Image Generation node only after the storage and
  generation-job model are clear.
- [ ] Add a deploy hardening pass for VPS services: build API/worker/Bull Board
  containers in GitHub PR/CI, publish immutable image tags, and configure the
  VPS/Coolify deploy step to run those images instead of rebuilding on the VPS.
  This should reduce preview deploy timeouts and make deploy failures separate
  from image build failures. The GHCR/Coolify plan now covers image references,
  required `packages: write` publishing permission, read-only Coolify package
  pulls, shared API/worker/BullMQ/Postgres/storage env, migration-before-deploy
  order, and rollback by previous tag or digest.
- [ ] Run the monorepo/Turborepo migration as a dedicated infrastructure track:
  introduce workspaces, add Turborepo task orchestration, move the web app into
  `apps/web`, extract stable shared contracts, build dedicated service
  containers, publish images from GitHub PR/CI, and switch Coolify/VPS to
  pull-only deploys. Plan:
  [`monorepo-turborepo-container-plan.md`](./monorepo-turborepo-container-plan.md).
  Initial foundation is in progress: API workspace wiring, web workspace
  relocation, shared AI contracts, API/web/shared Turbo scripts, production API
  build/start scripts, service Dockerfiles, and the additive GHCR image
  workflow are implemented.

Release checklist:

- [x] Commit the current AI Image node reliability batch: generated variant
  history, loading/failure states, React Flow measurement stability, and local
  asset preview fixes. Focused browser coverage now includes multiple AI image
  generations in the same node across reload, history traversal, and completed
  jobs whose asset import fails.
- [x] Fix Vercel preview deploy drift after the workspace move: the repo build
  stays React Router, while Vercel is explicitly configured as a static Vite
  output deploy for `apps/web/build/client`; the accidental extra Vercel
  project created during local CLI validation was removed.
- [x] Run private-alpha QA against the local VPS-shaped stack with real API,
  Postgres, Redis, worker, BullMQ, Bull Board, and local file storage. Manual
  private-alpha QA on 2026-05-22 covered the required AI Image flow and found
  no current alpha-blocking issues.
- [x] Add explicit AI Image retry/recovery actions and compact job/asset
  diagnostics in the AI Image panels. Failed generations expose retry, asset
  import failures expose recovery from the durable job id, and compact
  status/job/asset/error/provider metadata is visible without opening logs.
- [x] Add generated-job and generated-asset cleanup operations plus runbook
  notes.
- [x] Write v0.13 release notes and accepted-risk checklist before tagging.

Private-alpha merge gate:

- [x] Merge blocker: reliability batch is committed and the full local
  validation suite passes. Validation passed on 2026-05-22 with
  `npm run check`, `npm run build`, `npm run build:api`, and focused
  AI Image Playwright coverage.
- [x] Merge blocker: real local stack QA passes for Clerk login, AI-enabled
  account access, quota display, first generation, multiple generations in one
  AI Image node, history traversal, reload, export, provider failure, failed
  asset import, and quota exhaustion.
- [x] Merge blocker: alpha-blocking bugs found in QA are fixed or documented
  with an accepted workaround that does not risk token spend, export failure,
  or document corruption.
- [x] Merge blocker: minimal retry/recovery and compact job diagnostics exist
  so a failed generation can be understood without immediately opening logs.
- [ ] Post-merge follow-up: provider/defaults research and prebuilt container
  deploys can land after the private alpha merge if the blockers above pass.
- [ ] Post-merge follow-up: harden AI accounting before broader beta access.
  Current private-alpha safeguards are acceptable because the database enforces
  one active generation per user, queue enqueue failures refund quota, and the
  active-job migration self-expires old duplicate active rows before creating
  the guard index. Before increasing concurrency or opening access beyond the
  private alpha, move quota consumption into an atomic database operation and
  make concurrent same-idempotency-key requests return the existing job instead
  of occasionally surfacing `active_job_exists`.
- [ ] Post-merge follow-up: monorepo/Turborepo workspace migration can be done
  in parallel tracks after the private alpha merge decision, following
  [`monorepo-turborepo-container-plan.md`](./monorepo-turborepo-container-plan.md).

Estimated effort before deciding whether to merge: 2 focused days in the best
case, 3 focused days expected, and 4 focused days if auth/session, asset import,
or worker-state edge cases need another pass.

### v0.14: Editor Beta And Local-First Reliability

Detailed plan: [`version-plans/v0.14.md`](./version-plans/v0.14.md).

Goal: ship a parallel editor-focused beta that makes Artifact easier to learn
and more trustworthy as a local-first cover editor, without waiting on the
v0.13 AI alpha infrastructure.

Release stance:

- [x] Keep v0.14 independent from Clerk, the VPS API, provider credentials, and
  server-side project sync.
- [x] Improve the layer list around graph areas so areas read like lightweight
  folders without changing render order.
- [x] Add layer-row quick actions and clearer empty states.
- [x] Add one or two layer-first recipe documents and use them from showcase
  starts and docs.
- [x] Explain node-owned or unavailable layer controls for primitive camera,
  full-canvas noise placement, and graph-area organization.
- [x] Add practical onboarding for canvas, layers, nodes, sources, effects,
  repeaters, export, projects, and showcase starts.
- [x] Keep AI controls private/disabled unless the existing v0.13 gates are
  explicitly configured.
- [x] Run `npm run check`, `npm run build`, and `npm run test:browser` before
  cutting `v0.14.0-beta.1`.

Current status: the local release gate for `v0.14.0-beta.1` has passed. The
release was packaged and published as a prerelease. Follow-up editor polish now
continues in v0.15.

Exit criteria:

- A user can build and export a credible stack-only cover without opening
  nodes.
- Layer mode does not contradict graph organization when a document uses areas.
- New users can choose between blank, image, text, example, recipe, and random
  starts without needing hidden knowledge.
- AI alpha work can continue on `v0.13.x-alpha` without blocking the editor
  beta.

### v0.15: Visual Clarity And Cross-Browser Confidence

Detailed plan: [`version-plans/v0.15.md`](./version-plans/v0.15.md).

Goal: make the dark editor easier to read and safer to trust across Chromium,
Firefox, and WebKit without changing render semantics or adding new AI scope.

Release stance:

- [x] Add Playwright desktop projects for Chromium, Firefox, and WebKit.
- [x] Update CI browser setup to install all desktop Playwright browsers.
- [x] Add a first visual hierarchy token pass for app background, workspace,
  panels, layer rows, canvas stage, and node surfaces.
- [x] Add focused visual hierarchy browser assertions for selected/hover/focus
  editor states.
- [x] Audit remaining dialogs, text controls, project flows, and export menus
  for contrast and state clarity.
- [x] Add focused mobile Chromium/WebKit smoke for starter actions and layer
  editor layout.
- [x] Run full cross-browser browser suite before cutting the release.

Exit criteria:

- The main editor E2E suite runs in Chromium, Firefox, and WebKit.
- Users can distinguish the canvas, panels, selected layers, selected nodes,
  toolbar actions, and graph areas at a glance.
- The app stays dark, print-like, mono, and warm-tinted, but no longer reads as one
  black field.
- Preview/export/render behavior stays unchanged.

Current status: the local release gate for `v0.15.0` has passed with
`npm run check`, `npm run build`, and `npm run test:browser`.

### v0.16: Editor Workflow Polish

Detailed plan: [`version-plans/v0.16.md`](./version-plans/v0.16.md).

Goal: make the editor state clearer and the release/debug path quieter without
changing document semantics, graph traversal, thumbnails, AI alpha scope, or
export behavior.

Release stance:

- [x] Strengthen layer selected, hidden, focused, hover, disabled, active, drag,
  and drop-target states.
- [x] Improve node contrast for selected nodes, muted nodes, graph areas,
  handles, toolbar actions, and canvas chrome.
- [x] Add the first editor visual-system contract and centralize foundation,
  semantic, and node-card tokens.
- [x] Keep normal console output quiet with a single styled build/version entry.
- [x] Add opt-in AI diagnostics that expose safe status only when explicitly
  enabled.
- [x] Run the release gate before cutting `v0.16.0`.

Current status: the local release gate for `v0.16.0` passed, and release notes
live in [`releases/v0.16.0.md`](./releases/v0.16.0.md).

### v0.17: Editor Creative Controls

Detailed plan: [`version-plans/v0.17.md`](./version-plans/v0.17.md).

Goal: make effect controls and add menus feel like creative tooling while
preserving document semantics, renderer/export behavior, graph traversal,
thumbnail scheduling, and AI alpha scope.

Release stance:

- [x] Format effect slider values with readable units and useful creative
  ranges.
- [x] Lower destructive defaults and random ranges for Grain, Dither, Pixelate,
  and Misregistration.
- [x] Present Pixelate as a focused low-resolution workflow without a schema
  migration or new graph node type.
- [x] Replace long add dropdowns with the shared Add Library across Layers and
  Nodes.
- [x] Add Add Library search, categories, recent/popular starts, and
  drag-to-canvas for Nodes.
- [x] Render Add Library hover/detail previews through cached renderer output
  so menu preview follows the output mental model.
- [x] Run the release gate before cutting `v0.17.0`.

Current status: the local release gate for `v0.17.0` has passed with
`npm run check`, `npm run build`, `npm run test:browser`, and
`npm run perf:node-editor`. Release notes live in
[`releases/v0.17.0.md`](./releases/v0.17.0.md).

### Experimental Track

These ideas are promising but should not block editor reliability:

- Voice/music visualizer nodes using uploaded audio or microphone input.
- Animated noise/effects and possibly video export.
- Background removal for imported images. Research candidates first, including
  local/browser execution, VPS-hosted open models, and commercial APIs, then pick
  based on quality, latency, privacy, file-size, and cost. The product model
  also needs to decide whether removal is an image-node operation, a dedicated
  graph node, or an asset-library action; how originals and cutouts are stored;
  and whether cutouts preserve mask/edit history.
- SVG + 3D hybrid primitives.
- AI image/card generation nodes and variant workflows.
- 3D layer visualization.
- Subscription/paywall experiments.

## Historical phase plan

The older phase-by-phase architecture plan has been retired from this roadmap.
Completed and remaining implementation details now live in
[`docs/improvement-plan.md`](./improvement-plan.md), with testing specifics in
[`docs/testing.md`](./testing.md) and performance specifics in
[`docs/performance.md`](./performance.md).

## Recommended near-term focus

Pick one active candidate track and write its version plan before broad
implementation. Given the v0.39 baseline, the cleanest next candidates are
public share links and ownership, cloud asset storage follow-up, Reference
Intelligence, 3D material authoring follow-up, project history/versioning, or
public-surface polish.

Recommended order:

1. Decide whether the next release is account/cloud-share follow-up, reference
   catalog discovery, editor/material polish, or project history.
2. Pick one narrow version thesis with explicit non-goals.
3. Write a version plan before moving implementation scope into the release.
4. Add the lowest useful tests first, then run the validation commands listed
   in that version plan before calling the slice done.

## Non-goals for now

- Do not treat any active candidate as release scope until it has a version
  plan with a thesis, non-goals, acceptance criteria, and validation commands.
- Do not broaden reference catalog work into vector search, AI chat, account
  collections, or editable third-party cover imports without a separate plan.
- Do not change document schema, graph traversal, renderer/export semantics, or
  package export policy as incidental support work for public-route, account,
  sharing, or catalog polish.
- Do not add more effect parameters until the effect update checklist is automated or tested.
- Do not make a second preview renderer for speed unless it is clearly labeled as draft-only.
- Do not duplicate node controls in both sidebar and inspector without shared field definitions.

## Health summary

The codebase is productive and has a strong core: portable documents,
deterministic Canvas render fixtures, GPU effects, node graph editing, local
asset/project persistence, and a clear visual identity. The main weakness is no
longer missing architecture documentation; it is product legibility and
remaining edge coverage.

The best path forward is to keep the architecture stable while making the app
easier to enter and easier to trust: improve layer-first workflows, finish the
remaining UI-overhaul workstreams, keep one rendering truth, and add focused
browser/visual coverage where regressions are most likely.

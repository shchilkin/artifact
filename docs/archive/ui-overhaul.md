# UI Overhaul Tracker

This document tracks the editor UI overhaul as a product/design program, not as
a one-off visual refresh. The goal is to make Artifact feel like a capable
creative editor: readable, fast to scan, direct to manipulate, and visually
specific without becoming decorative or limiting.

Source-of-truth companions:

- [`PRODUCT.md`](../PRODUCT.md) for product direction and graph-color grammar
- [`DESIGN.md`](../DESIGN.md) for visual tokens and named design rules
- [`style-guide.md`](./style-guide.md) for component and state contracts
- [`editor-design-system.md`](./editor-design-system.md) for primitive and
  migration rules
- [`testing.md`](./testing.md) for validation strategy

## Current Status

| Area | Status | Notes |
| --- | --- | --- |
| Editor visual baseline | In progress | The first visual polish pass is committed in `2afe860` and protected by browser tests. |
| Node category color | In progress | Category-colored layer badges and node selection are restored; graph color grammar is documented. |
| Node canvas contrast | In progress | Grid dots, node frames, and output edges have stronger contracts; more zoom-state work remains. |
| Design rules | In progress | `DESIGN.md` now relaxes radius, mono, tracking, and flatness into usable product rules; shared controls and node-editor overlays have the first implementation pass. |
| Inspector usability | In progress | The Layers drawer now uses a compact selected-target header and denser control rows; primary-control ordering still needs a deeper pass. |
| Add Node / Library flow | In progress | Rows, group filters, and detail preview now inherit node category color grammar; intent grouping and keyboard polish remain. |
| Layers and Nodes parity | Planned | The two modes need stronger shared mental model and cross-mode status cues. |
| First-run / empty editor | Planned | Starter paths exist, but the first working screen can do more to teach without marketing copy. |
| Visual QA contract | In progress | Browser coverage now checks category-colored node selection and output-path readability. |

## North Star

The editor should feel like a compact creative studio. Users should be able to
tell what they are editing, where it feeds, what is selected, what is muted or
locked, and what will export without reading a manual. The interface should not
look like a generic admin dashboard, but it also cannot hide behind atmosphere.
If a visual choice makes the graph, controls, or canvas harder to parse, it is
not the right visual choice.

## Design Principles For This Overhaul

1. **Readability beats atmosphere.** Dark, tactile, print-like surfaces are
   useful only when grid, edges, text, controls, focus, and selection remain
   readable at normal zoom.
2. **Color is grammar.** Category color identifies node kind. Output-path color
   identifies the active route. Global accent identifies product commands. Do
   not collapse those roles.
3. **Controls should feel like a pult.** Inspector sections and node controls
   should foreground the controls that change the result now, with secondary
   settings tucked behind clear structure.
4. **Modes should agree.** Layers and Nodes are different workflows over one
   document, not two products. Status, naming, output-path membership, locked
   state, and graph areas should line up across both.
5. **The first screen should start work.** Empty states, examples, and starter
   recipes should help users make a cover quickly without becoming a landing
   page inside the editor.
6. **Every visual state needs a test or specimen.** Selected, hover, focus,
   muted, locked, output path, empty, dense, mobile, and error states should be
   represented in `/docs/style-guide`, browser tests, or both.
7. **Rules should create freedom.** Radius 0, mono type, and flat surfaces are
   visual tools, not universal constraints. Use them where they preserve
   Artifact's print-like character; relax them when readability, affordance, or
   workflow speed improves.

## Workstreams

### 1. Node Canvas As Working Map

Goal: make the graph readable as topology, not as a row of decorative cards.

Tasks:

- [x] Restore node category color tokens and layer-kind badges.
- [x] Make selected node border, outline, rail, and first shadow ring resolve
  to the selected node category color.
- [x] Prevent hover from overriding selected node styling.
- [x] Add browser coverage for category-colored selection and output-path
  readability.
- [ ] Improve edge hit areas and selected-edge feedback without reintroducing
  React Flow update-depth loops.
- [x] Simplify the node-canvas toolbar into a compact command strip by removing
  visible group labels, duplicate view commands, and disabled area noise.
- [x] Standardize the node-mode bottom rail with the same compact command-strip
  treatment while keeping export as the only primary action.
- [x] Make floating editor command surfaces opaque by default; translucency may
  support borders/shadows but not the panel or button planes themselves.
- [x] Remove low-value document chrome data from the top nav. Aspect ratio,
  layer count, and local draft state are visible or actionable elsewhere, so
  the mode switcher owns that slot by itself.
- [x] Replace the sidebar canvas-aspect readout with a compact Layer header
  command, preserving aspect changes in Layers mode without making `1:1` a
  persistent status block.
- [x] Reduce layer-row metadata noise by hiding the default "visible" label.
  Rows only surface exceptional states such as hidden, locked, AI status, or
  area membership.
- [x] Remove row-level quick-add from Layers mode. Adding belongs to the Layer
  header; row controls are reserved for layer-specific actions.
- [x] Increase Layers panel separation with a distinct list surface, stronger
  row dividers, and clearer hover/selected contrast.
- [x] Split Layers mode into a left layer stack and a right settings drawer.
  The left side stays navigation/build-focused; selected-layer controls live in
  the inspector surface.
- [x] Redesign layer rows as compact stack rows instead of large kind cards:
  48px touch-safe height, 26px category tokens, readable layer names, and
  category-colored selected outlines.
- [x] Add Figma-style inline layer renaming: click a selected layer name to
  edit it in place while keeping first click reserved for selection.
- [ ] Add zoom-aware visual states: far zoom emphasizes topology; near zoom
  emphasizes preview, ports, and controls.
- [ ] Make source/effect/utility/export roles easier to scan through
  typography, icon, port, and node-shell hierarchy.
- [ ] Add dense-graph browser coverage for non-overlap, grid visibility, and
  output-path readability.

Acceptance:

- At normal zoom, a user can distinguish node kind, selected state, muted
  state, and output-path membership without hovering.
- A selected emoji node is visibly emoji pink; a selected effect node is visibly
  effect violet; output path remains a separate route color.
- Repeated edge interactions do not trigger `Maximum update depth exceeded`.

Validation:

- `npm run format:check`
- `npm run typecheck`
- Focused browser coverage in `tests/browser/generator.spec.ts`
- `npm run perf:node-editor` when node rendering, React Flow state, or drag
  behavior changes materially

### 2. Inspector As Control Surface

Goal: make the properties panel feel like an editing pult, not a long generic
form.

Tasks:

- [ ] Audit inspector sections by task priority: identity/status, primary
  creative controls, secondary controls, safety/settings.
- [ ] Promote high-impact controls for effect/source nodes into a compact
  top section with clear live values.
- [ ] Collapse rare or advanced controls behind explicit section headers.
- [x] Keep output-path, visible, muted, locked, and source/result status near
  the selected target header.
- [x] Simplify the Layers drawer selected-target header to name, kind, and
  meaningful status only. Default visibility, layer count breadcrumbs, and
  repeated surface labels should not compete with controls.
- [x] Give open inspector sections and control rows a compact pult treatment
  without changing control semantics.
- [ ] Add style-guide specimens for dense, empty, selected layer, selected
  effect, graph-only utility, and export target inspector states.
- [ ] Add browser coverage for inspector readability and non-overlap in common
  desktop and narrow layouts.

Acceptance:

- The first screenful of the inspector tells the user what is selected, whether
  it feeds output, and which controls most affect the visible result.
- Important controls do not disappear below repetitive metadata.
- Long labels, values, and sliders do not overlap at narrow desktop widths.

Validation:

- Style-guide specimen coverage
- Focused Playwright layout/readability checks
- Existing unit tests for inspector models where control metadata changes

### 3. Add Node / Library As Creative Command Palette

Goal: make adding layers, effects, and graph utilities fast, visual, and
workflow-shaped.

Tasks:

- [ ] Rework Add Node categories around user intent: sources, effects,
  structure, color, output utilities, recent.
- [x] Add a first-pass intent rail for sources, effects, structure, color, and
  3D while preserving exact browse groups.
- [ ] Keep search primary and keyboard-friendly.
- [x] Show category color and concise effect/source purpose in each row.
- [ ] Preserve drag-to-edge insertion and node-menu insertion.
- [ ] Add recent or commonly used items if it improves repeat workflows without
  clutter.
- [ ] Add style-guide and browser coverage for search, empty, loading/preview,
  drag target, keyboard, and narrow viewport states.

Acceptance:

- A user can add a common source/effect/utility without scanning a generic
  catalog.
- Search results remain readable and preview-rich.
- Dragging onto an edge communicates whether insertion will happen before the
  user drops.

Validation:

- Add Library model tests where grouping/search changes
- Browser tests for Add Node search and edge/drop insertion

### 4. Layers And Nodes Shared Mental Model

Goal: make Layers and Nodes feel like two views of one document.

Tasks:

- [ ] Strengthen layer row badges using the same category color grammar as
  node shells.
- [ ] Show graph-area membership and output-path/off-output-path status in
  layer rows without making the layer list noisy.
- [ ] Add quick actions in Layers for common edits that do not require opening
  Nodes.
- [ ] Keep graph helper nodes represented clearly without pretending they are
  normal layers.
- [ ] Add browser coverage for layer-first and graph-backed documents across
  mode switching.

Acceptance:

- A graph-backed document does not make the layer list feel like a contradictory
  flat stack.
- Users can understand why a visible layer may or may not affect export.
- Layer-first editing still feels fast and first-class.

Validation:

- Existing layer selection/reorder tests
- Browser tests for mode switching, graph-area chips, output-path status, and
  selected row readability

### 5. Canvas Contrast And Zoom States

Goal: make the canvas readable at multiple scales.

Tasks:

- [x] Raise node canvas grid contrast enough to be visible in screenshots.
- [ ] Define contrast levels for grid, passive edges, output edges, selected
  edges, node borders, selected node rings, and graph areas.
- [ ] Adjust visual density by zoom level where React Flow supports it without
  layout churn.
- [ ] Add reduced composed specimens for default, dense, far-zoom, and
  selected-output-path node canvas states.
- [ ] Add browser checks that grid dots and edges remain detectable without
  overpowering nodes.

Acceptance:

- Far zoom reads as topology; near zoom reads as content and controls.
- Grid orientation is visible but subordinate to nodes and output path.
- Node content and labels do not become illegible because of decorative glow,
  low contrast, or overlaid state marks.

Validation:

- Focused Playwright computed-style and geometry checks
- Manual screenshot review for desktop and mobile-ish viewports

### 6. First-Run And Empty Editor

Goal: help users start making work without turning the editor into a landing
page.

Tasks:

- [ ] Improve blank-canvas choices around image-first, text-first,
  texture-first, node-chain, and remix-example starts.
- [ ] Keep random seed and examples available without competing with primary
  blank-start actions.
- [ ] Add compact first-run explanations only where the next action is not
  obvious.
- [ ] Add editable example documents that demonstrate Layers and Nodes
  workflows.
- [ ] Add browser coverage for at least one blank start and one example remix
  path.

Acceptance:

- First-time users can create a useful first composition in one or two actions.
- Empty states are task-oriented and do not contain internal roadmap or agent
  process copy.
- Returning users can ignore onboarding and work quickly.

Validation:

- Browser smoke for blank starts and recipe/example import
- Docs checks for user-facing copy boundaries

### 7. Visual QA And Design-System Coverage

Goal: prevent future polish from regressing into low contrast, generic chrome,
or one-color state styling.

Tasks:

- [x] Document category-colored selection in `PRODUCT.md`, `DESIGN.md`,
  `docs/style-guide.md`, and `docs/editor-design-system.md`.
- [x] Apply the first low-radius/readable-sans implementation pass to shared
  controls, menus, empty-state copy, Add Library, and node-editor overlays
  while keeping artwork/node frames square.
- [x] Apply the first typography pass that reduces over-tracked microcopy,
  raises dense editor labels toward 10–11px, and moves readable UI text from
  generic system sans to the Barlow-based Artifact UI voice.
- [x] Replace raw system mono chrome with Space Mono control grammar and align
  layer/inspector/bottom-bar text to shared tracking and readable-size tokens.
- [x] Add browser coverage for category-colored node selection and output-path
  visuals.
- [ ] Add style-guide specimens for node category states and inspector states.
- [ ] Add a UI-overhaul browser test group or tags once more workstreams land.
- [ ] Document manual screenshot review points for desktop, narrow desktop,
  and mobile-ish viewports.
- [ ] Revisit whether golden screenshots are valuable after state contracts are
  stable.

Acceptance:

- Any future node canvas visual change has an obvious test/specimen to update.
- The design system documents what state means, not only what it looks like.
- Regressions such as invisible grid dots or global red selected frames are
  caught before review.

Validation:

- `npm run test:browser -- --project=chromium tests/browser/generator.spec.ts`
  for focused editor visual checks
- `/docs/style-guide` manual and browser checks after specimen updates

## Tracking Rules

- Keep each workstream small enough to review visually.
- Do not mix renderer/export semantics into UI-overhaul PRs unless the workstream
  explicitly calls for it.
- Update this document when a workstream starts, changes scope, or closes.
- Add the lowest useful browser coverage before calling a visual state done.
- Commit docs/product/design updates separately from UI implementation when the
  docs change the direction rather than merely describing the completed patch.

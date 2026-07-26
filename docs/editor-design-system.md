# Editor Design System

For the general project UI standard, read [`style-guide.md`](./style-guide.md)
first. This document extends that guide with editor-specific migration notes,
primitive tiers, Radix/shadcn boundaries, and v0.30 style-guide route rules.

This document is the source of truth for Artifact's visible UI components and
design primitives. The goal is not to make a generic design system. The goal is
to keep the product UI legible, reusable, and testable while preserving
Artifact's print-like visual language.

## Principles

| Principle | Rule |
| --- | --- |
| One source of truth | Reused control sizing, typography, borders, focus rings, shadows, and state colors belong in tokens or shared primitives. |
| Product-shaped primitives | Prefer Foundation `Button` / `ButtonLink` plus product-owned `SearchField`, `Panel`, `LayerRow`, `NodeFrame`, and `InspectorField` over generic wrappers that callers restyle each time. |
| Explicit variants | Use named variants such as `primary`, `secondary`, `quiet`, `danger`, `selected`, `locked`, and `hidden`; avoid ad hoc boolean combinations. |
| Accessible mechanics, Artifact visuals | Radix/shadcn can provide behavior and accessibility, but Artifact tokens define the appearance. |
| Style guide before broad migration | New or migrated primitives should be visible in a deterministic style-guide route before broad editor adoption. |
| UI copy is product copy | Internal migration plans, QA strategy, release-plan notes, and agent workflow text live in `docs/`, not in app surfaces. |

## Token Families

The v0.30 foundation should inventory and normalize these token families:

- **Typography**: Barlow Condensed as the readable UI family for layer names,
  longer descriptions, and recovery copy; Space Mono for editor labels, button
  text, node labels, field keys, ids, inspector values, and compact meta;
  display only for real route or section titles.
- **Control sizing**: icon buttons, compact buttons, default buttons, search
  fields, row heights, toolbar controls, and tab triggers.
- **Spacing**: panel padding, row gaps, toolbar gaps, menu item padding, and
  inspector field spacing.
- **Surfaces**: app background, workspace background, panel background, menu
  background, selected surface, canvas chrome, and overlay surfaces.
- **Borders and focus**: default border, selected border, danger border, focus
  ring, disabled border, and output-path emphasis.
- **State colors**: selected, active, hidden, muted, locked, disabled, danger,
  output path, off-output-path, loading, and warning.
- **Node graph color**: category color tokens (`--node-kind-*`), output-path
  color (`--node-edge-output`), grid dot color (`--editor-grid-dot`), selected
  node rings, selected edge emphasis, handle colors, and layer-kind badges.
- **Motion and layering**: overlay z-index, sheet/dialog z-index, menu z-index,
  hover/focus transitions, and reduced-motion behavior.

Avoid local `text-[8px]`, `h-[22px]`, one-off borders, and one-off focus styles
when they describe a reusable editor control state.

Avoid treating radius 0 or mono text as universal style requirements. Square
geometry is useful for artwork frames, node housings, and hard editor panels;
small radius is acceptable for controls, menus, inputs, and overlays when it
improves affordance. Mono is a control grammar; longer explanatory copy should
stay readable.

Avoid over-tracked microcopy as a default editor style. Dense node/editor
surfaces should prefer 10–11px mono labels with 0.05–0.1em tracking, and use
readable sans for notes, descriptions, and recovery copy.

Node graph colors are product semantics. Do not collapse category, selection,
and output route into one accent token while extracting primitives. `NodeShell`
and future `NodeFrame` primitives should accept a category role and derive rail,
handle, focus, selected, and hover states from that role. Output-path styling is
an additional route state, not a replacement for category color.

## Shared Primitive Ladder

### UI Foundation Package

Cross-product primitives live in `packages/ui` and are consumed as source by
both React Router applications. UI Foundation owns React anatomy, accessible
defaults, structural/state CSS, and the canonical semantic property list in
`packages/ui/src/theme-contract.ts`.

Concrete Theme Contract values remain product-owned:

- Artifact maps the contract in
  `apps/web/app/styles/ui-foundation-theme.css`.
- Backoffice maps the contract in
  `apps/backoffice/app/ui-foundation-theme.css`.

The first command tracer exports `Button`, `ButtonLink`, and `IconButton`. The
field tracer exports `Field`, `Input`, `Textarea`, and `NativeSelect`; `Field`
owns label, hint, and error association while the controls retain native HTML
props, refs, and form behavior. The feedback tracer exports `InlineNotice`,
`Skeleton`, and `ProgressIndicator`. Notices distinguish calm status updates
from urgent danger alerts, skeletons are silent unless given an announcement
label, and progress exposes determinate values only when a value is known.
The overlay tracer exports compound `Tooltip` and `Popover` APIs backed by
Radix mechanics. UI Foundation owns their portal, collision, dismissal, focus,
return-focus, structural CSS, and reduced-motion behavior; Product Themes own
their semantic appearance. `FoundationCommandMatrix`, `FoundationFieldMatrix`,
`FoundationFeedbackMatrix`, and `FoundationOverlayMatrix` are the shared
deterministic specimen sets mounted by Artifact `/docs/style-guide` and
Backoffice `/style-guide`. Both surfaces must render the same
`data-foundation-specimen` identifiers while their computed typography,
density, geometry, motion, and color continue to come from their distinct
Product Themes.

The v0.48 conformance gate enforces that boundary with shared Playwright
assertions rather than theme-neutral golden screenshots. It checks every
registered specimen identifier for readable geometry, then resolves
representative semantic colors, spacing, typography, focus, disabled, error,
loading, reduced-motion, keyboard, and overflow states against the active
Theme Contract. Artifact runs in Chromium, Firefox, and WebKit; Backoffice runs
desktop and mobile Chromium as its own required CI job. Assertion steps include
the theme and specimen identifier so a failure names the owning contract.

Artifact runtime callers now import `Button`, `ButtonLink`, `IconButton`, and
`Input` directly from UI Foundation. Product-specific layout stays in feature
classes and semantic Theme Contract values rather than compatibility wrappers.
The former adapter and alias files remain registered, uncalled deletion
candidates until the v0.48 contract phase. Artifact AI Generation and
Backoffice sign-in remain the two original composed proof consumers; their
generation, accounting, asset-import, safe-return, autofill, and auth behavior
stays product-owned.

### Base UI Primitives

Artifact-specific primitives live under `apps/web/app/components/ui/*` and
should be reused across public and editor surfaces. Foundation commands and
fields come directly from `@artifact/ui`; the remaining composed primitives
stay product-owned:

- `Button` / `ButtonLink` from `@artifact/ui`
- `IconButton` from `@artifact/ui`
- `Input` from `@artifact/ui`
- `SearchField`
- `Tabs`
- `Sheet`
- `Dialog`
- `FloatingMenu`
- `Panel`
- `MenuItem`
- `EmptyState`
- `PreviewFrame`
- `Badge`
- `Toolbar`
- `SegmentedControl`

Current v0.30 status:

- Base UI primitives now use the semantic token family directly:
  `--surface-*`, `--line-*`, `--text-*`, `--accent-*`, `--control-*`,
  `--motion-*`, and `--ease-*`.
- v0.48 removed the registered short aliases from `apps/web/app/index.css`;
  bounded editor stylesheets and inline styles now use semantic token families
  directly.
- Foundation `Button`, `ButtonLink`, `IconButton`, and `Input`, plus
  product-owned `SearchField`, `Badge`, `Toolbar`,
  `SegmentedControl`, `Dialog`, `Sheet`, `FloatingMenu`, `MenuItem`, `Panel`,
  `EmptyState`, `PreviewFrame`, and `Tabs` are the current source-owned base
  primitive set.
- Adoption is still partial across the full app. Public CTAs, docs specimens,
  sheets, dialogs, floating menus, the view-mode tabs, `BottomBar`, project
  sheet commands, layer/node context menus, Add Library search, Add
  Library preview/detail actions, empty layer start actions, AI submit, and the
  image replace command use shared primitives. Editor-heavy surfaces such as
  `LayerPanel`, `NodeCanvas`, Add Library row geometry, and inspector matrices
  still contain feature-local chrome and should be migrated in focused passes.

### Editor Primitives

These are product-specific and may live in feature folders, but they should
still consume the same tokens:

- `LayerRow`
- `NodeFrame`
- `NodeShell`
- `InspectorSection`
- `InspectorField`
- `PropertyRow`
- `PreviewFrame`
- `AddLibraryPanel`
- `EditorTargetHeader`

### Route-Level Style Guide

The deterministic internal route for the visual UI catalog is
`/docs/style-guide`. It should show:

- buttons: primary, secondary, quiet, danger, disabled, icon-only
- inputs: default, search, focused, disabled, error
- tabs and segmented controls
- sheets/dialogs/floating menus
- badges and status chips
- layer rows: default, selected, hidden, locked, selected+hidden
- node frames: default, selected, output path, muted, locked delete action
- node color states: at least two distinct categories selected in sequence
  (for example emoji and effect), selected+output-path, and active output edge
- Add Library: search, result row, detail preview, empty state, and default
  browse lists that show one base primitive per layer kind. Preset variants
  belong in recipes or search results unless a dedicated variant picker is
  introduced.
- inspector fields: text, number, slider, toggle, color, select

The route should use deterministic local fixtures and should not require live
network fonts, AI generation, image downloads, or user accounts.

The route itself should stay a visual reference surface. It can label
components, variants, and states, but it should not narrate implementation
plans, migration order, Playwright strategy, release gates, or agent workflow.
Keep that material in this document, `docs/version-plans/*`, or
`docs/testing.md`.

The style guide is for visible UI components and design primitives. If a person
can see a component in the app, it should either have a specimen here or be in
the active queue for one: public shell, editor shell, panels, menus, rows,
previews, overlays, empty states, error states, badges, navigation, forms,
typography, color, spacing, and state primitives. Exclude only non-visual
implementation artifacts such as providers, registries, pure logic modules, and
behavior wrappers. Large composed surfaces can appear as reduced specimens while
their behavior remains covered by browser/render tests.

The release ownership, state matrix, keyboard requirements, responsive
requirements, and five bounded source-owned patterns for the editor are closed
in the [Artifact editor-workflow inventory](editor-workflow-inventory.md).
That inventory is the contract for v0.45 and the editor-pattern dependency used
by v0.46 and v0.47. It also keeps the future Chat mode and assistant surfaces in
v0.50 rather than treating them as current editor navigation.

The v0.46 property boundary is closed in the
[Artifact inspector-system inventory](inspector-system-inventory.md). Its
source-owned `InspectorSection`, `InspectorField`, `PropertyRow`, and
`InspectorStatus` patterns are represented by ordinary and dense live
specimens. Production forms consume the contract directly through the
`artifact-inspector-*` anatomy; v0.48 removed the registered legacy selectors.

## Radix And shadcn Boundary

The project already uses the unified `radix-ui` package and source-owned UI
wrappers. For v0.30, no additional dependency is required by default.

Current v0.30 audit decision:

- Keep UI Foundation `Button` / `ButtonLink` as the canonical shared command
  primitives.
- Keep `Dialog`, `Sheet`, `Tabs`, and `FloatingMenu` as source-owned wrappers
  around Radix mechanics.
- Treat Radix/shadcn as behavior infrastructure, not as an imported visual
  system.
- Defer broad `AddLibraryPanel`, `LayerRow`, inspector field, and `NodeFrame`
  migration until after the base primitive contract has survived the v0.30
  baseline.

Use Radix/shadcn when a primitive needs accessibility or interaction mechanics:

- dialog/sheet focus trapping and aria wiring
- tabs keyboard behavior
- menu/popover positioning and dismissal
- tooltip semantics
- checkbox/switch/select keyboard behavior

Do not import default shadcn visual language into Artifact. If the shadcn CLI is
used, use it only to copy source-owned primitives into
`apps/web/app/components/ui/*`, then adapt them to Artifact tokens. Use
non-interactive commands only, such as `npx shadcn@latest add <component>`.

Libraries not needed for v0.30:

- Storybook: useful later, but Playwright plus an internal style-guide route is
  enough for the first baseline.
- Chromatic or external visual SaaS: not needed until golden screenshots become
  stable and valuable.
- New component libraries: avoid adding another visual system.

## v0.30 Migration Order

1. Inventory repeated local values in buttons, inputs, search fields, menus,
   rows, tabs, badges, and inspector controls.
2. Define the first token set for typography, control heights, focus rings, row
   heights, menu surfaces, and state colors.
3. Add the style-guide route with current primitives and known states.
4. Add Playwright coverage for the style-guide route: visible states, readable
   boxes, keyboard focus, and non-overlap checks.
5. Migrate low-risk primitives first: Foundation `Button`, `ButtonLink`, `IconButton`, `Input`,
   `SearchField`, `Badge`, `ToolbarButton`, `MenuItem`, `Panel`,
   `EmptyState`, and `PreviewFrame`.
6. Migrate shared overlays next: `Dialog`, `Sheet`, `FloatingMenu`, `Tabs`,
   keeping Radix mechanics and Artifact styling.
7. Audit visible product UI after the base controls are stable. Add specimens
   for composed surfaces and states before treating them as covered, even when
   the implementation remains feature-local.
8. Remove duplicated local class strings only after the replacement primitive
   is represented in the style guide and covered by browser checks.

## Full-App Extraction Order

After v0.30 closes the baseline, extract the rest of the app in this order:

1. **Token alias cleanup**: completed in v0.48 for the finite registered alias
   set; semantic tokens are the canonical API.
2. **Editor command surfaces**: `BottomBar`, `SiteNav`, public route CTAs, icon
   controls, and compact command groups consume Foundation `Button`,
   `ButtonLink`, and `IconButton` directly, alongside product-owned `Toolbar`
   and `SegmentedControl` compositions.
3. **Forms and inspector fields**: consolidate repeated text inputs, search
   inputs, selects, toggles, sliders, color fields, and section labels into
   product-shaped inspector primitives instead of one-off CSS blocks.
4. **Menus and overlays**: migrate layer/node context menus, Add Library menus,
   node insertion menus, projects, and info popups onto the shared
   `FloatingMenu`, `Dialog`, and `Sheet` mechanics with Artifact tokens.
5. **Rows and panels**: make `LayerRow`, area rows, project rows, Add Library
   result rows, and node property rows share explicit row tokens and state
   variants.
6. **Preview frames**: extract preview-frame chrome for canvas preview,
   thumbnails, gallery, primitive viewports, and Add Library preview surfaces
   without touching renderer semantics.
7. **Large composed surfaces**: keep `NodeCanvas`, `CanvasPreview`, `Sidebar`,
   and route pages as composed product surfaces, but ensure every visible
   control inside them comes from a primitive or documented editor primitive.

Node canvas extraction must preserve the visual contract before reducing local
CSS: category-colored node selection, visible grid dots, readable output-path
edges, hover that does not override selected state, and focused browser coverage
for React Flow selection regressions. If an extraction makes all selected nodes
share the global accent, it is a regression even if the component API is
cleaner.

Do not try to migrate the whole editor in one sweep. Each extraction pass should
have a style-guide specimen, focused browser coverage, and no renderer, graph,
export, persistence, or document-schema semantic changes unless that is the
explicit release thesis.

## Full UI Rewrite Boundary

The accepted full UI rewrite is a closed migration of every user-visible
Artifact Web and Backoffice surface onto the shared UI Foundation, the Artifact
Design System, or the Backoffice UI System. It includes tokens, primitives,
composed product patterns, route and application shells, forms, tables, Chat,
editor chrome, responsive states, accessibility behavior, and visual
conformance.

The rewrite preserves product and creative-system semantics. It does not
redesign the renderer, graph rules, `CanvasDocument`, persistence, APIs, auth,
routing contracts, or business rules. Product behavior may change only when a
visible interaction cannot meet the accepted accessibility or state contract
without a focused, explicitly approved correction.

The migration is complete only when every inventoried visible surface is
represented by the new system or is an explicitly approved non-goal. There is
no open-ended legacy bucket. Obsolete primitives, compatibility aliases, and
local CSS are removed only after their replacement surface has a live specimen
and conformance coverage.

The v0.48 expand-phase source of truth is the machine-readable
[`UI legacy registry`](ui-legacy-registry.json), with its ownership summary in
[`ui-legacy-registry.md`](ui-legacy-registry.md). The registry maps configured
routes and embedded editor inventories, names each replacement boundary, and
allows legacy counts to decrease while rejecting new callers.

## Full UI Rewrite Sequence

The rewrite proceeds through independently verifiable waves while unrelated
feature work, including further AI Chat work, remains paused:

1. Establish the UI Foundation package, Theme Contract, both Product Themes,
   and the Artifact and Backoffice Foundation Matrix routes.
2. Prove the system through the existing Artifact AI Generation composer and
   one narrow Backoffice slice without resuming AI Chat feature work.
3. Migrate all Backoffice routes and operational states.
4. Migrate Artifact public shells, projects, docs, and route-level surfaces.
5. Migrate Artifact editor commands, forms, overlays, rows, panels, and
   inspectors.
6. Migrate node-canvas, preview, and 3D chrome without changing their product or
   rendering semantics.
7. Close the inventory, remove superseded UI code and aliases, and pass the
   cross-application conformance gate before AI Chat feature work resumes.

The rewrite is planned as a sequence of releases under one UI-system program,
not as one oversized version. Each release must have one thesis, one primary
surface or risk boundary, explicit acceptance criteria, and its own validation
gate. AI-Assisted Creation remains paused through the v0.49 application-shell
and loading-boundary release. Milestones and issues are published only after
the release boundaries, ticket granularity, and blocking edges have been
approved.

The accepted release sequence is:

- **v0.42 — UI Foundation And Cross-Product Proof**: waves 1 and 2.
- **v0.43 — Backoffice UI System**: wave 3.
- **v0.44 — Artifact Product Surfaces**: wave 4.
- **v0.45 — Artifact Editor Workflows**: editor shell, commands, Layers, and Add
  Library from wave 5.
- **v0.46 — Artifact Inspector System**: property fields and inspector surfaces
  from wave 5.
- **v0.47 — Artifact Canvas Chrome**: wave 6.
- **v0.48 — UI Conformance And Legacy Removal**: wave 7.
- **v0.49 — Application Shell And Loading Boundaries**: make route ownership,
  hydration, CSS, vendor, and renderer loading boundaries measurable before
  another large product surface lands.
- **v0.50 — AI-Assisted Creation**: the paused AI release resumes only after
  the v0.49 gate.

Each UI-system milestone should contain four to eight implementation issues.
Every issue must fit one fresh implementation context, produce an independently
verifiable result, and name the acceptance criterion it closes. If a milestone
needs more than eight such issues or gains a second visual critique loop, split
the release instead of expanding the milestone. Release-gate and documentation
work may be represented by a dedicated closing issue inside that limit.

The accepted cross-release blocking edges are:

- v0.42 blocks every later UI-system release.
- v0.43 Backoffice and v0.44 Artifact Product Surfaces may be implemented in
  parallel after v0.42, although public tags remain numerically ordered.
- v0.44 blocks v0.45 because editor workflows consume the proven Artifact Theme
  and product-pattern contracts.
- v0.45 blocks v0.46 and v0.47 because inspectors and canvas chrome both
  consume the proven editor control and overlay patterns. Their implementation
  may proceed in parallel after that frontier, although tags remain numerically
  ordered.
- v0.48 is blocked by v0.43, v0.44, v0.45, v0.46, and v0.47.
- v0.48 blocks v0.49 Application Shell And Loading Boundaries.
- v0.49 blocks v0.50 AI-Assisted Creation.

Within each milestone, establish its inventory and prerequisite contract first,
allow independent migration slices to work from that frontier, and keep the
release-gate issue blocked by every slice it validates. Do not add dependencies
between slices that do not genuinely gate one another.

## Future Coverage Queue

The temporary v0.30 inventory has been folded into this permanent queue. If a
visible component is not represented in `/docs/style-guide`, it should be added
here or covered by one of the reduced composed-surface specimens below.

Already represented in `/docs/style-guide`:

- base primitives: Foundation `Button`, `ButtonLink`, `IconButton`, `Input`;
  product-owned `SearchField`,
  `Badge`, `Toolbar`, `SegmentedControl`, `Tabs`, `Dialog`, `Sheet`,
  `FloatingMenu`, `MenuItem`, `Panel`, `EmptyState`, and `PreviewFrame`
- editor primitives: `LayerRow`, `NodeFrame`, `NodeShell`,
  `EditorTargetHeader`, `NodePropertiesPanel`, Add Library search/rows/detail,
  runtime Inspector System fields, and the source-owned ordinary/dense contract
- canvas-chrome reference surfaces: reduced deterministic `NodeCanvas`,
  `CanvasPreview`, `NodeGalleryCanvas`, and `PrimitiveViewport3D` fixtures.
  Their closed state map and semantic invariants live in
  [`docs/canvas-chrome-inventory.md`](canvas-chrome-inventory.md).

High-priority follow-up specimens:

- Add Library preview loading/ready states
- AI generation panel disabled, empty, loading, and error states
- bottom command bar default, compact, and mobile states
- layer empty start, area folders, add menus, context menus, and reduced full
  layer panel states
- node add/context/pane menus, node editor panel, and expanded node thumbnail
  states beyond the locked canvas-chrome reduced fixtures
- projects list, empty, selected, and import states
- sidebar collapsed, expanded, and active-section states

Medium-priority follow-up specimens:

- `LayerControls` layer-kind matrix
- error boundary recovery states
- effect info popup compact and long-copy states
- public footer, brand mark, and public media components
- color/effect/export/layer/merge/port/repeat inspector variants
- `ParentalAdvisoryBadge`
- site navigation desktop, mobile, and active-route states

Large composed surfaces still need reduced specimens plus behavior coverage:

- `BottomBar`
- `Sidebar`

Intentionally excluded from style-guide specimens:

- providers such as `ArtifactAuthProvider`
- behavior wrappers such as `NoPan`
- registries/composition files such as `NodeTypes`

## Review Checklist

- Does this component use shared tokens for reusable size, color, focus, and
  state?
- Is the state visible in the style-guide route?
- Is the primitive API product-shaped and explicit?
- Are Radix/shadcn mechanics source-owned and styled with Artifact tokens?
- Did the change avoid renderer, graph traversal, export, persistence, and
  document-schema changes?
- Did focused browser coverage run for the affected style-guide/editor states?
- For node canvas changes, did the change preserve category-colored selection,
  output-path contrast, grid readability, and React Flow stability?

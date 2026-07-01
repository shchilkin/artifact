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
| Product-shaped primitives | Prefer `ActionButton`, `SearchField`, `Panel`, `LayerRow`, `NodeFrame`, and `InspectorField` over generic wrappers that callers restyle each time. |
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

### Base UI Primitives

These live under `apps/web/app/components/ui/*` and should be reused across
public and editor surfaces:

- `ActionButton` / `ActionLink`
- `IconButton`
- `Input`
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
- Legacy short aliases such as `--bg`, `--border`, `--accent`, `--text`, and
  `--mono` still exist in `apps/web/app/index.css` as compatibility aliases for
  large editor CSS surfaces, but new shared primitives should not depend on
  them.
- `ActionButton`, `IconButton`, `Input`, `SearchField`, `Badge`, `Toolbar`,
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

## Radix And shadcn Boundary

The project already uses the unified `radix-ui` package and source-owned UI
wrappers. For v0.30, no additional dependency is required by default.

Current v0.30 audit decision:

- Keep `ActionButton` / `ActionLink` as the canonical shared command primitive.
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
5. Migrate low-risk primitives first: `ActionButton`, `IconButton`, `Input`,
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

1. **Token alias cleanup**: keep semantic tokens as the canonical API, keep
   short aliases only as a temporary compatibility layer, and remove new
   references to short aliases from shared primitives.
2. **Editor command surfaces**: migrate `BottomBar`, `SiteNav`, public route
   CTAs, icon controls, and compact command groups to `ActionButton`,
   `IconButton`, `Toolbar`, and `SegmentedControl` variants.
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

## Future Coverage Queue

The temporary v0.30 inventory has been folded into this permanent queue. If a
visible component is not represented in `/docs/style-guide`, it should be added
here or covered by one of the reduced composed-surface specimens below.

Already represented in `/docs/style-guide`:

- base primitives: `ActionButton`, `IconButton`, `Input`, `SearchField`,
  `Badge`, `Toolbar`, `SegmentedControl`, `Tabs`, `Dialog`, `Sheet`,
  `FloatingMenu`, `MenuItem`, `Panel`, `EmptyState`, and `PreviewFrame`
- editor primitives: `LayerRow`, `NodeFrame`, `NodeShell`,
  `EditorTargetHeader`, `NodePropertiesPanel`, Add Library search/rows/detail,
  and inspector field primitives

High-priority follow-up specimens:

- Add Library preview loading/ready states
- AI generation panel disabled, empty, loading, and error states
- bottom command bar default, compact, and mobile states
- canvas handles for selected, locked, and hidden layers
- canvas preview frame with deterministic content
- layer empty start, area folders, add menus, context menus, and reduced full
  layer panel states
- graph area overlay, node add/context/pane menus, node canvas, node gallery,
  node editor panel, and node thumbnail states
- projects list, empty, selected, and import states
- sidebar collapsed, expanded, and active-section states

Medium-priority follow-up specimens:

- `LayerControls` layer-kind matrix
- error boundary recovery states
- effect info popup compact and long-copy states
- public footer, brand mark, and public media components
- color/effect/export/layer/merge/port/repeat inspector variants
- `ParentalAdvisoryBadge`
- primitive viewport chrome
- site navigation desktop, mobile, and active-route states

Large composed surfaces still need reduced specimens plus behavior coverage:

- `CanvasPreview`
- `node-canvas/NodeCanvas`
- `NodeGalleryCanvas`
- `PrimitiveViewport3D`
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

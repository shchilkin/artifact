# Artifact Style Guide

This is the project style guide for UI work. Read it before implementing,
refactoring, or reviewing user-facing UI. The live Artifact specimen route is
`/docs/style-guide`; the cross-product Foundation Matrix also appears in
Backoffice at `/style-guide`. Artifact tokens live in
`apps/web/app/styles/tokens.css`, its UI Foundation Theme Contract mapping lives
in `apps/web/app/styles/ui-foundation-theme.css`, cross-product primitives live
in `packages/ui`, and Artifact-specific UI components live in
`apps/web/app/components/ui/*`.

This document follows a standard design-system shape: principles, tokens,
component contracts, layout rules, content style, and implementation rules. It
is inspired by component-first documentation such as Shopify's App Home Web
Components and token-first systems such as Material Design 3.

## 1. Design Principles

### Product Feel

Artifact should feel like a compact creative studio for covers, posters, type,
textures, effects, layers, and nodes. The UI should be:

- **Deliberate**: every visible control has a job.
- **Tactile**: warm dark surfaces, mono labels, hairline borders, print-like
  framing, and clear state marks.
- **Creative but controlled**: expressive output belongs to the user; the
  interface provides tools, not a prescribed final look.
- **Low-chrome**: the editor should feel like a mixing board, not a corporate
  dashboard.
- **Precise**: states, focus, selection, locking, hidden content, and output
  paths must be readable without guessing.

### Avoid

- Generic SaaS look: soft cards, neutral admin panels, table-first management
  screens, generic blue/purple accents.
- Random gradients, decorative glows, glass panels, and visual effects in UI
  chrome.
- Inconsistent shadows or resting elevation. Use flat tonal surfaces and
  borders first.
- Oversized cards that make editing feel like browsing marketing tiles.
- Tiny labels or controls that become the standard by accident.
- Copy that explains internal agent workflow, migration plans, test strategy,
  release gates, or implementation commentary on app surfaces.

## 2. Design Tokens

Use tokens, not raw values, when a visual choice can repeat. Raw values are
allowed only for one-off artwork, renderer fixtures, or component-specific
geometry that is not a reusable UI rule.

### Token Source

- CSS tokens: `apps/web/app/styles/tokens.css`
- UI Foundation Theme mapping:
  `apps/web/app/styles/ui-foundation-theme.css`
- UI Foundation semantic contract: `packages/ui/src/theme-contract.ts`
- Live token specimens: `/docs/style-guide`
- Feature CSS may define feature-specific aliases, but it should map back to
  semantic tokens when possible.

### Colors

| Role | Token |
| --- | --- |
| Background | `--surface-app` |
| Workspace background | `--surface-workspace` |
| Surface | `--surface-panel` |
| Raised surface | `--surface-panel-raised` |
| Card or framed item | `--surface-card` |
| Control surface | `--surface-control` |
| Control hover | `--surface-control-hover` |
| Selected surface | `--surface-control-selected` |
| Border muted | `--line-muted` |
| Border default | `--line-default` |
| Border strong | `--line-strong` |
| Text | `--text-primary` |
| Muted text | `--text-secondary` |
| Disabled or secondary meta | `--text-muted` |
| Primary | `--accent-primary` |
| Primary soft | `--accent-soft` |
| Danger | `--state-danger` |
| Success | `--state-success` |
| Warning | `--state-warning` |

Editor graph color roles:

| Role | Token |
| --- | --- |
| Node fill | `--node-kind-fill` |
| Node image | `--node-kind-image` |
| Node text | `--node-kind-text` |
| Node emoji | `--node-kind-emoji` |
| Node effect | `--node-kind-effect` |
| Node primitive/model/3D | `--node-kind-primitive` |
| Node noise | `--node-kind-noise` |
| Node array/repeat/line field | `--node-kind-array` |
| Node merge | `--node-kind-merge` |
| Node color/transform/environment | `--node-kind-color` |
| Node export | `--node-kind-export` |
| Node canvas grid dot | `--editor-grid-dot` |
| Node output path | `--node-edge-output` |

Node category colors are semantic editor state. Use them for graph scanning,
not decoration. A selected node's frame, focus outline, rail, and leading
shadow must resolve to that node's category token; do not substitute
`--accent-primary` or `--editor-selection-outline` for all node kinds.

### Spacing

Use the shared scale:

| Token | Value | Use |
| --- | --- | --- |
| `--space-1` | `4px` | hairline gaps, tight icon spacing |
| `--space-2` | `8px` | compact row gaps |
| `--space-3` | `12px` | field gaps, menu padding |
| `--space-4` | `16px` | default panel padding |
| `--space-6` | `24px` | section groups |
| `--space-8` | `32px` | route blocks, major panel separation |
| `--space-12` | `48px` | page rhythm, section separation |

Do not invent `10px`, `14px`, `18px`, `22px`, or `28px` as new standards.
Those may remain in legacy feature CSS temporarily, but new shared primitives
should use the scale above.

### Radius

Artifact uses crisp, low-radius geometry. Square corners are part of the print
language for artwork frames, hard panels, crop marks, and node housings, but
the system should not force radius 0 onto every interactive control. Buttons,
inputs, chips, menus, and overlays may use 2–6px radius when it improves
affordance, focus readability, or touch feel.

| Token | Value | Use |
| --- | --- | --- |
| `--radius-sm` | `0` | artwork frames, crop marks, hard panels, node housings |
| `--radius-md` | `2px` | compact buttons, chips, tight controls |
| `--radius-lg` | `4px` | inputs, menus, sliders, repeated rows |
| `--radius-xl` | `9px` | rare pill-like native affordances |

Do not round cards, panels, or navigation just to make them feel friendly. Use
radius because it improves interaction clarity, not because the surface looks
too severe.

### Typography

| Role | Token | Use |
| --- | --- | --- |
| Readable UI family | `--font-body` | layer names, inspector descriptions, empty states, route copy |
| Mono family | `--font-mono` | Space Mono for control labels, commands, node labels, ids, meta |
| Display family | `--font-display` | page and section headlines |
| UI XS | `--type-ui-xs` | dense meta, badge text |
| UI SM | `--type-ui-sm` | buttons, labels |
| UI MD | `--type-ui-md` | input values, body in panels |
| Editor label | `--type-editor-label` | node labels, inspector labels, add-library row labels |
| Editor meta | `--type-editor-meta` | compact badges, section summaries, hints |
| Body | `--type-body` | route copy, readable descriptions, empty states |
| Title | `--type-title` | compact section titles |
| Display | `--type-display` | major page titles |
| UI line | `--leading-ui` | compact controls |
| Body line | `--leading-body` | paragraphs |
| Tight line | `--leading-tight` | display type |
| UI weight | `--weight-ui` | labels and controls |
| Strong weight | `--weight-strong` | selected or primary labels |
| Display weight | `--weight-display` | display headings |

Mono is the control grammar, not the paragraph voice. Use Space Mono for commands,
labels, node names, ids, field keys, and short values. Use readable sans for
long descriptions, onboarding, empty states, error recovery, and dense
explanatory panels. Display type is reserved for real titles, not controls.
Avoid making dense editor labels smaller than 10px or tracking them beyond
0.1em by default; over-tracked microcopy slows scanning.

### Elevation

Layered by default.

| Token | Use |
| --- | --- |
| `--shadow-none` | resting surfaces |
| `--shadow-focus` | focused controls when outline needs support |
| `--shadow-overlay` | dialogs, sheets, and anchored floating menus |

Do not add soft generic resting card shadows. Use tonal surfaces and borders
first; reserve shadows for overlays, focus support, selected graph objects,
and drag states where separation is functional.

### Motion

| Token | Value | Use |
| --- | --- | --- |
| `--motion-fast` | `120ms` | hover and focus feedback |
| `--motion-base` | `180ms` | panels, menus, common transitions |
| `--motion-slow` | `260ms` | route-level or heavier surface motion |
| `--ease-standard` | cubic bezier standard |
| `--ease-out` | ease-out for UI reveal |
| `--ease-emphasized` | stronger reveal for overlays |

Do not animate layout properties. Respect reduced motion.

## 3. Component Rules

Every visible UI component should either have a specimen in `/docs/style-guide`
or be listed in the future coverage queue in `docs/editor-design-system.md`
until the migration is complete.

### Button

- **Anatomy**: label, optional icon, optional loading indicator.
- **Variants**: primary, secondary, quiet, danger, icon-only.
- **States**: default, hover, active, focus-visible, disabled, loading.
- **Accessibility**: 44px minimum target for touch workflows; visible focus;
  icon-only buttons require an accessible label.
- **Usage**: commands such as Open editor, Export, Save, Delete, Close.
- **Anti-patterns**: vague labels, icon-only without label, custom one-off
  button geometry, nested links/buttons.

### Input

- **Anatomy**: label, field, value, optional hint, optional error.
- **Variants**: text input, search field, textarea, color input.
- **States**: default, hover, focus-visible, disabled, error, readonly.
- **Accessibility**: every input has an accessible name; error text is tied to
  the control where practical.
- **Usage**: editable text, search, numeric values that need exact entry.
- **Anti-patterns**: placeholder as the only label, local border colors, tiny
  text below readable size.

### Select

- **Anatomy**: label, trigger, value, menu, options.
- **Variants**: native select first; custom select only when keyboard behavior
  or menu styling requires it.
- **States**: default, hover, focus-visible, disabled, error.
- **Accessibility**: keyboard navigation, readable current value, clear label.
- **Usage**: blend modes, aspect ratios, export format, finite option sets.
- **Anti-patterns**: custom select for decoration, options that require long
  explanatory copy, hidden labels.

### Card

- **Anatomy**: frame, optional media, title, metadata, action.
- **Variants**: product tile, specimen frame, preview frame.
- **States**: default, hover, selected, disabled, loading.
- **Accessibility**: if clickable, the whole card must have a clear link or
  button target and visible focus.
- **Usage**: showcase tiles, style-guide specimens, project rows that benefit
  from framing.
- **Anti-patterns**: generic card grids, nested cards, card wrappers around
  full page sections, resting shadows.
- **Project libraries**: use artwork-first tiles. The preview carries the
  surface; metadata, status, and actions sit below or beside it with lower
  visual weight. Do not wrap a project grid in another card-like frame.

### Modal

- **Anatomy**: overlay, surface, title, description, body, actions, close.
- **Variants**: dialog, sheet, anchored menu when a full modal is not needed.
- **States**: closed, opening, open, closing, error, loading.
- **Accessibility**: focus trap, escape close when safe, labelled dialog,
  focus return to trigger.
- **Usage**: destructive confirmation, contained workflows, project/preset
  panels when inline space is not enough.
- **Anti-patterns**: modal as the first solution, hidden close path, long
  scrolling forms inside small dialogs.

### Tabs

- **Anatomy**: tab list, trigger, active indicator, panel.
- **Variants**: route-like view switch, panel section switch.
- **States**: default, hover, active, focus-visible, disabled.
- **Accessibility**: keyboardable tablist, active tab announced, panel linked
  to trigger.
- **Usage**: Layers/Nodes, docs sections, compact panel switching.
- **Anti-patterns**: tabs for unrelated navigation, too many triggers, hidden
  panels that should be routes.

### Node Canvas

- **Anatomy**: graph background, dot grid, nodes, ports, edges, active output
  path, toolbar, inspector, optional graph areas.
- **Variants**: default graph, selected node, selected edge, output path, muted
  node, locked delete state, graph area, jump-to-output view.
- **States**: default, hover, focus-visible, selected, output-path,
  selected+output-path, muted, locked, dragging, invalid connection.
- **Accessibility**: node frames and toolbar controls need visible focus;
  icon-only graph controls need accessible labels; selected state cannot rely
  on color alone when text or state labels are available.
- **Usage**: editing graph structure, reading composition flow, navigating to
  the final render path.
- **Color contract**: category color identifies node kind; output-path color
  identifies route; global accent identifies product commands. Keep those three
  roles separate.
- **Grid contract**: grid dots must be visible on the workspace at normal zoom,
  but lower contrast than node borders and output edges.
- **Anti-patterns**: one global red/orange selected frame for every node kind,
  invisible grids, hover styles that override selected styles, decorative edge
  glow that makes topology harder to read, node toolbars split into floating
  cards.

### Navigation

- **Anatomy**: brand, primary links, primary action, account action, mobile
  menu trigger.
- **Variants**: solid public nav, transparent showcase/landing nav, compact
  editor nav.
- **States**: default, active route, hover, focus-visible, mobile open,
  disabled account action.
- **Accessibility**: `nav` landmark, labelled mobile trigger, keyboard access,
  visible focus.
- **Usage**: public routes, docs routes, editor shell.
- **Anti-patterns**: fake nav buttons in page headers, duplicated nav patterns,
  hiding the primary editor CTA.

### Empty State

- **Anatomy**: short title, one useful action, optional compact support text.
- **Variants**: blank canvas, no search results, no projects, no target
  selected.
- **States**: default, loading, error recovery.
- **Accessibility**: action is a real button/link, copy is readable.
- **Usage**: make the next action obvious.
- **Anti-patterns**: marketing copy, internal implementation notes, multiple
  competing CTAs.

### Toast / Alert

- **Anatomy**: status icon or label, message, optional action, dismiss.
- **Variants**: info, success, warning, danger.
- **States**: entering, visible, dismissed, action pending.
- **Accessibility**: appropriate live region, keyboard dismiss, persistent
  critical errors.
- **Usage**: save/export feedback, recoverable errors, background task status.
- **Anti-patterns**: toast for information the user must act on, disappearing
  destructive errors, vague messages.

### Form Layout

- **Anatomy**: section, label, control, hint, error, grouped actions.
- **Variants**: inspector field stack, modal form, sidebar form.
- **States**: default, dirty, validating, error, disabled, loading.
- **Accessibility**: labels before controls, logical tab order, visible focus,
  keyboard submission where appropriate.
- **Usage**: settings, export options, effect controls, project metadata.
- **Anti-patterns**: unlabeled controls, full-width fields without rhythm,
  action buttons separated from their form context.

## 4. Layout Rules

- **Max content width**: docs and style-guide pages use a wide shell capped near
  `1680px`; readable copy stays under `65-75ch`.
- **Grid behavior**: use auto-fit grids for component catalogs; specimens
  should fill available content width instead of being trapped in half-columns.
- **Page padding**: use `--space-4` on small screens, `--space-8` to
  `--space-12` on desktop.
- **Mobile behavior**: mobile is not a squeezed desktop. Stack sections, keep
  controls 44px minimum, and avoid fixed rails inside docs specimens.
- **Vertical rhythm**: use section gaps from the spacing scale. Dense editor
  panels may be tighter, but route pages need breathing room.
- **Cards vs flat sections**: use cards only for repeated items, specimens,
  modals, and framed tools. Page sections should be flat bands or unframed
  layouts.

## 5. Content Style

- **Button labels**: verb first, short, specific. Prefer `Open editor`,
  `Export`, `Save project`, `Delete`, `Close`.
- **Error messages**: name what failed and give the next action. Avoid blame.
- **Empty states**: one clear next action. No internal process copy.
- **Capitalization**: UI labels use concise title/sentence case where useful;
  mono meta and badges may use uppercase when visually intentional.
- **Tone**: direct, tactile, product-facing. Do not judge the user's whole
  output. Describe materials, controls, and workflow.
- **Banned public copy**: agent workflow, migration notes, QA strategy, release
  notes, test names, and broad labels that characterize the final work as a
  whole.

## 6. Implementation Rules

1. Never use hardcoded colors when a semantic token exists.
2. Never invent new spacing values unless the value is truly component-specific
   geometry and documented.
3. Prefer existing components before creating new ones.
4. Every new visible component needs states and responsive behavior.
5. Every interactive component must be keyboard accessible.
6. Every icon-only control needs an accessible label.
7. Every new or changed visible component should get a `/docs/style-guide`
   specimen or be added to the active inventory queue.
8. Use Radix/shadcn mechanics only as source-owned accessibility behavior.
   Artifact tokens define the visual language.
9. Internal plans and implementation notes belong in `docs/`, not in app
   surfaces.
10. UI changes that affect layout, overlays, menus, focus, or responsive
    behavior need focused browser verification.
11. Node canvas visual changes need browser coverage for category-colored
    selection, output-path visibility, grid readability, and absence of
    React/React Flow update loops.

## 7. Output Checklist

- Written style guide: `docs/style-guide.md`
- Token source: `apps/web/app/styles/tokens.css`
- Live specimens: `/docs/style-guide`
- Shared UI components: `apps/web/app/components/ui/*`
- Future component coverage queue: `docs/editor-design-system.md`
- Storybook: not installed. Use the internal route and Playwright until the
  style-guide route becomes too large or needs external design review.

## References

- Shopify App Home Web Components:
  `https://shopify.dev/docs/api/app-home/web-components`
- Material Design 3 design tokens:
  `https://m3.material.io/foundations/design-tokens`

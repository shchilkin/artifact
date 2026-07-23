# Artifact Editor Workflow Inventory

Status: accepted contract for v0.45 implementation.

This inventory closes the visible editor-workflow boundary for
[v0.45 Artifact Editor Workflows](version-plans/v0.45.md). It assigns every
current editor surface to the release that owns its visual-system migration and
defines the shared patterns that v0.46 and v0.47 may consume.

The migration changes visible anatomy, states, responsive behavior, focus, and
overlay mechanics only. It must not change document commands, graph rules,
history, rendering, export, persistence, routing, account policy, or AI
orchestration.

## Assignment Rules

- **v0.45** owns the existing editor shell, command surfaces, Layers workflow,
  and Add Library workflow.
- **v0.46** owns property-editing and inspector content. v0.45 may establish the
  surrounding rail and target-header anatomy, but not migrate the fields below
  it.
- **v0.47** owns canvas, graph, preview, thumbnail, gallery, and 3D workspace
  chrome. v0.45 may preserve integration with these surfaces, but must not
  restyle their interaction chrome.
- **v0.49** owns the future Chat mode, Context Assistant, Change Preview, and
  new AI-assisted creation surfaces. v0.45 must not add a Chat tab or resume AI
  feature work.
- A surface already migrated in v0.44 keeps its product-pattern ownership.
  v0.45 owns only its placement and command integration inside the editor.
- Compatibility selectors and aliases stay until the v0.48 conformance and
  legacy-removal gate.

The current editor has two peer modes, `Layers` and `Nodes`. `Chat` is not a
current editor mode. References to `Chat / Layers / Nodes` describe the v0.49
product contract, not a v0.45 navigation requirement.

## Closed Surface Inventory

### Editor shell and commands

| Visible surface | Included states and actions | Release assignment |
| --- | --- | --- |
| Compact site header, Artifact brand link, and editor chrome slot | default, narrow, focus-visible, long available command label | **v0.45 E2** |
| `Layers / Nodes` mode navigation | Layers active, Nodes active, hover, focus-visible, keyboard navigation, narrow layout | **v0.45 E2** |
| Documentation-import status banner | imported, dismissible, focus-visible dismiss command, wrapped copy | **v0.45 E2** |
| Local-storage warning strip | unavailable, degraded/error, recovered or absent | **v0.45 E2** |
| Editor-level file or operation feedback | informational, validation error, recoverable error, dismissible where supported | **v0.45 E2** |
| Bottom command bar | new, undo, redo, randomize, open, share, more, projects, export | **v0.45 E2** |
| Bottom command states | default, compact, mobile, disabled undo/redo, history count, export busy/disabled, copied share link | **v0.45 E2** |
| Share and overflow menus | open, active item, disabled item, keyboard traversal, Escape/outside dismiss, focus return | **v0.45 E2** |
| File drop rail | document, image, font/file, accepted, rejected, narrow | **v0.45 E2** |
| Document import confirmation | ready, saving/busy, cancel, confirm, keyboard focus order, narrow | **v0.45 E2** |
| Projects trigger and editor sheet placement | closed, open, active trigger, mobile | **v0.45 E2 integration**; Projects list/content remains the v0.44 Product Library pattern |
| Left and right editor rails | collapsed, expanded, mobile sheet, active side | **v0.45 E2 shell** |
| Inspector target header inside the right rail | default, compact, minimal, long target name | **v0.45 E2 anatomy** |
| Inspector sections, property fields, validation, and committed/live controls | all layer, graph, effect, material, scene, shader, and AI Shader property variants | **v0.46** |
| Existing AI Image generation panel in the right rail | prompt/provider controls, disabled, empty, loading, success, error, recovery | **v0.46 visual integration**; existing generation behavior remains unchanged |

`BottomBar`, the compact header, and rail placement keep their existing command
handlers and visibility rules. Their migration must not move ownership of undo,
redo, export, project, document-import, or storage behavior into UI patterns.

### Layers workflow

| Visible surface | Included states and actions | Release assignment |
| --- | --- | --- |
| Layers panel header | title, aspect-ratio trigger/menu, Add trigger, focus-visible, narrow | **v0.45 E3** |
| Empty layer-panel start | empty copy and existing add/start actions | **v0.45 E3** |
| Empty canvas start | image, text, existing AI shortcut, noise, starter recipes, help/showcase links | **v0.45 E3**; new AI behavior is **v0.49** |
| Layer row | default, selected, hidden, locked, selected+hidden, nested, long name, inline rename, drag, drop-before, drop-after | **v0.45 E3** |
| Layer row metadata | kind, hidden/locked status, area membership, existing AI loading/error/history badges | **v0.45 E3 visual migration** |
| Layer row actions | select, rename, show/hide, lock display, duplicate, delete, More menu | **v0.45 E3** |
| Scene 3D layer row | default, selected, locked, keyboard selection, remove where allowed | **v0.45 E3** |
| Graph-helper row shown in Layers | kind, label, nested placement, remove | **v0.45 E3** |
| Layer context menu | rename, show/hide, duplicate, delete, disabled locked actions, area actions | **v0.45 E3** |
| Multi-selection command bar | selected count, create area, add to area, remove from area, clear selection | **v0.45 E3** |
| Area/folder group | expanded, collapsed, empty, count, rename, visibility, remove, nested rows | **v0.45 E3** |
| Reordering and organization feedback | drag handle, allowed/blocked drag, before/after target, move into/out of area | **v0.45 E3** |
| Layer property content opened by selection | fields, sections, errors, disabled/locked editing, live/commit gestures | **v0.46** |
| Direct manipulation of the selected layer on the preview | handles, locked/hidden handles, pointer targets, drop overlay | **v0.47** |
| New scoped Layer assistant | invocation, context scope, progress, proposal, Change Preview | **v0.49** |

The layer migration preserves selection, multi-selection, rename, reorder,
visibility, lock, duplicate, delete, area organization, and undo behavior. A
visual pattern may call an existing document command; it must not replace or
redefine that command.

### Add Library workflow

| Visible surface | Included states and actions | Release assignment |
| --- | --- | --- |
| Layers Add Library trigger and anchored surface | closed, open, active trigger, collision handling, narrow/mobile | **v0.45 E4** |
| Nodes Add Library trigger and desktop/mobile container | floating menu, mobile sheet, open/close, focus return | **v0.45 E4** |
| Browse start | favorites, recent, popular, intent groups, kind groups | **v0.45 E4** |
| Search and filters | empty query, query, active intent, active group, recipe scope, reset | **v0.45 E4** |
| Results and rows | default, active, favorite, draggable, long label, keyboard active result | **v0.45 E4** |
| Empty search result | no matches, clear/reset action where supported | **v0.45 E4** |
| Detail pane | no selection, selected item, tags, description, add/insert action | **v0.45 E4** |
| Preview | loading, ready, deterministic fallback, failed | **v0.45 E4** |
| Insert into Layers | click/Enter insert, focus outcome, unchanged document command | **v0.45 E4** |
| Insert or drag into Nodes | click/Enter insert, drag payload, unchanged graph command | **v0.45 E4** |
| Node-canvas drop-target feedback | valid/invalid target and canvas placement chrome | **v0.47** |
| AI-generated source types or assistant-authored library flows | waiting, generation, recovery, provenance, proposal | **v0.49** |

Add Library remains an Artifact product pattern rather than a generic command
palette. Its specimens must use injected local fixtures for favorites, recent
items, preview outcomes, and search results; they must not depend on
`localStorage`, accounts, network assets, AI providers, or live rendering
timing.

### Canvas, graph, preview, gallery, and 3D

| Visible surface | Included states and actions | Release assignment |
| --- | --- | --- |
| Canvas preview frame and error/recovery frame | loaded, transparent, empty, error, recovery | **v0.47** |
| Canvas selection and transform chrome | selected, locked, hidden, pointer/keyboard manipulation | **v0.47** |
| Node-canvas toolbar and React Flow controls | add, layout, output, metrics, area, account, pan/zoom | **v0.47** |
| Graph viewport | grid, selection, output path, areas, drop targets, empty graph | **v0.47** |
| Node and edge housings | default, selected, muted, output path, locked, connected ports, invalid connection | **v0.47** |
| Node, edge, and pane context menus | open, disabled, keyboard, collision, mobile | **v0.47** |
| Node thumbnails and gallery | loading, ready, failed, selected, full gallery, narrow | **v0.47** |
| Existing AI generation status over node thumbnails | loading, error, history/current badge | **v0.47 visual integration**; existing generation behavior remains unchanged |
| Primitive and Scene 3D viewport chrome | active, locked, reset, camera controls, keyboard controls | **v0.47** |
| Node property panels reached from canvas selection | all property controls and validation | **v0.46** |
| Scoped Node assistant and transient assistant projections | scope, progress, proposal, Change Preview | **v0.49** |

v0.45 may compose Add Library inside the node toolbar or pane menu, but the
surrounding canvas toolbar, context-menu, and drop-target chrome remains v0.47.

### AI-assisted creation

The existing AI generation command, existing layer AI status badges, and
already-shipped generation feedback remain visible and receive only the
v0.45 pattern conformance needed by their current host surface. The following
new surfaces are exclusively **v0.49**:

- full-screen Chat mode and the third `Chat` navigation tab;
- Chat history, messages, Run progress, cancellation, retry, and recovery;
- Creative Direction and Composition creation flows;
- Change Preview, Apply, Discard, conflict, and stale-revision states;
- explicitly invoked whole-document Context Assistant;
- scoped Layer, Node, selection, and area assistant flows;
- assistant drawers, temporary editor projections, and return-to-Chat
  continuity.

## Source-Owned Pattern Boundaries

These five patterns are the only shared editor-pattern extraction required by
the v0.45 contract. They consume UI Foundation primitives and Artifact tokens.
They own visible anatomy and interaction mechanics, not product state or
commands.

### 1. `EditorCommandBar` and `EditorCommandGroup`

Owns command grouping, labels, separators, density, wrapping/overflow slots,
and accessible toolbar semantics. It composes `ActionButton`, `IconButton`, and
menu primitives. `BottomBar`, compact navigation commands, and Layers header
commands keep their current handlers, permissions, loading rules, and
responsive visibility decisions.

Required states: default, compact, mobile, disabled command, loading command,
active menu trigger, count/status badge, and overflowed group.

### 2. `EditorRowFrame`

Owns the structural row anatomy: leading drag/kind affordance, primary
label/editor, metadata/status, trailing actions, and row-level state
attributes. `LayerRow`, Scene 3D rows, graph-helper rows, and Add Library rows
remain separate domain compositions.

Required states: default, selected, hidden, locked, selected+hidden, disabled,
nested, editing, dragging, drop-before, drop-after, active keyboard result, and
long-name truncation.

### 3. `EditorOrganizationGroup`

Owns disclosure, group heading, count/status area, group actions, and nested
content anatomy. Area membership, rename, visibility, delete, and reorder
remain layer-domain operations.

Required states: expanded, collapsed, empty, selected content, hidden content,
editing name, disabled action, drag-over, and narrow.

### 4. `EditorWorkflowNotice`

Owns status/error anatomy by composing `InlineNotice` with optional action and
dismiss slots. It is used for documentation-import status, storage warnings,
file/operation errors, and recoverable workflow feedback. Error ownership and
recovery behavior stay with the calling feature.

Required states: informational, warning, error, success/recovered where
supported, busy, actionable, dismissible, multiline, and narrow.

### 5. `EditorOverlayFrame`

Owns anchored-menu or nonmodal-dialog mechanics: accessible naming, initial
focus, focus containment where appropriate, Escape/outside dismissal, trigger
focus return, collision handling, layering, and the mobile-sheet substitution.
It composes the source-owned Radix-backed `FloatingMenu`, `Dialog`, `Sheet`, and
menu primitives. Add Library, layer menus, share/overflow menus, and import
confirmation retain their product-specific content and commands.

Required states: closed, open, keyboard-opened, pointer-opened, busy,
disabled item, nested or scoped view, collision-adjusted, and mobile sheet.

No pattern may accept a generic command callback that bypasses the existing
document, graph, history, renderer, export, persistence, or account boundary.

## Conformance Requirements

### State and specimens

Every v0.45 row, command group, organization group, notice, and overlay state
listed above must appear as a deterministic reduced specimen on
`/docs/style-guide`. Composed specimens may cover several states together, but
each state needs a stable specimen identifier and visible label.

Specimens must not read persisted user data, require a signed-in account, wait
on network or AI work, or depend on nondeterministic renderer timing. Add
Library preview fixtures must be able to force loading, ready, fallback, and
failed outcomes.

### Keyboard and focus

- Tabs use arrow-key navigation and expose the active mode.
- A focusable editor row supports Enter or Space for its primary selection
  action; its menu is separately reachable and named.
- Rename supports Enter to commit and Escape to cancel without losing the
  surrounding selection unexpectedly.
- Menus and Add Library support arrow navigation, Home, End, Enter, and Escape
  as appropriate.
- Add Library Escape first clears a scoped search/filter view when applicable;
  a subsequent Escape closes the overlay.
- Closing a menu, sheet, dialog, or Add Library returns focus to its trigger
  unless the completed command intentionally moves focus to the created item.
- Disabled and locked actions remain discoverable where useful but cannot be
  invoked by pointer or keyboard.
- Focus-visible treatment is never communicated by color alone and is not
  clipped by rows, rails, or overlay containers.

### Responsive and overflow

- The shell, command bar, Layers panel, notices, and overlays must work at the
  existing desktop, intermediate, and 390-pixel mobile browser-test widths.
- Commands may move into an explicitly labeled overflow menu; they must not
  disappear without an equivalent reachable action.
- Long names and messages wrap or truncate within their owning surface without
  causing horizontal document overflow.
- Anchored overlays remain inside the viewport. Mobile variants use the
  source-owned sheet behavior where an anchored surface is no longer usable.
- The bottom command bar does not overlap node controls, sidebars, safe-area
  insets, or the active creative workspace.
- Drag affordances have a non-drag keyboard path for the same resulting
  command when the current product workflow supports one.

## Acceptance-Test Seams

Use the lowest layer that proves the contract:

- pure tests cover Add Library scope/reset/navigation state, deterministic
  favorites and recents, preview outcome mapping, layer selection, and reorder
  helpers;
- style-guide browser coverage checks the closed specimen matrix, focus
  geometry, overlay bounds, and horizontal overflow at desktop and mobile
  widths;
- focused editor browser coverage checks mode navigation, command disabled and
  busy states, menu dismissal/focus return, import confirmation, Layer
  keyboard selection and rename, organization/reorder plus undo, and Add
  Library insertion from both launchers;
- existing document, graph, renderer, export, persistence, and node-editor
  behavior tests remain the compatibility proof and must not be replaced by
  visual snapshots.

v0.45 is not complete while any surface in this inventory lacks its assigned
specimen or focused behavior seam, or while a v0.46, v0.47, or v0.49 surface has
been pulled forward without an explicit plan change.

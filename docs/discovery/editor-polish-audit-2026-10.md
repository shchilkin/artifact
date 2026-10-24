# Editor Polish Audit — v0.50.0 (2026-10)

Status: discovery. This document records findings only. It is not release
scope until a version plan adopts items with acceptance criteria
(see [`../version-planning.md`](../version-planning.md)).

- Build audited: `development` at `3c0f828c` (v0.50.0 plus release evidence),
  production build (`npm run build`) served from `apps/web/build/client` with
  `vite preview`, the way `scripts/preview-server.mjs` does.
- Driven with Playwright (Chromium) at 1440×900, 1024×768, 768×1024 and
  375×812 (mobile emulation with touch), plus a `prefers-reduced-motion: reduce`
  pass.
- Theme: the editor is dark only. No light theme exists, so none was audited.
- Method: two independent assessments, then a synthesis with browser evidence.
  - A: a design review of the source and the docs.
  - B: the Impeccable detector plus the Vercel Web Interface Guidelines
    applied to editor files.
  - The browser walkthrough was done separately. Its claims were re-checked in
    the running build where possible. Items that come only from source review
    say so.
- Fixtures:
  - the default document;
  - an "all kinds" document (fill, image, noise, primitive, emoji, text, Glitch
    and Bloom presets);
  - the Layers tree fixture (`tests/browser/layersTreeFixture.ts`);
  - an empty document.
- Screenshots live in [`editor-polish-2026-10/`](editor-polish-2026-10/).

## 1. Summary — the five problems that most affect how the editor feels

1. **Nodes can open as an unreadable or broken picture.**
   - The custom graph in the Layers tree fixture opens with nodes stacked on
     top of each other ([15](editor-polish-2026-10/15-nodes-custom-graph-overlap.png),
     [16](editor-polish-2026-10/16-edit-in-nodes-overlap.png)).
   - The *Glow* merge node is completely covered by *Cutout* and cannot be
     clicked. Edges run underneath the cards.
   - On the default document, "fit on entry" shrinks seven nodes until their
     headers can't be read at 1440 px and below
     ([12](editor-polish-2026-10/12-nodes-default-fit.png),
     [34](editor-polish-2026-10/34-desktop-1024-nodes.png)).
   - This is the first impression of the advanced mode, and it breaks the v0.50
     promise that Nodes fits the graph on entry.
2. **Three visual generations share one screen.**
   - The v0.50 surfaces are disciplined: the inspector rows, the progress bar
     and the confirm dialog.
   - Around them are older styles: the Projects sheet (letter "X" close button,
     two "Create … project" CTAs), the unframed utility-node inspector in Nodes,
     native browser checkboxes and range thumbs, 8–9 px meta text (80 detector
     hits), two token sets, three menu implementations and three
     drop-indicator styles.
   - The editor reads as assembled rather than designed
     ([06](editor-polish-2026-10/06-inspector-text.png),
     [09](editor-polish-2026-10/09-inspector-utility-node-nodes.png),
     [24](editor-polish-2026-10/24-projects-sheet.png)).
3. **On mobile, selecting something hides what you selected it from.**
   - Tapping a layer pushes the list down to one visible row, and the selected
     row goes off-screen
     ([29](editor-polish-2026-10/29-mobile-select-layer.png)).
   - Tapping a tree row replaces the tree with the inspector
     ([32](editor-polish-2026-10/32-mobile-tree-tap-hides-tree.png)).
   - Switching to Nodes with a selection opens Properties over the whole graph
     ([30](editor-polish-2026-10/30-mobile-nodes-props.png)).
   - The two-row command bar sits in the middle of the screen, not in the
     thumb zone.
4. **Feedback lies or goes missing after an action.**
   - The tree status still says "Deleted Badge." after Undo restores Badge
     ([17](editor-polish-2026-10/17-tree-actions-menu-stale-status.png)).
   - The undo-count badge widens the Undo button and pushes the rest of the
     command bar sideways
     ([22](editor-polish-2026-10/22-cmdbar-before.png) →
     [23](editor-polish-2026-10/23-cmdbar-after-undo-badge.png)).
   - Export shows an icon-only spinner, no success message, and a button that
     turns cream afterwards
     ([25](editor-polish-2026-10/25-export-busy.png),
     [26](editor-polish-2026-10/26-export-after-done.png)).
   - A broken `?doc=` link silently loads the default document under a
     "Loaded from docs" banner
     ([05](editor-polish-2026-10/05-docs-banner-on-broken-doc.png)).
   - Numeric entry silently clamps 999 to 100.
5. **Important actions are hidden behind hover, focus or a keyboard.**
   - Tree Delete works only when the row element itself has focus.
   - Effect help ("i") opens only on mouse hover.
   - Row actions are invisible until hover, focus or selection.
   - "Move to…" can be finished only with the keyboard, and its instructions
     cover the last tree row
     ([19](editor-polish-2026-10/19-tree-move-mode-status-overlap.png)).
   - Two hidden file inputs are invisible Tab stops right after the header.
   - Sheets ignore reduced motion.

Overall heuristic score (Nielsen, 0–4 each): **23/40, Acceptable**. The
details are in the Appendix. The specificity verdict is that the chassis
(warm-dark tokens, mono control grammar, category-coloured node rails) is
clearly Artifact. The parts people touch most are still generic leftovers:
native sliders and checkboxes, Unicode ↩ ↪ glyphs, the letter "X" close button,
and system-styled selects.

## 2. Findings

IDs are `EP-nn`. Effort: S (≤½ day), M (1–3 days), L (more). The image
numbers refer to files in `editor-polish-2026-10/`. Source pointers are paths
under `apps/web/app/`.

### Nodes

**EP-01 — Nodes on a custom graph opens with overlapping nodes** · High · M
- Image: [15](editor-polish-2026-10/15-nodes-custom-graph-overlap.png), [16](editor-polish-2026-10/16-edit-in-nodes-overlap.png)
- Repro:
  1. Open the editor with `layersTreeDocument`, which has an empty `graph.positions`.
  2. Switch to Nodes, or choose "Edit in Nodes" on *Glow* in the Layers tree.
- Problem:
  - *Cutout* (mask) is drawn over *Dot* and *Glow*, area frames overlap, and edges run under the cards.
  - Clicking *Glow* hits the *Cutout* thumbnail. Playwright reports that `tree-cutout` intercepts pointer events.
  - "Edit in Nodes" selects Glow but leaves it buried.
- Why it matters: this is the first view of the advanced mode for any graph without saved positions (imported, generated, or authored in Layers). Layers says the graph is fine; Nodes shows a broken one.
- Fix: run the existing auto layout on entry when nodes have no stored position or when card rectangles intersect. "Edit in Nodes" should also center the target node.
- Acceptance: after entering Nodes with `layersTreeDocument` at 1440×900, no two `.react-flow__node` bounding rects intersect, and every node can be clicked (browser test).

**EP-02 — Fit-on-entry makes node headers unreadable** · Medium · M
- Image: [12](editor-polish-2026-10/12-nodes-default-fit.png), [34](editor-polish-2026-10/34-desktop-1024-nodes.png)
- Repro: open the default document and switch to Nodes, at 1440 and at 1024.
- Problem: seven nodes fill the width. Header labels render at roughly 5 px on screen, so node kind and name can't be read until you zoom in.
- Fix: set a minimum zoom for fit (for example the 0.6 zoom at which header text reaches 9 px or more). Center on the output path, and let the remaining nodes overflow with a visible pan hint.
- Acceptance: on entry with the default document at 1024×768, the rendered header font size is ≥ 9 px and the output node is fully in view.

**EP-03 — The Nodes toolbar ships a debug "Metrics" control** · Medium · S
- Image: [12](editor-polish-2026-10/12-nodes-default-fit.png)
- Source: `components/node-canvas/NodeCanvas.tsx:1364-1377`
- Repro: switch to Nodes.
- Problem: a "Metrics" toggle, grouped as "Debug actions" with the title "Show FPS, thumbnail queue, and long-task metrics", is shown to every user. The account button also sits in that "Debug" group.
- Why it matters: it breaks the user-facing copy boundary in CLAUDE.md and adds a fourth toolbar item that does nothing for creative work.
- Fix: gate it behind `?debug` or a dev build, and move the account button to its own group.
- Acceptance: in a production build without `?debug`, the Nodes toolbar has no element labelled Metrics or Debug.

**EP-04 — The Nodes toolbar moves and grows when a node is selected** · Low · S
- Image: [12](editor-polish-2026-10/12-nodes-default-fit.png) → [13](editor-polish-2026-10/13-nodes-selected-toolbar-shift.png)
- Problem: selecting a node opens Properties, and the floating toolbar jumps left and gains a "Create area" button. Controls move under the cursor.
- Fix: anchor the toolbar to the left edge of the canvas, and keep "Create area" in place in a disabled state when nothing is selected.
- Acceptance: the toolbar's left x position and button count are identical before and after selecting a node.

**EP-05 — The utility-node inspector in Nodes is an older layout** · Medium · S
- Image: [09](editor-polish-2026-10/09-inspector-utility-node-nodes.png)
- Repro: in Nodes, select a merge, repeat or mask node (for example *Pattern*).
- Problem: NAME, BLEND and OPACITY sit flush against the panel's left border with no section frame and no padding, unlike every layer target.
- Fix: render utility controls through the same section and row primitives (`inspector-system.css`).
- Acceptance: for every graph utility kind, the first control's left edge equals the left edge of a layer target's first control (browser test).

**EP-06 — Hide is called "Mute" in Nodes** · Low · S
- Source: `NodeShell.tsx:122-125`, `NodeCanvas.tsx:1064`
- Problem:
  - Layers says Hide/Show and "hidden". Nodes says "● Mute" / "○ Muted" for the same `visible` flag.
  - The filled dot means "not muted".
- Fix: use one verb in both modes, a stable label, and `aria-pressed` for the state.
- Acceptance: there is no "Mute" string in the editor UI, and the node visibility button exposes `aria-pressed`.

### Layers tree

**EP-07 — Tree Delete ignores the focused name button** · High · S
- Source: `GraphLayerTreeView.tsx:586-588`. The v0.50.0 notes list this as an accepted risk.
- Repro: click the name of *Badge*, then press Delete.
- Problem: nothing happens, because focus is on the name `<button>` and not on the `treeitem`. A second click on an already-selected name starts a rename instead.
- Fix: resolve the item with `closest('[role="treeitem"]')`, and skip only text inputs.
- Acceptance: clicking a row's name and pressing Delete removes the row as one undo step (browser test).

**EP-08 — The tree status is stale after Undo** · Medium · S
- Image: [17](editor-polish-2026-10/17-tree-actions-menu-stale-status.png)
- Repro: focus *Badge*, press Delete, then Undo.
- Problem: Badge is back, but the notice still reads "Deleted Badge.".
- Fix: clear or replace the tree edit status on any history step that isn't a tree edit ("Undid delete Badge.").
- Acceptance: after Delete and then Undo, `.layer-tree-edit-status` doesn't contain "Deleted".

**EP-09 — "Move to…" mode is keyboard-only and covers the tree** · High · M
- Image: [19](editor-polish-2026-10/19-tree-move-mode-status-overlap.png)
- Source: `useLayerTreeEditing.tsx:136-143`, `layers-panel.css:1922-1930`
- Repro: row actions → Move to….
- Problem:
  - A multi-line instruction box ("Go to a row, then press Enter… Shift+Enter…") appears over the bottom of the tree and covers *Unused fill*.
  - Row clicks and taps don't place the item, and the notice has no Cancel button (`pointer-events: none`).
  - On touch this is a dead end.
- Fix: while moving, give each eligible row "Place above" and "Place below" targets, add a Cancel button, and reserve space for the notice instead of overlaying rows.
- Acceptance: with only pointer or touch input, "Move to…" can move *Dot* above *Badge* and can be cancelled. No tree row is covered by the notice.

**EP-10 — The drop indicator doesn't show nesting depth and has no blocked state** · Medium · S
- Image: [18](editor-polish-2026-10/18-tree-drop-indicator.png)
- Repro: drag *Badge* over the top edge of *Matte*, then over the shared *Backdrop* reference.
- Problem:
  - The indicator is a full-width 2 px line with no indent, so it doesn't show which parent receives the row.
  - Blocked targets look identical to valid ones; the reason appears only after the drop.
  - Tree rows hide the drag grip (`layers-panel.css:1793`), so it isn't clear that rows can be dragged.
  - The stack uses a different indicator (tint, glow and diamond).
- Fix: use one indicator spec for both the stack and the tree. Inset it to the target depth, show a not-allowed state on blocked targets, and keep a grip on movable rows.
- Acceptance: the indicator's left offset equals the target row's indent, and a blocked target sets `data-drop="blocked"` with a not-allowed cursor.

**EP-11 — Tree rows mix two icon languages and use full-height area stripes** · Low · M
- Image: [14](editor-polish-2026-10/14-layers-tree.png)
- Problem:
  - Layer rows have boxed kind icons. Merge, mask, repeat and grade rows have bare 8 px glyphs.
  - Row heights vary between 28, 44 and 48 px.
  - Area membership is a 4 px full-height left stripe, which `editor-visual-system.md` rules out ("tint, not a wide stripe").
  - There is an empty band above "Not in output".
- Fix: one row anatomy (boxed icon slot for every kind) and an area tint or chip instead of the stripe.
- Acceptance: every treeitem has an icon slot of the same size, and no row has a left border wider than 2 px.

**EP-12 — Graph-only rows open a dead-end inspector in Layers** · Medium · S
- Image: [17](editor-polish-2026-10/17-tree-actions-menu-stale-status.png) (right column)
- Problem: selecting *Pattern* in Layers shows "This node's settings are edited in Nodes." with no button.
- Fix: add an "Edit in Nodes" button that runs the existing menu action.
- Acceptance: the utility-target inspector in Layers contains a button that switches to Nodes with that node selected.

**EP-13 — The row actions menu is very tall and Delete isn't separated** · Low · S
- Image: [17](editor-polish-2026-10/17-tree-actions-menu-stale-status.png)
- Problem:
  - Eight 52 px items run over the command bar.
  - Delete sits in the middle of the list.
  - "Add to Type" and "Add to Texture" use a different indent.
  - Disabled "Move down" gives no reason.
- Fix: 36 px desktop items, groups (Move / Area / Edit in Nodes / Delete last) with separators, and a tooltip with the reason on disabled items.
- Acceptance: the menu fits above the command bar at 1440×900 with eight items, and Delete is the last item, after a separator.

**EP-14 — Keyboard shortcuts aren't visible and differ between modes** · Medium · M
- Source: `LayerTreeEditStatus.tsx:13-16` (sr-only help); `NodeContextMenu.tsx` shows ⌘D, M and ⌫.
- Problem:
  - The tree supports Alt+↑/↓, Delete, F2 and Shift+F10, but only screen readers are told.
  - The Layers stack has no Delete key; Nodes does.
  - Menus show shortcut hints in Nodes but not in Layers.
- Fix: one shortcut map for focused rows and nodes, shown as hint columns in both menus.
- Acceptance: Layers and Nodes menus list the same shortcut for Delete, Duplicate and Hide, and each one works in the stack, the tree and Nodes.

### Inspector

**EP-15 — The inspector header repeats itself before the first control** · Medium · M
- Image: [06](editor-polish-2026-10/06-inspector-text.png), [08](editor-polish-2026-10/08-inspector-effect-glitch.png)
- Problem:
  - Six tiers stack before the first control: the eyebrow "LAYERS / EFFECT", the kind ("GLITCH"), the title, the breadcrumb "LAYERS / LAYER 7/8", badges "EFFECT" and "VISIBLE", and a description.
  - Mode, role and kind are each stated two or three times.
  - "Source" is green and "Effect" is accent, so status colours are spent on taxonomy.
  - The text layer is labelled "SOURCE".
- Fix: a two-line header (title plus kind chip). Show badges only for exceptional state (hidden, locked, not in output), and collapse the description into the "i" disclosure.
- Acceptance: for every target kind at 1440×900, the first editable control starts ≤ 96 px below the top of the inspector, and a visible target shows no "Visible" badge.

**EP-16 — Native checkboxes and range thumbs** · Medium · S
- Image: [08](editor-polish-2026-10/08-inspector-effect-glitch.png)
- Source: `inspector.css:450-456`, `:487`
- Problem: Visible and Locked are bright white OS checkboxes in 52 px rows, and sliders use the round browser thumb (`accent-color` only). DESIGN.md specifies a rectangular mixing-desk thumb on a 3 px track.
- Fix: style `::-webkit-slider-thumb` and `::-moz-range-thumb` to the spec, and use a token-styled switch for the booleans.
- Acceptance: in Chromium and WebKit, the computed thumb `border-radius` is 0 and the checkbox `appearance` is `none`.

**EP-17 — Effect help ("i") can only be opened with a mouse** · Medium · S
- Image: [28](editor-polish-2026-10/28-info-popup-hover.png)
- Source: `node-canvas/inspector/fields/InspectorSlider.tsx:80-83`
- Repro: Tab to "About Intensity" and press Enter. Nothing opens.
- Problem: the popup opens only on `mouseenter`. When it does open, it covers the slider it explains.
- Fix: toggle it on click or Enter, close it on Escape, and place it to the side of the row (Popover).
- Acceptance: keyboard Enter on an "About …" button opens the popup, Escape closes it, and the popup doesn't overlap its own row.

**EP-18 — Numeric entry clamps silently** · Low · S
- Repro: Rays → Intensity field, type 999, press Enter → 100.
- Problem: there's no feedback. The Rays description says to "push beyond the slider" with the manual field, which is true for Count but not for Intensity.
- Fix: briefly show "Max 100" next to the field when a value is clamped, and make the description specific to the control.
- Acceptance: entering an out-of-range value shows a visible message naming the limit for at least 1.5 s.

**EP-19 — The AI-gated block uses error styling** · Low · S
- Image: [07](editor-polish-2026-10/07-inspector-image-ai-gate.png)
- Problem: "ACCOUNT REQUIRED FOR AI / SIGN IN TO CREATE WITH AI." is drawn as a red error box on every image layer for signed-out users.
- Fix: a neutral notice with a "Sign in" button.
- Acceptance: the gate notice uses the neutral or info tone and includes a sign-in button.

**EP-20 — Labels are truncated at 1024 px, and the inspector clips its right border** · Low · S
- Image: [34](editor-polish-2026-10/34-desktop-1024-nodes.png) ("INTENSI…"), [06](editor-polish-2026-10/06-inspector-text.png)
- Problem: the label column truncates at narrow desktop widths. Section frames extend past the panel, so the right border is cut off at 1440.
- Fix: a minimum label column width with wrapping, and contain section frames inside the panel padding.
- Acceptance: at 1024×768 no inspector label has `text-overflow` active, and section frames' `right` ≤ the panel's `right`.

### Command bar, header and dialogs

**EP-21 — The undo-count badge shifts the command bar** · Medium · S
- Image: [22](editor-polish-2026-10/22-cmdbar-before.png) → [23](editor-polish-2026-10/23-cmdbar-after-undo-badge.png)
- Problem: after the first edit the Undo button gains a "1" badge and RANDOM, OPEN and SHARE move about 20 px right. This undoes the v0.50 "fixed zones" work.
- Fix: drop the badge, or reserve its width.
- Acceptance: the x positions of the command bar buttons are identical before and after the first edit (add this to the `ux:gate` layout-shift checks).

**EP-22 — Export gives no visible progress text or success, and its settings aren't in Layers** · High · M
- Image: [25](editor-polish-2026-10/25-export-busy.png), [26](editor-polish-2026-10/26-export-after-done.png)
- Source: `hooks/useEditorExport.ts:38` (the error clears after 5 s), `ExportInspector.tsx` (Nodes only)
- Problem:
  - The busy state is a spinner and "…" with no word.
  - Completion has no confirmation, and the button stays cream (focus styling) afterwards.
  - Errors disappear after 5 s.
  - Format, scale and target can only be set from the Nodes Output inspector, so a Layers user exports without seeing what will be written.
- Fix:
  - v0.50.1: "Exporting…" text, an "Exported cover-…png" status, persistent errors with Retry, and a fixed focus colour.
  - Later: an export popover on EXPORT with format, scale and target.
- Acceptance (patch): after an export a status region announces the file name, and an export error stays until dismissed.

**EP-23 — The destructive confirm styles Delete the same as Cancel** · Low · S
- Image: [20](editor-polish-2026-10/20-dialog-shared-delete.png) vs [21](editor-polish-2026-10/21-dialog-new-project.png)
- Problem:
  - In "Create new project?" the confirm button is filled; in "Delete shared Backdrop?" both buttons are outlines.
  - The body text is hard to parse: "Each of those places will use what was under it instead, so that source becomes shared."
  - `--state-danger` and the accent are almost the same red.
- Fix: one confirm spec (danger button style for destructive actions) and copy like "Backdrop is used in 2 places. Deleting it reconnects each place to the layer below it. You can undo this."
- Acceptance: every `EditorConfirmDialog` with a destructive action renders its confirm button with the danger variant, and the danger and accent tokens differ by ≥ 10° hue or ≥ 6 L.

**EP-24 — The Projects sheet is an older generation and has two confusing CTAs** · Medium · S
- Image: [24](editor-polish-2026-10/24-projects-sheet.png)
- Problem:
  - "CREATE PROJECT" (filled) and "CREATE NEW PROJECT" (outline) sit 200 px apart and do different things (save the current canvas vs start a blank one).
  - The close button is the letter "X".
  - The title is 10 px accent text with 0.25em tracking.
  - The placeholder reads "Name this project...".
  - Status rows are 8 px.
- Fix: rename the actions to "Save current canvas" and "New blank canvas", use the shared sheet header, an × icon button, and "…".
- Acceptance: no two buttons in the sheet start with "Create", and the close button has an icon with the accessible name "Close projects".

**EP-25 — The "Loaded from docs" banner shows for any `?doc` link, including broken ones** · Medium · S
- Image: [05](editor-polish-2026-10/05-docs-banner-on-broken-doc.png)
- Source: `routes/editor.tsx:545`
- Repro: open `/app?doc=%7Bbroken`.
- Problem:
  - Invalid JSON loads the default document silently, under a banner saying it came from docs.
  - Valid shared links also get "Loaded from docs".
  - The banner adds a 62 px layout shift on load.
- Fix:
  - Show "This link's document couldn't be read. Showing the default canvas." for parse failures.
  - Show a neutral "Opened from link" otherwise.
  - Reserve the banner's space or overlay it.
- Acceptance: a malformed `?doc` shows an error notice that names the problem, and no "Loaded from docs" text appears for non-docs links.

**EP-26 — Hidden file inputs are invisible Tab stops** · Medium · S
- Repro: load `/app` and press Tab 3–4 times.
- Problem: focus lands twice on `input.sr-only[type=file]` (1×1 px at −1,−1) with no visible focus, right after the header.
- Fix: add `tabIndex={-1}` (the inputs are opened by the OPEN and Add image buttons).
- Acceptance: none of the first 10 Tab stops is a hidden element.

**EP-27 — Tab order puts the command bar before the layers, with 3 stops per row** · Low · M
- Problem:
  - DOM order is header → command bar → layers → inspector.
  - Each stack row is three Tab stops (sr-only select checkbox, drag handle, name), so six layers take 18 stops before the inspector.
  - Drag handles and names have no outline (`outline: none`), and the name focus is only an underline.
- Fix: roving tabindex for the stack (as the tree already does), a visible focus ring on the row, and a "skip to inspector" landmark.
- Acceptance: the stack is one Tab stop with arrow-key movement, and every focused editor control has a non-`none` outline or a ring distinct from hover.

**EP-28 — Glyph icons and inconsistent overflow and close glyphs** · Low · S
- Image: [22](editor-polish-2026-10/22-cmdbar-before.png)
- Problem: undo and redo are Unicode ↩ ↪ at about 8 px. Overflow is "•••" on rows, "…" in Projects and "MORE" in the bar. Close is "×", "X" or "x".
- Fix: SVG icons from one set, and one overflow and one close glyph.
- Acceptance: no Unicode arrow characters are used as button content in the editor.

### Empty, error and first-open states

**EP-29 — The empty canvas shows four competing empty states and two primary CTAs** · Medium · M
- Image: [04](editor-polish-2026-10/04-empty-document.png)
- Problem:
  - Layers says "NO LAYERS YET".
  - The canvas card says "START WITH A TEXT LAYER" with a filled ADD TEXT button.
  - Below it, "CHOOSE A SOURCE" has a filled IMAGE button plus TEXT, AI and 5 recipe buttons, and overlaps the canvas edge.
  - The inspector says "NO LAYER SELECTED".
  - That's ten actions and two filled buttons.
- Fix: one start surface: a single chooser with one recommended action. The side panels go quiet.
- Acceptance: the empty document shows exactly one filled button and one empty-state heading.

**EP-30 — "No layer selected" floats in the middle of an empty column** · Low · S
- Image: [01](editor-polish-2026-10/01-desktop-first-open.png), [02](editor-polish-2026-10/02-tablet-768-first-open.png)
- Problem:
  - The reserved inspector column shows a vertically centred heavy card (display font at 28 px).
  - The card's right border touches the viewport at 1024, and its left border touches the viewport at 768.
  - It is the loudest element on the screen when nothing is happening.
- Fix: a small top-aligned hint in the panel's meta style, or the document-level settings (aspect, background, export) as the "nothing selected" inspector.
- Acceptance: with nothing selected, the inspector's largest text is ≤ 13 px, and the hint sits within the panel padding at all widths.

**EP-31 — The canvas error state is a dead end** · Medium · S (source review)
- Source: `routes/editor.tsx:79-101`, `components/ErrorBoundary.tsx`
- Problem: "Canvas error: could not render layers." in 11 px inline style, with no action. The boundary has no reset keys, so Undo doesn't recover.
- Fix: reset on doc or history change, and offer Undo and Retry.
- Acceptance: a thrown render error followed by Undo restores the canvas without a reload.

### Add Library

**EP-32 — Add Library chrome: double focus ring, clipped tabs, a tiny search icon** · Low · S
- Image: [10](editor-polish-2026-10/10-add-library-open.png), [11](editor-polish-2026-10/11-add-library-search.png), [31](editor-polish-2026-10/31-mobile-add-library.png)
- Problem:
  - The search field draws both an outer focus box and an inner one.
  - The category row clips "3D" at its right edge.
  - The ⌕ glyph is about 8 px.
  - Descriptions are 8–9 px.
  - On mobile, two rows look highlighted (active and hover), and the panel isn't a sheet.
  - The search auto-focuses on open, which raises the keyboard on phones.
- Fix: one focus ring (`:focus-within` on the wrapper only), wrap or scroll the filter row, a 10 px minimum text size, and no auto-focus on coarse pointers.
- Acceptance: at 1440 every filter chip is fully visible, and on a 375 px touch device opening Add Library doesn't focus an input.

### Mobile

**EP-33 — Selecting on mobile hides the list you selected from** · High · L
- Image: [29](editor-polish-2026-10/29-mobile-select-layer.png), [32](editor-polish-2026-10/32-mobile-tree-tap-hides-tree.png), [36](editor-polish-2026-10/36-mobile-tree.png)
- Repro: at 375×812, tap *Rays* (stack) or *Headline* (tree).
- Problem:
  - The inspector is inserted below the panel header.
  - The stack keeps one visible row (*RGB Split*), so the selected row is off-screen.
  - In the tree the inspector replaces the visible tree.
  - There's no visible "back to layers" control in the first viewport.
- Why it matters: PRODUCT.md promises mobile focused edits. Today every edit costs you your place.
- Fix: needs a mobile task-flow direction. For example, the inspector as a bottom sheet with a peek height, keeping the selected row visible above it.
- Acceptance: after tapping any row at 375×812, the selected row and at least one inspector control are both in the viewport.

**EP-34 — Mobile Nodes opens Properties over the whole graph** · Medium · M
- Image: [30](editor-polish-2026-10/30-mobile-nodes-props.png)
- Repro: select a layer, then switch to Nodes at 375 px.
- Problem: the Properties panel fills the screen below the toolbar, and no node is visible.
- Fix: on mobile, don't carry the selection into an open Properties panel. Open it as a dismissible sheet on an explicit tap.
- Acceptance: switching to Nodes at 375×812 shows at least one node in the viewport.

**EP-35 — The mobile command bar sits mid-screen** · Low · M
- Image: [03](editor-polish-2026-10/03-mobile-375-first-open.png)
- Problem:
  - The two-row bar sits between canvas and layers at about 380–470 px from the top, outside the thumb zone.
  - Row 1 leaves an empty cell to the right of RANDOM.
  - Labels drop to 10 px (`editor.css:954-1030`).
  - `viewport-fit=cover` is missing (`root.tsx:36`), so the bar's `env(safe-area-inset-bottom)` padding has no effect.
  - `theme-color` is the accent, not the app background.
- Fix: part of the mobile direction (EP-33). In v0.50.1, add `viewport-fit=cover`, set `theme-color` to the app background, and add `color-scheme: dark`.
- Acceptance (patch): the viewport meta contains `viewport-fit=cover`, and `theme-color` equals `--surface-app`.

### Cross-cutting system

**EP-36 — Sheets ignore reduced motion** · Medium · S
- Source: `components/ui/sheet.css:9-69`
- Repro: with `reducedMotion: 'reduce'`, open Projects. `document.getAnimations()` shows the overlay (180 ms) and content (260 ms) animating.
- Fix: add a `prefers-reduced-motion` block to `sheet.css`. Remove the unused `AnimatePresence` wrapper (`routes/editor.tsx:689`), which also trims framer-motion from a bundle at 337.7 of 370 KiB.
- Acceptance: with reduced motion, opening any sheet or dialog produces no running animation longer than 10 ms.

**EP-37 — Text below the type floor** · Medium · M
- Evidence: the detector found 80 `design-system-font-size` hits. Most of the 8–9 px text is in `layers-panel.css` (29), `node-canvas.css` (15), `inspector.css` (8) and `projects-panel.css` (9).
- Problem: tracked caps mono at 8–9 px on warm dark is barely legible (section summaries such as "14 / 0", tree meta, Add Library descriptions, project status).
- Fix: floor at `--type-editor-meta` (10 px) and replace literal px with tokens.
- Acceptance: the detector reports 0 font sizes below 10 px in editor CSS.

**EP-38 — Two token sets, three menu implementations, and stray radii** · Medium · M (source review)
- Evidence:
  - The Tailwind `@theme` colours in `index.css:6-17` duplicate `styles/tokens.css` with different values.
  - Menus are Radix DropdownMenu (BottomBar, Projects), `EditorOverlayFrame` + `MenuItem` (Layers), and `FloatingMenu` with `role="menu"` and no arrow keys (Nodes).
  - There are literal 3 px, 4 px and 999 px radii in `inspector.css` and `effect-info-popup.css`.
  - Raw z-index values (20001, 10000, 400, 300) sit alongside `--z-floating`.
- Fix: point `@theme` at the semantic tokens, use one themed menu primitive, and tokenize radius and z-index.
- Acceptance: `rg "role=\"menu\""` resolves to one component; the detector reports 0 radius and colour drift outside tests; and no raw z-index above 100 remains in editor CSS.

**EP-39 — Leftover copy that breaks the copy boundary** · Low · S
- Source:
  - `utils/editorTargetSummary.ts:177-180`: "…durable locking is reserved for layer-backed targets in v0.28." It is in the DOM for every utility target; the compact header currently hides it.
  - `components/layer-controls/LayerControls.tsx:647`: "Model framing is node-owned. GLB rendering will use the source viewport path as this node matures."
  - `utils/editorGuardrails.ts:29`: "Locked layer targets are protected from delete actions and layer-stack reorder."
  - "..." instead of "…" in `ProjectsPanel.tsx:168`, `fields/FontPicker.tsx:240,263` and `AiShaderInspectorSections.tsx:277`.
  - Loading words without "…" (about 9 strings).
- Fix: product copy ("Utility nodes can't be locked.", "Frame the model on its node in Nodes.", "Locked layers can't be moved or deleted.") and "…" everywhere.
- Acceptance: `rg -n "v0\.[0-9]|\.\.\.\"" apps/web/app/{components,routes,utils} --glob '!*.test.*'` returns no user-visible strings.

**EP-40 — Layer rows have no inline visibility toggle** · Medium · S (source review)
- Source: `LayerRow.tsx:45` declares `onToggleVisible`, but no control renders it. The slash style for a removed eye button is still in `layers-panel.css:556-566`.
- Problem: hide/show, the most common layer action, is two clicks deep in •••.
- Fix: restore an eye toggle (`aria-pressed`, 44 px on coarse pointers) that stays visible on hidden rows.
- Acceptance: every stack and tree layer row exposes a "Hide <name>" or "Show <name>" toggle button.

**EP-41 — Row actions are hidden until hover or selection, with small targets** · Medium · S
- Source: `layers-panel.css:539-574`; tap targets of 18–24 px (`.layer-row-drag-handle`, `.layer-area-*`, the tree caret at 16 px).
- Problem:
  - At 1440 the "Open actions" button has `opacity: 0; visibility: hidden` until hover or focus.
  - On 375 touch it appears only after the row is selected.
  - There's no `(hover: none)` override, unlike Nodes (`node-canvas.css:2989`).
- Fix: show actions on coarse pointers, and give every row control a 44 px hit area under `pointer: coarse`.
- Acceptance: on a 375×812 touch emulation the actions button of an unselected row is visible, and every tree control is ≥ 44×44.

## 3. Triage

### (a) v0.50.1 patch — small, low risk, no new design direction

| ID | Item | Effort |
| --- | --- | --- |
| EP-01 | Auto-layout on Nodes entry when positions are missing or overlapping | M |
| EP-03 | Gate the Metrics/Debug toolbar group | S |
| EP-07 | Tree Delete from a focused name button | S |
| EP-08 | Clear the stale tree status on undo/redo | S |
| EP-12 | "Edit in Nodes" button in the utility inspector in Layers | S |
| EP-17 | Keyboard and click open for effect help | S |
| EP-18 | Visible clamp message on numeric entry | S |
| EP-19 | Neutral AI-gate notice with sign-in | S |
| EP-21 | Remove or reserve the undo badge width | S |
| EP-22 (patch part) | Export busy text, success status, persistent error, focus colour | S |
| EP-23 (copy + variant) | Danger style and clearer shared-delete copy | S |
| EP-24 (labels) | Projects CTA names, × close button, "…" | S |
| EP-25 | Honest `?doc` banner and parse-error notice | S |
| EP-26 | `tabIndex=-1` on hidden file inputs | S |
| EP-35 (meta part) | `viewport-fit=cover`, `theme-color`, `color-scheme: dark` | S |
| EP-36 | Reduced motion in `sheet.css`; drop the unused `AnimatePresence` | S |
| EP-39 | Copy-boundary cleanup and "…" | S |
| EP-41 | Row actions on coarse pointers; 44 px hit areas | S |
| EP-31 | Reset the canvas error boundary on history change | S |

All are behaviour-preserving and need no new visual direction. Each has a
browser- or grep-checkable criterion above. EP-01 is the only M. It restores a
v0.50 promise ("Nodes fits the graph on entry"), so it belongs in the patch
rather than in a polish release.

### (b) Polish release candidates — need a design direction or touch many surfaces

| ID | Item | Why it's not a patch |
| --- | --- | --- |
| EP-02 | Node readability at fit | Zoom policy and the node-card type scale |
| EP-04 | Stable Nodes toolbar | Toolbar layout model |
| EP-05 | Utility inspector on shared primitives | All utility kinds |
| EP-06, EP-14 | One vocabulary and shortcut map for Layers and Nodes | Both modes and their menus |
| EP-10, EP-11, EP-13 | Row anatomy, drop-indicator spec, menu grouping | Stack, tree and Nodes |
| EP-15 | Two-line inspector header; badges only for exceptions | Every target kind |
| EP-16 | Mixing-desk slider and switches | The most-used control everywhere |
| EP-20 | Inspector width and label column at narrow widths | Responsive grid |
| EP-27, EP-28 | Roving focus for the stack, SVG icon set | Shared primitives |
| EP-29, EP-30 | One start surface; a quiet nothing-selected inspector | First-run direction |
| EP-32 | Add Library chrome on shared primitives | Shared with Nodes (`nadd-*`) |
| EP-37, EP-38 | Type floor, token unification, one menu primitive | Design-system wide |
| EP-40 | Inline visibility toggle | Row anatomy |
| EP-22 (popover) | Export settings reachable from Layers | New UI on the primary CTA |
| EP-33, EP-34, EP-35 (layout) | Mobile task flow: inspector sheet, bar placement | Needs a prototype loop |

### (c) Won't do / not worth it now

- **Hiding the React Flow attribution** (visible bottom-right in Nodes). It is
  allowed, but the attribution is small and supports an MIT dependency. Not
  worth it.
- **A light theme.** The product is dark by brand direction (DESIGN.md). This
  isn't a polish item.
- **`Intl.NumberFormat` for inspector numbers and `tabular-nums` everywhere.**
  The mono font already gives fixed-width digits where numbers change. Low
  value.
- **Dangling `aria-controls` on the Layers/Nodes tabs** (Radix tabs without
  `TabsContent`). It is harmless to assistive tech in practice. Fold it into
  EP-38 only if the toggle gets touched anyway.
- **Pixel-perfect visual snapshots for the polish work.** Keep to the
  semantic-state assertions in `editor-visual-system.md`.

## 4. Recommendation

**Ship group (a) as v0.50.1, then insert a narrowed "v0.51 Editor Polish"
before AI-Assisted Creation. Exclude the mobile task-flow redesign from it.**

Group (b) is not one thesis as listed. It contains two:

1. **Convergence:** one control grammar across Layers, Nodes and the inspector.
   This covers EP-02, -04, -05, -06, -10, -11, -13, -14, -15, -16, -20, -27,
   -28, -29, -30, -32, -37, -38 and -40. They share one cause, several UI
   generations rendered side by side. They also share one blast radius: design
   system primitives applied to editor chrome. They can be validated with the
   existing `ux:gate`, detector counts and semantic browser assertions.
2. **Mobile task flow:** EP-33, EP-34 and the layout part of EP-35. This needs
   its own prototype and critique loop. version-planning.md says to split a
   second critique or prototype loop into a separate version, so it stays in
   discovery. The EP-22 export popover also stays out: it is new UI on the
   primary CTA, and the patch already fixes its feedback.

The convergence thesis is worth a release before AI-Assisted Creation. Chat and
Change Previews will add a third mode and a new review surface. If they are
built on today's mix of three menu systems, two token sets and a six-tier
inspector header, the AI surface becomes a fourth UI generation. Converging
first gives Chat one set of primitives to reuse. Two risks to state:

- v0.50's non-goal "no token or visual-system redesign" is lifted only in this
  narrow sense. Tokens are unified, not redesigned.
- The editor JS budget (337.7 of 370 KiB) is the binding constraint. One menu
  primitive and removing framer-motion from the editor route should net
  negative, and the plan should require it.

If the user prefers not to delay AI-Assisted Creation, the fallback is to ship
v0.50.1 and move on, carrying EP-15, EP-16 and EP-38 into the AI plan as
prerequisites for its inspector work.

### Draft v0.51 plan (for adoption into `docs/version-plans/v0.51.md` if accepted)

**Thesis:** every editor surface (Layers stack, Layers tree, Nodes, inspector,
Add Library, dialogs and sheets) uses one control grammar: the same row
anatomy, menus, focus, drop indicators, type floor and target header. Selecting
or editing feels the same whichever mode you're in.

**Primary blast radius:** design system (tokens, shared primitives,
style-guide specimens) applied to editor chrome. Editor workflow semantics
don't change.

**Non-goals**

- No renderer, graph, document schema, persistence, export or thumbnail
  semantic changes. The `rendering.md` parity rules are unchanged.
- No new node kinds, effects, presets or editor capabilities. That includes no
  export popover and no group-into-merge from Layers.
- No mobile task-flow redesign: no bottom-sheet inspector and no command bar
  relocation. That stays in discovery with EP-33 to EP-35.
- No new visual direction. DESIGN.md and the warm-dark mono world stay; this is
  convergence onto them.
- No AI-Assisted Creation scope.
- No new route-level JS above the current contract. The editor route must not
  grow beyond its v0.50.0 size.

**Acceptance criteria**

1. **Type floor.** The Impeccable detector reports 0 `design-system-font-size`
   findings below 10 px in `components/**` and `routes/editor/**` (baseline:
   80 and 13).
2. **One menu primitive.** Layers row menus, the Nodes node and edge menus, the
   command bar More menu and the Projects menus all render through one
   component. Arrow keys, Home/End, type-ahead and Escape pass the same browser
   test in each.
3. **One row anatomy.**
   - Every stack and tree row has a same-size icon slot, an inline visibility
     toggle (`aria-pressed`) and an actions button visible on coarse pointers.
   - No row has a left border wider than 2 px.
   - All row controls are ≥ 44×44 under `pointer: coarse`.
4. **One drop-indicator spec.**
   - Stack and tree insertion lines share the same CSS class.
   - The indicator's left offset equals the target depth.
   - Blocked targets expose `data-drop="blocked"` with a not-allowed cursor.
5. **Target header.**
   - For every target kind in Layers and Nodes, the first editable control
     starts ≤ 96 px below the top of the inspector at 1440×900.
   - A plain visible target shows no status badges.
6. **Shared inspector primitives.** Graph utility targets (merge, mask, repeat,
   colour, transform) render through the same section and row primitives as
   layer targets. A browser test checks that the left edges of the first
   controls match.
7. **Controls.**
   - In Chromium, Firefox and WebKit, range thumbs compute `border-radius: 0`.
   - Boolean controls compute `appearance: none` and expose `role="switch"` or
     a checkbox with a visible focus ring.
8. **Focus.** Every focusable editor control has a focus-visible style distinct
   from hover. A browser sweep compares computed outline or box-shadow on focus
   vs hover for all interactive elements on `/app`, in both modes.
9. **Same words and keys.**
   - Layers and Nodes use Hide/Show (no "Mute").
   - Delete, Duplicate, Hide and Rename have the same shortcut in the stack,
     the tree and Nodes, and both modes' menus show the hints.
10. **Start and idle states.**
    - The empty document shows exactly one filled button and one empty-state
      heading.
    - With nothing selected, the inspector's largest text is ≤ 13 px.
11. **Nodes legibility.**
    - On entry with the default document at 1024×768, node header text renders
      at ≥ 9 px and the output node is fully visible.
    - With the toolbar, selecting a node doesn't change the toolbar's x
      position or button count.
12. **Tokens.**
    - Tailwind `@theme` colours resolve to the semantic tokens.
    - The detector reports 0 colour and radius drift outside tests.
    - No raw z-index above 100 remains in editor CSS.
13. **Gates.**
    - `npm run ux:gate` budgets pass unchanged.
    - The editor route JS is ≤ its v0.50.0 size.
    - `npm run typecheck`, `lint`, `test` and `test:browser` pass.
    - Style-guide specimens exist for the row, menu, header, slider and switch
      primitives.

**Validation path:** the detector counts (criteria 1 and 12), focused
Playwright specs (2–11), the existing `ux:gate` and bundle contract (13), and
one critique run on the release candidate, recorded next to this document.

## Appendix

### Heuristic scores (synthesis of A and the browser pass)

| # | Heuristic | Score | Key issue |
| --- | --- | --- | --- |
| 1 | Visibility of system status | 2 | Stale tree status, no export success, silent clamp, a misleading `?doc` banner |
| 2 | Match with the real world | 2 | "Utility", "Shared", "Mute" vs "Hide", hard-to-read shared-delete copy |
| 3 | User control and freedom | 3 | Undo everywhere and Cancel-first dialogs; Move-to can't be cancelled on touch |
| 4 | Consistency and standards | 2 | Three menu systems, two token sets, three drop styles, older Projects and utility inspectors |
| 5 | Error prevention | 3 | Confirms, blocked reasons and locked guards are good |
| 6 | Recognition rather than recall | 2 | Export settings only in Nodes, sr-only shortcuts, hover-only actions |
| 7 | Flexibility and efficiency | 3 | The tree keyboard model is strong; the stack has no Delete, no shortcut sheet |
| 8 | Aesthetic and minimalist design | 2 | Six-tier header, four empty states, 8–9 px meta |
| 9 | Error recovery | 2 | Canvas error dead end, export error expires after 5 s |
| 10 | Help and documentation | 2 | Effect help is mouse-only; a guide link exists |
| | **Total** | **23/40** | Acceptable |

### What's working (keep)

- The v0.50 primitives (`inspector-system.css`, `editor-workflow.css`) use no
  literal colours or px font sizes. Slider rows have a label, range and numeric
  entry with commit on Enter or blur.
- The preview progress bar renders outside React with no layout shift, and its
  reduced-motion fallback is correct ([27](editor-polish-2026-10/27-slider-drag-progress.png)).
- The Layers tree's ARIA model includes roving focus, type-ahead, F2,
  Shift+F10 and live announcements. `EditorConfirmDialog` focuses Cancel first
  and returns focus to its opener.
- No native `confirm`, `alert` or `prompt` dialogs remain. None fired in any
  scenario.

### Scenarios covered

- First open at four widths.
- The default document; the all-kinds document, selecting text, image, emoji,
  fill, noise, primitive (3D), Glitch and Bloom.
- Slider drag and numeric entry.
- Add Library: open, search, empty search, category filter, Escape.
- Layers → Nodes → Layers.
- Node selection and the inspector.
- The custom graph in the Layers tree: collapse and expand with the keyboard,
  drag reorder (valid and blocked), Move up, Move to…, Edit in Nodes, Delete
  with name focus vs row focus, Undo, and shared-node delete confirmation.
- The New confirmation; Random, which has no confirm on a clean document by
  design.
- The Share and More menus; Projects (empty state); Export busy and done.
- A malformed `?doc`; the empty document.
- A keyboard Tab sweep (first 30 stops); a spot check of accessible names on
  the command bar and rows; reduced motion (sheet animations).

Not covered:

- Projects open and save with existing projects (only the empty state).
- Signed-in AI flows.
- Real screen-reader output (names were checked through the accessibility
  tree only).
- Firefox and WebKit rendering.
- A 3D Scene or environment node graph. The primitive layer was covered;
  Scene/Environment nodes were not set up.

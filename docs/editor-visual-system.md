# Editor Visual System

This document is the implementation contract for editor chrome. `DESIGN.md`
describes the brand direction; this file describes how the generator applies
that direction to daily editing surfaces.

The visual system must not change document semantics, render output, graph
traversal, export behavior, thumbnail scheduling, or primitive camera behavior.
It only governs UI surfaces around the renderable document.

## Token Layers

Editor styling uses three token layers:

| Layer | Location | Responsibility |
| --- | --- | --- |
| Foundation | `apps/web/app/styles/tokens.css` | Warm dark neutrals, text, accent, and raw line values. |
| Semantic | `apps/web/app/styles/tokens.css` and `apps/web/app/index.css` | App surfaces such as workspace, panel, control, line, and text roles. |
| Feature | Feature CSS files such as `node-canvas.css` | Surface-specific roles such as node card background, selected outline, grid dots, and handle colors. |

New editor CSS should prefer semantic or feature tokens over ad hoc OKLCH
values. Add a token when the value describes a reusable role or state. Keep
one-off values local when they are truly tied to a single effect.

## Contrast Rules

The app stays dark, warm, mono, and raw. Contrast should come from tonal steps
and hairline rules, not from a new bright palette.

- The canvas should be the darkest editor surface.
- Panels should sit at least one tonal step above the canvas.
- Resting nodes must separate from the canvas before hover or selection.
- Node headers must read as a different band from the preview/body area.
- Grid dots must stay quieter than resting node borders.
- Selected states may use the accent, but the accent should remain rare and
  load-bearing.
- Muted/hidden states may dim content, but the shape and action target must
  remain legible.

## State Matrix

| State | Required Signal |
| --- | --- |
| Default | Tonal surface difference plus a visible 1px rule. |
| Hover | Slight tonal lift and border lift. No scale or decorative glow. |
| Focus | Keyboard-visible outline with enough offset to avoid merging into the border. |
| Selected | Full outline, not only a top edge or small icon. |
| Dragging | Border lift plus a temporary forward state; commit behavior remains unchanged. |
| Drop target | Clear insertion target, not only cursor position. |
| Disabled | Lower contrast, but label and hit area stay visible. |
| Hidden / muted | Content dims and labels communicate state without relying on color alone. |
| Active toolbar | Pressed state is visible without hover. |

## Component Contracts

### NodeShell

`NodeShell` is a graph object first, a preview frame second. At every zoom level
where node cards are visible, the user should be able to tell where one node
ends and the canvas begins.

- Use `--node-card-*` tokens for the node frame.
- Use a separate header surface token.
- Selected nodes use a full outline through `--editor-selection-outline`.
- Kind color is an indicator, not a broad wash.
- Resting node cards should not use ambient drop shadows.

### LayerRow

Layer rows describe a linear stack, so state should be immediate and compact.

- Selected, hidden, nested, and drop-target rows must expose semantic classes.
- Hidden rows cannot rely only on the visibility icon.
- Drag targets must indicate insertion position.
- Area folder rows may use the area color as a tint, but not as a wide stripe.

### ToolbarButton

Toolbar buttons should behave like hardware controls.

- Default, hover, disabled, focus, and pressed states must be distinct.
- Pressed state should remain visible when the pointer leaves.
- Disabled buttons should not disappear into the canvas.

## Browser Checks

Browser tests should assert semantic visual states, not pixel-perfect snapshots.
Useful checks:

- node card background differs from canvas background;
- node border is stronger than grid dots;
- selected node outline differs from default node outline;
- selected areas and active toolbar controls have non-empty visible state;
- hidden layer rows expose both semantic class and text treatment.

Pixel snapshots should only be added after a tolerance strategy exists for
Canvas, WebGL, and platform font differences.

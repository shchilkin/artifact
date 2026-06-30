---
name: Artifact
description: Browser-based cover and poster editor for musicians and designers who want control over image, type, texture, effects, and export.
colors:
  ink-bg: "oklch(8% 0.012 42)"
  ink-sidebar: "oklch(11% 0.016 42)"
  ink-border: "oklch(24% 0.018 42)"
  ink-rule: "oklch(20% 0.018 42)"
  ash-text: "oklch(80% 0.022 68)"
  ash-dim: "oklch(50% 0.018 68)"
  flare-accent: "oklch(66% 0.16 28)"
  flare-accent-soft: "oklch(66% 0.16 28 / 0.15)"
  node-fill: "oklch(72% 0.18 48)"
  node-image: "oklch(73% 0.15 222)"
  node-text: "oklch(80% 0.08 94)"
  node-emoji: "oklch(72% 0.18 342)"
  node-effect: "oklch(66% 0.18 286)"
  node-primitive: "oklch(72% 0.13 162)"
  node-noise: "oklch(62% 0.05 245)"
  node-array: "oklch(72% 0.11 125)"
  node-merge: "oklch(72% 0.12 165)"
  node-color: "oklch(74% 0.13 210)"
  node-export: "oklch(84% 0.05 88)"
  node-grid-dot: "oklch(34% 0.022 218 / 0.58)"
typography:
  display:
    fontFamily: "Barlow Condensed, sans-serif"
    fontSize: "clamp(2.4rem, 7vw, 5.5rem)"
    fontWeight: 900
    lineHeight: "0.9"
    letterSpacing: "-0.015em"
  hero:
    fontFamily: "Barlow Condensed, sans-serif"
    fontSize: "clamp(3rem, 11vw, 11rem)"
    fontWeight: 900
    lineHeight: "0.86"
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Barlow Condensed, Arial Narrow, Arial, sans-serif"
    fontSize: "0.9rem"
    fontWeight: 500
    lineHeight: "1.35"
    letterSpacing: "0.01em"
  control:
    fontFamily: "ui-monospace, Consolas, Courier New, monospace"
    fontSize: "0.72rem"
    fontWeight: 500
    lineHeight: "1.2"
    letterSpacing: "0.07em"
  label:
    fontFamily: "ui-monospace, Consolas, Courier New, monospace"
    fontSize: "0.7rem"
    fontWeight: 400
    lineHeight: "1.2"
    letterSpacing: "0.1em"
  meta:
    fontFamily: "ui-monospace, Consolas, Courier New, monospace"
    fontSize: "0.65rem"
    fontWeight: 400
    lineHeight: "1.2"
    letterSpacing: "0.08em"
rounded:
  raw: "0"
  control: "3px"
  menu: "4px"
  slider: "5px"
  pill: "9px"
  dot: "50%"
spacing:
  hair: "4px"
  tight: "8px"
  step: "14px"
  block: "24px"
  bay: "clamp(48px, 8vw, 112px)"
components:
  button-cta:
    backgroundColor: "{colors.flare-accent}"
    textColor: "{colors.ink-bg}"
    typography: "{typography.label}"
    rounded: "{rounded.raw}"
    padding: "16px 28px"
  button-cta-hover:
    backgroundColor: "{colors.ash-text}"
    textColor: "{colors.ink-bg}"
  filter-chip:
    backgroundColor: "transparent"
    textColor: "{colors.ash-dim}"
    typography: "{typography.label}"
    rounded: "{rounded.raw}"
    padding: "8px 14px"
    height: "36px"
  filter-chip-active:
    backgroundColor: "{colors.ash-text}"
    textColor: "{colors.ink-bg}"
  tile:
    backgroundColor: "{colors.ink-sidebar}"
    rounded: "{rounded.raw}"
  layer-row:
    backgroundColor: "transparent"
    textColor: "{colors.ash-text}"
    typography: "{typography.body}"
    rounded: "{rounded.raw}"
    padding: "0 12px"
    height: "48px"
  slider-track:
    backgroundColor: "{colors.ink-border}"
    rounded: "{rounded.slider}"
    height: "3px"
---

# Design System: Artifact

## 1. Overview

**Creative North Star: "The Photocopied Zine"**

The interface has the material feel of a print proof: mono labels, square edges,
warm dark surfaces, and raw rules. The screen is dark because the user is in a
bedroom studio at 1am, laptop open, ambient screen-light only, shaping artwork
with intent. Restraint here is not minimalism for safety; it is the chassis of
a mixing board, where every control earns its place. Artifact does not decide
whether the result is clean, elegant, rough, loud, or restrained.

The system rejects three things by name. It rejects the overdesigned dev-tool aesthetic: neon gradients, crypto-bro purple, glowing grids. It rejects generic SaaS neutrality (Canva, Adobe Express): polished, corporate-safe, identity-free. And it rejects any palette someone could guess from the domain alone. The accent color is a warm red-orange, not a tech-blue or a creator-purple, and it is used like a printer's registration mark: rare, deliberate, load-bearing.

This rejection is about feeling, not discipline. Artifact should keep the good
operational habits of mature software: clear information architecture, fast
search, keyboardable menus, stable focus states, accessible contrast, explicit
errors, and consistent controls. What it must not inherit is the visual and
emotional shape of corporate SaaS: neutral dashboards, table-first management
screens, soft generic cards, verbose configuration panels, and admin-like flows
that make art-making feel like account management.

**Key Characteristics:**
- Dark, warm-tinted neutrals (chroma 0.012–0.022, hue 42–68); never pure `#000` or `#fff`
- One accent (`oklch(66% 0.16 28)`), used on ≤10% of any screen
- Crisp geometry by default; square for artwork frames and panels, 2–6px
  radius for controls, menus, inputs, chips, and overlays that need readable
  affordance
- Mono for control grammar and short data; readable sans for prose,
  explanations, dense descriptions, and long inspector copy; condensed display
  for headlines
- Clamp-based fluid spacing; no spacing scale tokens — rhythm comes from contrast between hair (4px) and bay (clamp 48–112px)
- Mobile is first-class; touch targets at 44px minimum

## 2. Colors: The Riso-Print Palette

A dark warm-tinted neutral set with a single saturated accent. The neutrals carry low chroma (0.012–0.022) along the warm 42–68 hue band — they read as paper-going-yellow under tungsten, not as cool digital gray. The accent is the registration mark: a single hot color the eye finds because nothing else competes.

### Primary
- **Flare Accent** (`oklch(66% 0.16 28)`): Active filter chips, CTA fill, current-step progress bar, layer numerals, accent rules. The only saturated color in the system. Treat its rarity as the message.

### Neutral
- **Ink BG** (`oklch(8% 0.012 42)`): The page background and the canvas around the artwork. Warm-tinted dark, never `#000`.
- **Ink Sidebar** (`oklch(11% 0.016 42)`): One step up from BG. Used for the editor sidebar, tile backgrounds, and any surface that needs to read as a panel without a border.
- **Ink Border** (`oklch(24% 0.018 42)`): Hairline rules between sections. Used for borders, dividers, slider tracks.
- **Ink Rule** (`oklch(20% 0.018 42)`): Dashed step separators on the home stage. One notch dimmer than Ink Border.
- **Ash Text** (`oklch(80% 0.022 68)`): Body and headline text. Warm off-white; never `#fff`.
- **Ash Dim** (`oklch(50% 0.018 68)`): Secondary copy, inactive labels, meta lines, body text inside dim states.

### Named Rules

**The Registration-Mark Rule.** The accent is a registration mark, not a brand wash. It appears on ≤10% of any screen — current-step indicator, active chip, primary CTA, layer numerals. If two or more accent uses are within thumb's reach of each other, one is decoration. Remove it.

**The Tinted-Neutral Rule.** Every neutral carries 0.012–0.022 chroma along the 42–68 hue band. Pure gray is forbidden. Pure black is forbidden. Pure white is forbidden. The screen should read as a warm-tinted dark, like newsprint at night.

### Node Category Palette

The node editor has a secondary product palette. These colors are not brand
accents and do not count against the Registration-Mark Rule because they carry
structural information. They identify node category, not emphasis.

- **Fill** (`oklch(72% 0.18 48)`): flat color and wash sources.
- **Image** (`oklch(73% 0.15 222)`): uploaded, generated, or imported bitmap sources.
- **Text** (`oklch(80% 0.08 94)`): typography and text-layer sources.
- **Emoji** (`oklch(72% 0.18 342)`): repeated glyph and symbol sources.
- **Effect** (`oklch(66% 0.18 286)`): transforms that change pixels.
- **Primitive** (`oklch(72% 0.13 162)`): 3D and generated form sources.
- **Noise** (`oklch(62% 0.05 245)`): procedural texture sources.
- **Array** (`oklch(72% 0.11 125)`): repeat, line-field, and pattern structure.
- **Merge** (`oklch(72% 0.12 165)`): compositing utility nodes.
- **Color** (`oklch(74% 0.13 210)`): grading, transform, and environment utilities.
- **Export** (`oklch(84% 0.05 88)`): final output target.

**The Category-Is-Grammar Rule.** Node category color must appear in the node
rail, icon, handle labels, selection border, focus outline, and hover/active
states. Do not replace category color with the global flare accent for selected
nodes. The selected emoji node should be emoji pink; the selected effect node
should be effect violet.

**The Output-Path Rule.** Output-path color is a route marker. It may tint graph
edges and non-selected output-path frames, but it must not erase the category
identity of the node itself.

**The Canvas Grid Rule.** The node canvas grid is an orientation layer, not
background texture. It should be visible at normal zoom on the dark workspace,
but lower contrast than node borders, selected state, and output-path edges.

## 3. Typography

**Display Font:** Barlow Condensed (fallback: `Arial Narrow`, `Impact`, `sans-serif`), weights 700 / 900
**Readable UI Font:** Barlow Condensed (fallback: `Arial Narrow`, `Arial`, `sans-serif`), weights 400 / 500 / 600 / 700 / 900
**Control / Label Font:** System mono (`ui-monospace, Consolas, "Courier New", monospace`)
**Inside the canvas only:** VT323 and Special Elite, loaded for the editor's text-layer presets — never used in UI chrome.

**Character:** Condensed all-caps display headlines paired with a mono control
layer and a readable condensed UI layer. The display gives the work the weight
of a concert poster; the mono keeps commands, ids, badges, and metadata honest
and machine-typed. The readable UI layer keeps layer names, inspector
descriptions, empty states, and recovery copy usable without falling back to
generic OS typography. No webfont body serif anywhere — the project would not
look like itself with one.

### Hierarchy
- **Hero** (900, `clamp(3rem, 11vw, 11rem)`, line-height 0.86, tracking -0.02em): Used once per page, on the landing hero. ALL CAPS.
- **Display** (900, `clamp(2.4rem, 7vw, 5.5rem)`, line-height 0.9, tracking -0.015em): Step titles, section titles, showcase header. ALL CAPS.
- **Body** (500, `0.9–1rem`, line-height 1.3–1.45, tracking 0–0.01em): Barlow Condensed. Help text, route copy, longer descriptions, empty states, layer names, and inspector explanations. Max width ~45–70ch.
- **Control** (500, `0.72rem`, tracking 0.05–0.08em): Mono. Buttons, tabs, menu commands, node labels, inspector field labels, layer kind hints.
- **Label** (500, `0.7rem`, tracking 0.08–0.12em, ALL CAPS): Mono. Eyebrows, filter chips, compact section labels.
- **Meta** (400, `0.65rem`, tracking 0.06–0.1em, ALL CAPS): Mono. Seed numerals, step counters (`07 / 11`), small timestamps.

### Named Rules

**The Mono-As-Control Rule.** Mono is a control language, not a body-copy
blanket. Use it for commands, labels, node names, field keys, ids, meta, and
short values. Do not force mono onto paragraph copy, multi-sentence
descriptions, onboarding text, error recovery, or dense explanatory panels.
Those use the readable sans layer.

**The Caps-And-Tracking Rule.** Small caps need enough tracking to look
intentional, but not so much that every label becomes a cipher. Most editor
labels should live around 0.05–0.1em; reserve 0.12em+ for rare brand/hero
marks, not dense tools. Anything in caps over 2rem can tighten to roughly
−0.015em. Caps without any adjustment read as accidental, but over-tracked
microcopy reads slow.

## 4. Elevation

Layered by default, not ornamental. Depth is conveyed first through tonal
layering of the warm-tinted dark neutrals (BG → workspace → panel → raised
panel), then through hairline 1px rules. Resting cards and panels do not get
soft generic shadows, but floating UI is allowed to lift: menus, popovers,
dialogs, inspectors, command palettes, and dragged/active objects may use a
tight functional shadow or glow when it improves separation.

State may push a surface forward through border weight, category-colored focus
rings, small translates, and active/overlay shadows. That feedback answers
"what is selected, focused, floating, or being dragged" without turning the
product into generic glassy SaaS chrome.

### Named Rules

**The Layered-Tonal Rule.** Resting surfaces are mostly flat. Depth starts with
one-step lightness shifts in the neutrals (8% → 11% → 16% → 24%) and hairline
1px borders. Shadows are reserved for overlays, drag states, focus support, and
selected graph objects where tonal separation alone is not enough.

**The Print-Mark Rule.** When a surface needs to feel framed, use crop / registration marks at the corners (1px lines, 14–18px arms, accent-colored), not a box-shadow. The work is being prepared for print; the chrome should say so.

## 5. Components

### Styling Implementation
- Tailwind is a layout tool first. Use it for route shells, spacing, responsive
  alignment, and small low-state wrappers. Do not let utility strings replace
  Artifact's visual language.
- Reusable controls should become product primitives. Public CTAs, editor
  controls, menus, rows, panels, and future command surfaces should expose
  named components with Artifact tokens and states instead of duplicating class
  strings.
- Complex and art-directed surfaces stay CSS-first: editor chrome, node canvas,
  canvas/renderer frames, thumbnails, showcase walls, and any surface where
  aspect ratio, hover feedback, or visual rhythm is part of the product.
- shadcn/ui may be used for source-owned accessibility primitives, not for
  default style. Candidate primitives must be restyled to Artifact geometry,
  mono control labels, warm dark tokens, hairline rules, and rare accent usage
  before they appear in product UI.
- Do not import shadcn Button or Card as default building blocks. Artifact
  already has public action primitives, and generic card layouts are explicitly
  outside the system unless a repeated item truly needs a frame.

### Buttons
- **Shape:** Compact and crisp. Default radius 2–4px. Use radius 0 only for
  poster-like hero CTAs or framed art surfaces where square geometry is part of
  the composition.
- **Implementation:** Public surface CTAs use `ActionButton` / `ActionLink`
  from `apps/web/app/components/ui/ActionButton.tsx`; shared button styles live
  in `apps/web/app/components/ui/action-button.css`.
- **Primary CTA:** Accent fill (`oklch(66% 0.16 28)`), Ink BG text, padding 16px 28px, mono label tracking 0.14em, ALL CAPS. Hover: invert to Ash Text fill, Ink BG text. No shadow, no scale change.
- **Tertiary / Link:** Underlined mono in Ash Dim, hover lifts to Ash Text. Used for secondary route links and similar.

### Filter Chips
- Future-only on the showcase surface until the wall has enough volume to need
  them. Do not show filters before they reduce real scanning friction.
- **Style:** Low-radius (2–4px), 1px Ink Border, transparent background, Ash Dim mono label, padding 8px 14px, min-height 36px.
- **Hover:** Border lightens to `oklch(40% 0.02 42)`, text lifts to Ash Text.
- **Active:** Inverts to Ash Text background, Ink BG text. The active chip reads as a stamped tag, not a colored pill.

### Tiles (Showcase)
- **Shape:** Square (radius 0). Aspect derived from the artwork (1:1, 4:5, 9:16, 16:9).
- **Background:** Ink Sidebar (`oklch(12% 0.01 42)`) so the cover sits on a matching dark surface, not on the page background.
- **Resting outline:** 1px `oklch(18% 0.012 42)` so tiles separate from BG even when their content is dark.
- **Hover:** Outline lifts to accent, tile translates `-2px` on Y. Easing: `cubic-bezier(0.16, 1, 0.3, 1)` over 220ms.
- **Overlay:** Bottom-anchored gradient revealing seed and CTA on hover; opacity-faded only (no layout animation).

### Cards / Panels
- The system avoids generic cards as a default. Editor panels are flat tonal
  surfaces with hairline borders; landing copy sits in flow with no container.
  Where a panel is needed (sidebar, mobile action bar, inspector group, command
  menu), it is a clear tool surface with a border and small radius only when
  the radius improves touch/readability.
- Nested cards are wrong for Artifact. Do not put a framed card, list, or panel
  around repeated project/showcase cards; make the parent surface a flat band or
  unframed grid. Repeated artwork items may be framed individually when the
  frame helps scanning.
- Project and library surfaces are artwork-first. The cover, texture, or output
  preview leads the tile; metadata and actions support the image instead of
  competing with it.

### Sliders
- Track 3px tall, Ink Border background, accent fill on the active portion,
  9–14px rectangular thumb with a small radius. Used throughout the editor for
  effect parameters. The slider is the chrome the user touches most; it reads
  as analog-mixing-desk, not iOS.

### Layer Row (Editor)
- Compact layer-stack row, 48px height, 1px Ink Border between rows. The row
  uses readable sans for the layer name, mono only for state chips/meta, and a
  26px category token for layer kind. Selected row shows the selected layer's
  category color as a 1px hairline and subtle inset frame (not a stripe — a 1px
  hairline carries the meaning without becoming a band).
- Drag handle is a mono character (`⋮⋮`), accent-colored on hover.

### Node Canvas (Editor)
- **Node frame:** Crisp rectangular housing, warm dark surface,
  category-colored top rail and subtle category-tinted border. Radius should be
  0–4px depending on zoom and readability; the frame is a tool housing, not a
  generic card.
- **Selected node:** Border, focus outline, rail, and first shadow ring resolve
  to the node's category color. Hover may not override selected styling.
- **Output path:** Active output route is visible through edge color, edge
  opacity, and light path tinting on non-selected nodes. A selected output-path
  node still uses its category color for selection.
- **Grid:** Dot grid remains visible enough for positioning. If the grid nearly
  disappears in screenshots, the canvas has failed.
- **Toolbar:** Node commands are one compact control strip. Grouping should
  clarify Build, View, and Debug actions without turning the toolbar into
  floating cards.

### Print / Crop Marks
- **Signature element.** Used at the corners of the home canvas frame and the home hero. 14–18px L-shaped arms, 1px wide, accent-colored. Carry the "this is being prepared for print" voice without becoming decorative chrome.

## 6. Do's and Don'ts

### Do:
- **Do** keep the accent on ≤10% of any screen. Treat it like a registration mark: rare and load-bearing.
- **Do** use mono (`ui-monospace`) for control grammar: UI labels, buttons,
  tabs, node labels, field keys, ids, and meta lines.
- **Do** use readable sans for longer prose, descriptions, onboarding, empty
  states, and any inspector copy that runs beyond a short phrase.
- **Do** use Barlow Condensed 900 for headlines. ALL CAPS, tightened tracking on large sizes (≥2rem → tracking −0.015em).
- **Do** layer depth through tonal shifts in the warm-tinted darks (8% → 11% → 16% → 24%), hairline 1px borders, and restrained overlay shadows when a surface floats.
- **Do** keep geometry crisp. Use square corners for artwork frames, hard
  panels, and print marks; use 2–6px radius for controls, inputs, chips, menus,
  and overlays when it improves affordance.
- **Do** treat the seed number as identity. Display it in mono meta, ALL CAPS, with a `#` prefix.
- **Do** ship a 44px minimum touch target on every interactive element.
- **Do** borrow strong product mechanics from mature SaaS: search, categories,
  keyboard navigation, predictable state, accessibility, and clear error
  recovery.
- **Do** preserve node category colors across layer badges, node rails, handles,
  focus, and selection. Color is how users scan the graph.
- **Do** treat output-path color as route emphasis, separate from category
  color.

### Don't:
- **Don't** use overdesigned dev-tool aesthetics: neon gradients, crypto-bro purple, glowing grid backgrounds, glassmorphism, or stacked decorative effects in the chrome.
- **Don't** ship anything that reads as generic "modern" SaaS: Canva-flat, Adobe-Express-friendly, identity-free.
- **Don't** let useful SaaS mechanics become admin chrome: table-first
  management screens, soft generic cards, verbose setup copy, or neutral
  dashboards.
- **Don't** use a palette someone could guess from the domain alone. The accent is intentionally not crypto-purple, not tech-blue, not creator-purple.
- **Don't** use side-stripe borders (`border-left` > 1px as a colored accent). Selected layer rows use a 1px hairline, not a 2–4px stripe.
- **Don't** use gradient text (`background-clip: text` over a gradient). Emphasis is by weight, scale, and ALL CAPS — never by gradient.
- **Don't** put soft generic drop shadows on resting surfaces. Use tonal
  layering and 1px borders first; reserve shadows for overlays, focus support,
  selected nodes, and drag states.
- **Don't** mix display into UI chrome (buttons, labels). Display is reserved
  for headlines.
- **Don't** force mono onto long reading text. Mono is the control layer, not
  the product's paragraph voice.
- **Don't** use `#000` or `#fff`. Every neutral carries 0.012–0.022 chroma along the warm 42–68 hue band.
- **Don't** modal a flow that fits inline. A modal is the lazy answer; the editor opens as a route, public editor CTAs start blank, and showcase tiles deep-link their editable project into the editor.
- **Don't** call Artifact a generator in public product copy. "Generate" is reserved for specific source-making actions: AI images, procedural textures, random seeds, and thumbnails. The product, workspace, route labels, and CTAs are "editor", "workspace", "open in editor", or "start editing".
- **Don't** use the word `weird` in product or marketing copy. Do not replace it with broad outcome labels like strange, raw, damaged, or glitchy at the product-promise level. Prefer control and process language: editable, shaped, layered, textured, local-first, export-ready, deliberate.
- **Don't** collapse node selection, focus, and output-path emphasis into the
  global flare accent. A single red frame across all node types destroys the
  graph grammar.
- **Don't** dim the node grid so far that it becomes invisible at normal zoom.

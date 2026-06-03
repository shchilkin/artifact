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
    fontFamily: "ui-monospace, Consolas, Courier New, monospace"
    fontSize: "clamp(0.9rem, 1.05vw, 1rem)"
    fontWeight: 400
    lineHeight: "1.6"
    letterSpacing: "0"
  label:
    fontFamily: "ui-monospace, Consolas, Courier New, monospace"
    fontSize: "0.7rem"
    fontWeight: 400
    lineHeight: "1.2"
    letterSpacing: "0.18em"
  meta:
    fontFamily: "ui-monospace, Consolas, Courier New, monospace"
    fontSize: "0.65rem"
    fontWeight: 400
    lineHeight: "1.2"
    letterSpacing: "0.14em"
rounded:
  raw: "0"
  hairline: "2px"
  slider: "4px"
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
    typography: "{typography.label}"
    rounded: "{rounded.raw}"
    padding: "8px 10px"
    height: "36px"
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
- Square corners by default; small radii (2–9px) reserved for native form affordances (sliders, sortable rows)
- Mono for UI text, condensed display for headlines; no body serif anywhere
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

## 3. Typography

**Display Font:** Barlow Condensed (fallback: `sans-serif`), weights 700 / 900
**Body / Label Font:** System mono (`ui-monospace, Consolas, "Courier New", monospace`)
**Inside the canvas only:** VT323 and Special Elite, loaded for the editor's text-layer presets — never used in UI chrome.

**Character:** Condensed all-caps display headlines paired with a system mono UI. The display gives the work the weight of a concert poster; the mono keeps the chrome honest, fast, and machine-typed. No webfont body serif anywhere — the project would not look like itself with one.

### Hierarchy
- **Hero** (900, `clamp(3rem, 11vw, 11rem)`, line-height 0.86, tracking -0.02em): Used once per page, on the landing hero. ALL CAPS.
- **Display** (900, `clamp(2.4rem, 7vw, 5.5rem)`, line-height 0.9, tracking -0.015em): Step titles, section titles, showcase header. ALL CAPS.
- **Body** (400, `clamp(0.9rem, 1.05vw, 1rem)`, line-height 1.6): Mono. Step bodies, deck copy. Max width ~38–60ch.
- **Label** (400, `0.7rem`, tracking 0.18em, ALL CAPS): Mono. Eyebrows, filter chips, button text, layer kind hints.
- **Meta** (400, `0.65rem`, tracking 0.14em, ALL CAPS): Mono. Seed numerals, step counters (`07 / 11`), small timestamps.

### Named Rules

**The Mono-As-UI Rule.** All UI chrome — buttons, labels, eyebrows, meta, filter chips — uses mono. Display is reserved for headlines. Mixing display in chrome makes the UI shout. Mixing mono in headlines makes the work feel like a terminal print, not a record sleeve.

**The Caps-And-Tracking Rule.** Anything in caps under 1rem must carry letter-spacing ≥ 0.12em. Anything in caps over 2rem must carry tracking −0.015em or tighter. Caps without tracking adjustments read as accidental, not intentional.

## 4. Elevation

Flat by default. Depth is conveyed through tonal layering of the warm-tinted dark neutrals (BG → Sidebar → BG-with-border) and through hairline 1px rules. The system uses no drop shadows for ambient depth.

The one place state pushes a surface forward is the showcase tile on hover: a 2px upward translate plus an accent outline. That motion is feedback, not decoration — it answers "is this clickable" without adding a shadow vocabulary the rest of the system doesn't have.

### Named Rules

**The Flat-Tonal Rule.** Surfaces are flat. Depth comes from one-step lightness shifts in the neutrals (8% → 11% → 24%) and from hairline 1px borders. Drop shadows are forbidden for resting elevation.

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
  default style. Candidate primitives must be restyled to square corners, mono
  labels, warm dark tokens, hairline rules, and rare accent usage before they
  appear in product UI.
- Do not import shadcn Button or Card as default building blocks. Artifact
  already has public action primitives, and generic card layouts are explicitly
  outside the system unless a repeated item truly needs a frame.

### Buttons
- **Shape:** Square (radius 0).
- **Implementation:** Public surface CTAs use `ActionButton` / `ActionLink`
  from `apps/web/app/components/ui/ActionButton.tsx`; shared button styles live
  in `apps/web/app/components/ui/action-button.css`.
- **Primary CTA:** Accent fill (`oklch(66% 0.16 28)`), Ink BG text, padding 16px 28px, mono label tracking 0.14em, ALL CAPS. Hover: invert to Ash Text fill, Ink BG text. No shadow, no scale change.
- **Tertiary / Link:** Underlined mono in Ash Dim, hover lifts to Ash Text. Used for secondary route links and similar.

### Filter Chips
- Future-only on the showcase surface until the wall has enough volume to need
  them. Do not show filters before they reduce real scanning friction.
- **Style:** Square (radius 0), 1px Ink Border, transparent background, Ash Dim mono label, padding 8px 14px, min-height 36px.
- **Hover:** Border lightens to `oklch(40% 0.02 42)`, text lifts to Ash Text.
- **Active:** Inverts to Ash Text background, Ink BG text. The active chip reads as a stamped tag, not a colored pill.

### Tiles (Showcase)
- **Shape:** Square (radius 0). Aspect derived from the artwork (1:1, 4:5, 9:16, 16:9).
- **Background:** Ink Sidebar (`oklch(12% 0.01 42)`) so the cover sits on a matching dark surface, not on the page background.
- **Resting outline:** 1px `oklch(18% 0.012 42)` so tiles separate from BG even when their content is dark.
- **Hover:** Outline lifts to accent, tile translates `-2px` on Y. Easing: `cubic-bezier(0.16, 1, 0.3, 1)` over 220ms.
- **Overlay:** Bottom-anchored gradient revealing seed and CTA on hover; opacity-faded only (no layout animation).

### Cards / Panels
- The system avoids cards as a default. Editor panels are flat surfaces with hairline borders; landing copy sits in flow with no container. Where a panel is needed (sidebar, mobile action bar), it is a flat Ink Sidebar surface separated by a 1px Ink Border, no rounding, no shadow.

### Sliders
- Square track 3px tall, Ink Border background, accent fill on the active portion, 9–14px square thumb. Used throughout the editor for effect parameters. The slider is the chrome the user touches most; it reads as analog-mixing-desk, not iOS.

### Layer Row (Editor)
- Mono label, 8px padding, 36px height, 1px Ink Border between rows. Selected row shows accent left edge as a 1px hairline (not a stripe — a 1px hairline carries the meaning without becoming a band).
- Drag handle is a mono character (`⋮⋮`), accent-colored on hover.

### Print / Crop Marks
- **Signature element.** Used at the corners of the home canvas frame and the home hero. 14–18px L-shaped arms, 1px wide, accent-colored. Carry the "this is being prepared for print" voice without becoming decorative chrome.

## 6. Do's and Don'ts

### Do:
- **Do** keep the accent on ≤10% of any screen. Treat it like a registration mark: rare and load-bearing.
- **Do** use mono (`ui-monospace`) for every UI label, button, eyebrow, and meta line.
- **Do** use Barlow Condensed 900 for headlines. ALL CAPS, tightened tracking on large sizes (≥2rem → tracking −0.015em).
- **Do** layer depth through tonal shifts in the warm-tinted darks (8% → 11% → 24%) and hairline 1px borders.
- **Do** square the corners. Reserve small radii (2–9px) for native form affordances only.
- **Do** treat the seed number as identity. Display it in mono meta, ALL CAPS, with a `#` prefix.
- **Do** ship a 44px minimum touch target on every interactive element.
- **Do** borrow strong product mechanics from mature SaaS: search, categories,
  keyboard navigation, predictable state, accessibility, and clear error
  recovery.

### Don't:
- **Don't** use overdesigned dev-tool aesthetics: neon gradients, crypto-bro purple, glowing grid backgrounds, glassmorphism, or stacked decorative effects in the chrome.
- **Don't** ship anything that reads as generic "modern" SaaS: Canva-flat, Adobe-Express-friendly, identity-free.
- **Don't** let useful SaaS mechanics become admin chrome: table-first
  management screens, soft generic cards, verbose setup copy, or neutral
  dashboards.
- **Don't** use a palette someone could guess from the domain alone. The accent is intentionally not crypto-purple, not tech-blue, not creator-purple.
- **Don't** use side-stripe borders (`border-left` > 1px as a colored accent). Selected layer rows use a 1px hairline, not a 2–4px stripe.
- **Don't** use gradient text (`background-clip: text` over a gradient). Emphasis is by weight, scale, and ALL CAPS — never by gradient.
- **Don't** put drop shadows on resting surfaces. Use tonal layering and 1px borders.
- **Don't** mix display into UI chrome (buttons, labels). Display is reserved for headlines.
- **Don't** use `#000` or `#fff`. Every neutral carries 0.012–0.022 chroma along the warm 42–68 hue band.
- **Don't** modal a flow that fits inline. A modal is the lazy answer; the editor opens as a route, public editor CTAs start blank, and showcase tiles deep-link their editable project into the editor.
- **Don't** call Artifact a generator in public product copy. "Generate" is reserved for specific source-making actions: AI images, procedural textures, random seeds, and thumbnails. The product, workspace, route labels, and CTAs are "editor", "workspace", "open in editor", or "start editing".
- **Don't** use the word `weird` in product or marketing copy. Do not replace it with broad outcome labels like strange, raw, damaged, or glitchy at the product-promise level. Prefer control and process language: editable, shaped, layered, textured, local-first, export-ready, deliberate.
